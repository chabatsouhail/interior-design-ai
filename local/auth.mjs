import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const issuer = 'https://auth.openai.com';
const tokenUrl = issuer + '/api/accounts/oauth/token';
const resource = 'https://api.openai.com/v1';
const directScope = 'chatgpt.tokens.use.direct';
const scopes = 'openid profile email offline_access resource.invoke ' + directScope;
const fresh = () => randomBytes(32).toString('base64url');

export class ServiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const badLogin = () => new ServiceError(400, 'This sign-in could not be verified. Return to the apartment and try again.');

function equalSecret(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') return false;
  const a = Buffer.from(first), b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

// DPAPI binds the saved credentials to this Windows user account. Secret bytes
// travel over anonymous pipes. They never become shell arguments or log lines.
function protectWindows(bytes, encrypt) {
  const operation = encrypt ? 'Protect' : 'Unprotect';
  const script = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Security',
    '$data=[Convert]::FromBase64String([Console]::In.ReadToEnd())',
    '$out=[Security.Cryptography.ProtectedData]::' + operation + '($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($out))'
  ].join(';');
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {
    input:bytes.toString('base64'), encoding:'utf8', windowsHide:true, timeout:20000, maxBuffer:2e6
  });
  if (result.status !== 0) throw new ServiceError(500, 'Windows could not open the private account store for this user.');
  return Buffer.from(result.stdout.trim(), 'base64');
}

export function diskVault(file) {
  return {
    read() {
      if (!existsSync(file)) return null;
      const bytes = readFileSync(file);
      const json = process.platform === 'win32' ? protectWindows(bytes, false) : bytes;
      return JSON.parse(json.toString('utf8'));
    },
    write(value) {
      mkdirSync(dirname(file), { recursive:true, mode:0o700 });
      let bytes = Buffer.from(JSON.stringify(value));
      if (process.platform === 'win32') bytes = protectWindows(bytes, true);
      const temporary = file + '.' + randomUUID() + '.tmp';
      writeFileSync(temporary, bytes, { flag:'wx', mode:0o600 });
      renameSync(temporary, file);
    }
  };
}

async function exchange(fetcher, form) {
  const response = await fetcher(tokenUrl, {
    method:'POST', body:new URLSearchParams(form), signal:AbortSignal.timeout(20000)
  });
  const json = await response.json();
  if (!response.ok) {
    const error = new ServiceError(response.status === 400 || response.status === 401 ? 401 : 502,
      json.error === 'invalid_grant' ? 'This sign-in has expired. Continue with ChatGPT again.' : 'OpenAI could not complete sign-in. Please try again.');
    error.oauthCode = typeof json.error === 'string' ? json.error : '';
    throw error;
  }
  if (typeof json.access_token !== 'string' || String(json.token_type).toLowerCase() !== 'bearer'
      || !(Number(json.expires_in) > 0)) throw badLogin();
  return json;
}

async function verifyIdentity(fetcher, token, client, nonce) {
  if (typeof token !== 'string' || token.length > 50000) throw badLogin();
  const parts = token.split('.');
  if (parts.length !== 3) throw badLogin();
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  } catch { throw badLogin(); }
  const methods = {
    RS256:{type:'RSA',hash:'RSA-SHA256'}, ES256:{type:'EC',hash:'sha256'}
  };
  const method = Object.hasOwn(methods, header.alg) && methods[header.alg];
  if (!method || !header.kid) throw badLogin();
  const response = await fetcher(issuer + '/.well-known/jwks.json', {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new ServiceError(502, 'OpenAI’s identity verification keys are temporarily unavailable.');
  const jwk = (await response.json()).keys?.find(k =>
    k.kid === header.kid && k.kty === method.type && (!k.alg || k.alg === header.alg) && (!k.use || k.use === 'sig'));
  if (!jwk) throw badLogin();
  const key = createPublicKey({key:jwk,format:'jwk'});
  const options = header.alg === 'ES256' ? {key,dsaEncoding:'ieee-p1363'} : key;
  const valid = verify(method.hash, Buffer.from(parts[0]+'.'+parts[1]), options, Buffer.from(parts[2], 'base64url'));
  const now = Date.now()/1000;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== issuer || !aud.includes(client) || (aud.length > 1 && claims.azp !== client)
    || typeof claims.exp !== 'number' || claims.exp < now || (claims.nbf && claims.nbf > now + 30)
    || typeof claims.sub !== 'string' || !claims.sub || !equalSecret(claims.nonce, nonce)) throw badLogin();
  return {sub:claims.sub,email:typeof claims.email === 'string' ? claims.email : ''};
}

function assignedTokens(token, previous = {}) {
  return {
    access:token.access_token, refresh:token.refresh_token || previous.refresh || '',
    idToken:token.id_token || previous.idToken || '', expires:Date.now()+Number(token.expires_in)*1000,
    scopes:typeof token.scope === 'string' ? token.scope.split(/\s+/) : (previous.scopes || [])
  };
}

export function createAuth(vault, fetcher = fetch) {
  // Delay opening the credential store until an account or sign-in is needed.
  let data, pending, renewing, generation = 0;
  const read = () => data ||= vault.read() || {host:'urn:uuid:'+randomUUID(), active:null, profiles:[]};
  const write = () => vault.write(read());
  const profile = () => read().profiles.find(p => p.client === read().active);
  const publicProfiles = () => read().profiles.map(p => ({id:p.client,email:p.email || 'Saved account',active:p.client===read().active}));
  const clear = p => { delete p.tokens; generation++; write(); };
  const status = () => {
    const p = profile();
    return {connected:Boolean(p?.tokens?.access && p.tokens.scopes.includes(directScope)), email:p?.email || '',
      signedIn:Boolean(p?.tokens?.access), accounts:publicProfiles()};
  };

  function login(origin, session, choice) {
    const list = read().profiles;
    const selected = choice === 'new' ? null : choice ? list.find(p=>p.client===choice) : profile();
    if (choice && choice !== 'new' && !selected) throw badLogin();
    const verifier = fresh();
    pending = {state:fresh(), nonce:fresh(), verifier, session, client:selected?.client,
      callback:origin+'/auth/callback', expires:Date.now()+10*60*1000};
    // Persist the installation identifier before the first authorization.
    write();
    const params = new URLSearchParams({
      client_id:selected?.client || 'dynamic_agent_client', ext_agent_host_id:read().host,
      response_type:'code',redirect_uri:pending.callback,scope:scopes,resource,state:pending.state,
      nonce:pending.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')
    });
    if (!selected) params.set('agent_name_hint','Apartment Studio');
    if (selected?.tokens?.idToken) params.set('id_token_hint',selected.tokens.idToken);
    if (selected?.email) params.set('login_hint',selected.email);
    if (selected?.tokens?.access && !selected.tokens.scopes.includes(directScope)) params.set('prompt','consent');
    return issuer + '/api/accounts/authorize?' + params;
  }

  async function callback(query, session) {
    const txn = pending;
    if (!txn || txn.expires < Date.now() || !equalSecret(txn.state,query.get('state')) || !equalSecret(txn.session,session)) throw badLogin();
    pending = null;
    if (query.has('error')) throw new ServiceError(400, 'Sign-in was canceled. You can keep exploring your apartment.');
    const supplied = query.get('client_id');
    const client = supplied || txn.client, code = query.get('code');
    if (!code || !client || client === 'dynamic_agent_client' || client.length > 256 || (txn.client && supplied && supplied !== txn.client)) throw badLogin();
    let p = read().profiles.find(p => p.client === client);
    if (!p) {
      p={client}; read().profiles.push(p); write();
    }
    const token = await exchange(fetcher, {grant_type:'authorization_code',client_id:client,code,
      code_verifier:txn.verifier,redirect_uri:txn.callback,resource});
    const id = await verifyIdentity(fetcher,token.id_token,client,txn.nonce);
    if (p.sub && p.sub !== id.sub) throw badLogin();
    Object.assign(p,id,{tokens:assignedTokens(token)});
    read().active=client;
    generation++;
    write();
    return status();
  }

  async function access() {
    const p = profile();
    if (!p?.tokens?.scopes?.includes(directScope)) throw new ServiceError(401, 'Continue with ChatGPT and allow Apartment Studio to use your plan for this request.');
    if (p.tokens.expires > Date.now()+10000) return p.tokens.access;
    if (!p.tokens.refresh) { clear(p); throw new ServiceError(401, 'Your session expired. Continue with ChatGPT again.'); }
    if (renewing) return renewing;
    const epoch = generation;
    renewing = (async () => {
      try {
        const token = await exchange(fetcher,{grant_type:'refresh_token',client_id:p.client,refresh_token:p.tokens.refresh,resource});
        if (generation !== epoch) throw new ServiceError(409, 'The active account changed. Send the request again.');
        p.tokens=assignedTokens(token,p.tokens); write();
        if (!p.tokens.scopes.includes(directScope)) throw new ServiceError(401, 'ChatGPT plan access needs your permission.');
        return p.tokens.access;
      } catch(e) {
        if (e.oauthCode === 'invalid_grant' && generation === epoch) clear(p);
        throw e;
      } finally { renewing=null; }
    })();
    return renewing;
  }

  async function logout() {
    pending = null;
    const p = profile();
    if (!p?.tokens) return {connected:false};
    const token = p.tokens.refresh;
    clear(p);
    if (!token) return {connected:false};
    try {
      const meta = await fetcher(issuer+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(6000)});
      const endpoint = new URL((await meta.json()).revocation_endpoint);
      if (!meta.ok || endpoint.origin !== issuer) throw Error();
      const revoke = () => fetcher(endpoint,{method:'POST',body:new URLSearchParams({
        token,token_type_hint:'refresh_token',client_id:p.client}),signal:AbortSignal.timeout(6000)});
      let result = await revoke().catch(()=>null);
      if (!result || result.status >= 500) {
        await new Promise(resolve=>setTimeout(resolve,450)); result=await revoke();
      }
      if (!result.ok) throw Error();
      return {connected:false};
    } catch {
      return {connected:false,warning:'Signed out on this computer. You can confirm disconnection in your ChatGPT settings.'};
    }
  }
  return {status,login,callback,access,logout};
}
