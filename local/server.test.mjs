import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioServer } from './server.mjs';
import { diskVault } from './auth.mjs';
import { validateEdit } from './inference.mjs';

test('local consent, verified account, plan-powered edit and sign-out',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'apartment-local-test-'));
  const dist=join(dir,'dist'); await mkdir(dist); await writeFile(join(dist,'index.html'),'<title>Apartment</title>');
  await writeFile(join(dist,'package.zip'),'excluded artifact');
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-public',alg:'RS256',use:'sig'};
  const scene={objects:[{id:'sofa',name:'Sofa'}]};
  let current, persisted, signatureNonce, direct=true, inferenceCount=0, revoked=false, streamComplete=true, refreshCount=0;
  const vault={read:()=>persisted && structuredClone(persisted),write:s=>{persisted=structuredClone(s);}};
  const fetcher=async (url,init={})=>{
    const path=new URL(url).pathname;
    if(path==='/api/accounts/oauth/token') {
      assert.equal(init.body.get('client_id'),'oaiapp_fixture');
      if(init.body.get('grant_type')==='refresh_token') {
        refreshCount++; return Response.json({access_token:'rotated',refresh_token:'new-refresh',token_type:'Bearer',expires_in:3600});
      }
      const challenge=createHash('sha256').update(init.body.get('code_verifier')).digest('base64url');
      assert.equal(challenge,current.searchParams.get('code_challenge'));
      assert.equal(init.body.get('redirect_uri'),current.searchParams.get('redirect_uri'));
      const claims={iss:'https://auth.openai.com',aud:'oaiapp_fixture',sub:'fixture-account',email:'person@example.test',
        nonce:signatureNonce || current.searchParams.get('nonce'),exp:Date.now()/1000+900};
      const payload=[{alg:'RS256',kid:jwk.kid},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
      const jwt=payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
      return Response.json({id_token:jwt,access_token:'access',refresh_token:'refresh',token_type:'Bearer',expires_in:1,
        scope:direct?'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct':'openid profile email'});
    }
    if(path==='/.well-known/jwks.json') return Response.json({keys:[jwk]});
    if(path==='/v1/models') {
      assert.equal(init.headers.Authorization,'Bearer rotated');
      return Response.json({models:[{visibility:'hidden',slug:'hidden'},{visibility:'list',slug:'model-from-account'}]});
    }
    if(path==='/v1/responses') {
      inferenceCount++;
      const req=JSON.parse(init.body);
      assert.equal(init.headers.Authorization,'Bearer rotated');
      assert.equal(req.model,'model-from-account'); assert.equal(req.stream,true); assert.equal(req.store,false);
      assert.deepEqual(JSON.parse(req.input[0].content).scene,scene);
      const text=JSON.stringify({message:'I turned the sofa green.',actions:[{type:'color',target:'sofa',color:'#256b48'}]});
      let wire='data: '+JSON.stringify({type:'response.output_text.delta',delta:text})+'\r\n\r\n';
      if(streamComplete) wire+='data: {"type":"response.completed"}\r\n\r\n';
      return new Response(wire,{headers:{'content-type':'text/event-stream'}});
    }
    if(path==='/.well-known/openid-configuration') return Response.json({revocation_endpoint:'https://auth.openai.com/revoke'});
    if(path==='/revoke') {assert.equal(init.body.get('token'),'new-refresh');revoked=true;return new Response('');}
    throw Error('Unexpected fixture route '+path);
  };
  const server=createStudioServer({root:dist,vault,fetcher});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  const first=await fetch(origin+'/');
  assert.equal(first.status,200);
  const cookie=first.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin,'content-type':'application/json'};
  const session=()=>fetch(origin+'/api/session',{headers:{cookie}}).then(r=>r.json());
  const edit=()=>fetch(origin+'/api/edit',{method:'POST',headers,body:JSON.stringify({request:'Make the sofa green',scene,
    selection:{target:'sofa',points:[[0,0,0]]},history:[]})});
  const login=async choice=>{
    const r=await fetch(origin+'/api/login'+(choice?'?account='+choice:''),{headers:{cookie},redirect:'manual'});
    assert.equal(r.status,303);current=new URL(r.headers.get('location'));return current;
  };
  const callback=(state=current.searchParams.get('state'),reg='oaiapp_fixture')=>
    fetch(origin+'/auth/callback?'+new URLSearchParams({state,client_id:reg,code:'one-time'}),{headers:{cookie},redirect:'manual'});
  assert.equal((await session()).connected,false);
  assert.equal((await fetch(origin+'/package.zip')).status,404);
  assert.equal((await fetch(origin+'/api/edit',{method:'POST',headers:{...headers,origin:'https://outside.test'},body:'{}'})).status,403);
  assert.equal((await edit()).status,401);
  await login();
  assert.equal(current.origin,'https://auth.openai.com'); assert.equal(current.searchParams.get('client_id'),'dynamic_agent_client');
  assert.equal(current.searchParams.get('code_challenge_method'),'S256');
  assert.match(current.searchParams.get('ext_agent_host_id'),/^urn:uuid:/);
  assert.equal((await callback('wrong-state')).status,400);
  signatureNonce='wrong-nonce';
  assert.equal((await callback()).status,400);
  assert.equal((await session()).connected,false);
  signatureNonce=undefined;direct=false;
  await login('oaiapp_fixture');
  assert.equal((await callback()).status,200);
  assert.equal((await edit()).status,401);
  assert.equal(inferenceCount,0);
  direct=true;await login('oaiapp_fixture');
  assert.equal((await callback()).status,303);
  assert.equal((await session()).connected,true);
  assert.equal((await session()).email,'person@example.test');
  const result=await edit();
  assert.equal(result.status,200);assert.equal((await result.json()).actions[0].color,'#256b48');
  assert.equal(refreshCount,1);
  streamComplete=false;
  assert.equal((await edit()).status,502);
  const out=await fetch(origin+'/api/logout',{method:'POST',headers});
  assert.equal(out.status,200); assert.ok(revoked); assert.equal((await session()).connected,false);
  assert.equal(persisted.profiles[0].tokens,undefined);
  assert.equal(persisted.profiles[0].client,'oaiapp_fixture');
});

test('editable object and geometry bounds',()=>{
  const scene=[{id:'old',added:false},{id:'new',added:true}];
  const part={shape:'box',center:[.4,.5,.12],size:[.2,.1,.24],color:'#aabbcc'};
  const proposed=actions=>JSON.stringify({message:'Updated.',actions});
  assert.equal(validateEdit(proposed([{type:'build',name:'Perch',parts:[part]}]),scene).actions.length,1);
  assert.throws(()=>validateEdit(proposed([{type:'build',name:'Perch',parts:[{...part,center:[.4,.5,1]}]}]),scene));
  assert.throws(()=>validateEdit(proposed([{type:'remove',target:'old'}]),scene));
  assert.throws(()=>validateEdit(proposed([{type:'color',target:'missing',color:'#ff0000'}]),scene));
  assert.equal(validateEdit(proposed([{type:'remove',target:'new'}]),scene).actions.length,1);
});

test('protected account file survives restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'apartment-vault-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'fixture.dat');
  const vault=diskVault(path);
  const value={host:'synthetic',profiles:[{client:'test-only'}]};
  vault.write(value);assert.deepEqual(diskVault(path).read(),value);
});
