import {BASE,ROOMS} from './apartment.js';
import {createViewer} from './viewer.js';
import {applyActions} from './design.js';

const $=id=>document.getElementById(id),storeKey='souhail.apartment.studio.v1';
const base=()=>({dimensions:{...BASE},colors:{},added:[]});
let states=[base()],cursor=0,history=[],connected=false,pending=false,chatOpen=innerWidth>680,viewer,toastTimer;
let labelsOn=true;
function notice(s){$('notice').textContent=s;$('notice').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').hidden=true,4300);}
function persist(){try{localStorage.setItem(storeKey,JSON.stringify({states,cursor,history,labelsOn}));}catch{notice('Browser storage is full. These edits are available in this session.');}}
try{
  const data=JSON.parse(localStorage.getItem(storeKey));
  if(Array.isArray(data?.states)&&data.states.length&&data.states.every(s=>s.dimensions&&s.colors&&Array.isArray(s.added))){
    states=data.states;cursor=Math.max(0,Math.min(data.cursor||0,states.length-1));history=Array.isArray(data.history)?data.history.slice(-40):[];labelsOn=data.labelsOn!==false;
  }
}catch{}
function tools(){ $('undo').disabled=pending||cursor<=0;$('redo').disabled=pending||cursor>=states.length-1;
  $('send').disabled=pending||!$('request').value.trim()||!connected; }
function change(state){
  states=states.slice(0,cursor+1);states.push(state);if(states.length>32)states.shift();cursor=states.length-1;
  viewer.setDesign(state);persist();tools();
}
function step(by){if(pending||cursor+by<0||cursor+by>=states.length)return;cursor+=by;viewer.setDesign(states[cursor]);persist();tools();notice(by<0?'Edit undone.':'Edit restored.');}
function archiveMessage(role,text){history.push({role,text});history=history.slice(-40);renderMessages();persist();}
function renderMessages(){
  $('welcome').hidden=history.length>0;$('messages').replaceChildren();
  for(const h of history.slice(-16)){const el=document.createElement('div');el.className='msg '+h.role;el.textContent=h.text;$('messages').append(el);}
  if(pending){const a=document.createElement('div');a.className='msg assistant';a.textContent='Designing…';$('messages').append(a);}
  $('chatFeed').scrollTop=$('chatFeed').scrollHeight;
}
function selectionChanged(nodes,f,obj){
  $('selectionName').textContent=!nodes.length?'No selection':nodes.length===1?(obj?.name||'Pinned point'):f?(nodes.length+' points · '+(viewer?.spatial().surface?.area??f.area).toFixed(2)+' m²'):(nodes.length+' pinned points');
  $('clear').hidden=!nodes.length;$('unpin').hidden=nodes.length<2;
}
function modeChanged(mode,locked){
  const walking=mode==='walk';
  $('overview').setAttribute('aria-pressed',String(!walking));$('walk').setAttribute('aria-pressed',String(walking));
  $('viewKind').textContent=walking?'FIRST-PERSON VIEW':'CUTAWAY VIEW';$('viewName').textContent=walking?ROOMS[viewer?.room||'hall'].name:'My apartment';
  $('zoomTools').hidden=walking;$('resume').hidden=!walking||locked;
  $('navHint').textContent=walking?'WASD to move · Shift-click to add a point · T to chat · Esc to free mouse':'Drag to orbit · Scroll to zoom · Click to select';
}
function toggleChat(v,focus=false){chatOpen=v;$('chat').hidden=!v;$('openChat').hidden=v;viewer?.setChat(v);
  if(focus){viewer?.freeMouse();$('request').focus();}}
function dialog(title,body){viewer.freeMouse();$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;$('dialog').showModal();}
function openHelp(){
  dialog('Walkthrough controls','<dl><dt>W A S D</dt><dd>Walk forward, left, back, or right.</dd><dt>Mouse</dt><dd>Look around. The orange dot hits the nearest visible surface.</dd><dt>Click</dt><dd>Start a selection on the object under the dot.</dd><dt>Shift + click</dt><dd>Extend the outline. Hold Shift to preview the next segment. Three coplanar points create a filled area.</dd><dt>T</dt><dd>Release the mouse and type in Design chat.</dd><dt>Esc</dt><dd>Free the cursor to use the interface.</dd><dt>Backspace</dt><dd>Undo the last pinned point.</dd></dl><p>In Overview, drag to orbit and scroll to zoom. Use Rooms to enter a specific room.</p>');
}
function settings(){
  const d=states[cursor].dimensions;
  dialog('Model settings','<p>The sketch establishes room connections. Overall dimensions are estimates in meters. Changing them scales the apartment and its contents.</p><form id="dims"><label>Width <input id="width" required type="number" min="6" max="20" step=".01"></label><label>Depth <input id="depth" required type="number" min="4" max="13" step=".01"></label><label>Ceiling height <input id="height" required type="number" min="2.1" max="4.2" step=".01"></label><button class="secondary" type="submit">Apply dimensions</button></form><hr><label>Room labels in overview <input type="checkbox" id="labelSwitch"></label><button type="button" class="secondary" id="export">Export full model (.glb)</button>');
  for(const k of ['width','depth','height'])$(k).value=d[k];
  $('dims').onsubmit=e=>{e.preventDefault();if(pending){notice('Wait for the current edit to finish.');return;}
    const s=structuredClone(states[cursor]);s.dimensions=Object.fromEntries(['width','depth','height'].map(k=>[k,Number($(k).value)]));
    viewer.clear();change(s);viewer.switchMode('overview');viewer.resetOrbit();$('dialog').close();notice('Model dimensions updated.');};
  $('labelSwitch').checked=labelsOn;$('labelSwitch').onchange=e=>{labelsOn=e.target.checked;viewer.setLabels(labelsOn);persist();};
  $('export').onclick=async()=>{const b=$('export');b.disabled=true;b.textContent='Preparing model…';try{
    const bytes=await viewer.export();const url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));
    const a=document.createElement('a');a.href=url;a.download='My-Apartment.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Full model exported.');
  }catch(e){notice('Export failed. '+e.message);}finally{b.disabled=false;b.textContent='Export full model (.glb)';}};
}
async function account(){
  if(location.hostname!=='127.0.0.1'){
    connected=false;$('connection').textContent='ChatGPT · Windows edition';
    $('signIn').href='./Apartment-Studio-Windows.zip';$('signIn').textContent='Download app for AI edits';
    $('signIn').download='Apartment-Studio-Windows.zip';$('signIn').onclick=null;
    $('accountTools').hidden=true;tools();return;
  }
  try{
    const r=await fetch('/api/session',{cache:'no-store'});if(!r.ok)throw Error();
    const a=await r.json();connected=!!a.connected;$('signIn').hidden=connected;
    $('accountTools').hidden=!connected;$('connection').textContent=connected?'Using ChatGPT plan':'ChatGPT';
    $('usage').href=a.usageUrl||'https://chatgpt.com/settings/usage';
  }catch{connected=false;$('connection').textContent='Open with the Windows launcher';$('signIn').hidden=true;$('accountTools').hidden=true;}
  tools();
}
async function submit(e){
  e.preventDefault();const request=$('request').value.trim();if(!request||!connected||pending)return;
  const nodes=viewer.nodes,scene=viewer.describe(),selection=viewer.spatial(),before=states[cursor];
  const prior=history.filter(a=>a.role!=='error').slice(-10);pending=true;archiveMessage('user',request);tools();
  try{
    const r=await fetch('/api/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,selection,scene,history:prior})});
    const data=await r.json();if(!r.ok){if(r.status===401)await account();throw Error(data.error||'The request could not be completed.');}
    if(data.actions.length){
      if(states[cursor]!==before)throw Error('The apartment changed while the request was running. Send it again for the current version.');
      change(applyActions(before,data.actions,nodes,scene));
    }
    if($('request').value.trim()===request)$('request').value='';
    archiveMessage('assistant',data.message);
  }catch(err){archiveMessage('error',err.message||'Could not reach ChatGPT. Your request is still in the composer.');}
  finally{pending=false;renderMessages();tools();}
}
function wire(){
  $('walk').onclick=()=>{viewer.switchMode('walk');if(innerWidth<1020)toggleChat(false);};
  $('overview').onclick=()=>viewer.switchMode('overview');
  $('resume').onclick=()=>viewer.lock();$('zoomIn').onclick=()=>viewer.zoom(1.18);$('zoomOut').onclick=()=>viewer.zoom(1/1.18);
  $('fit').onclick=()=>viewer.resetOrbit();$('undo').onclick=()=>step(-1);$('redo').onclick=()=>step(1);
  $('clear').onclick=()=>viewer.clear();$('unpin').onclick=()=>viewer.unpin();$('help').onclick=openHelp;$('settings').onclick=settings;
  $('dialogClose').onclick=()=>$('dialog').close();$('dialog').onclick=e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}};
  $('rooms').onclick=()=>$('roomList').hidden=!$('roomList').hidden;
  for(const [id,r] of Object.entries(ROOMS)){const button=document.createElement('button');button.textContent=r.name;button.onclick=()=>{$('roomList').hidden=true;viewer.switchMode('walk',id);if(innerWidth<1020)toggleChat(false);};$('roomList').append(button);}
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.view-info'))$('roomList').hidden=true;});
  $('minChat').onclick=()=>toggleChat(false);$('openChat').onclick=()=>toggleChat(true,true);
  $('request').maxLength=4000;$('request').oninput=tools;$('chatForm').onsubmit=submit;
  $('request').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').requestSubmit();}if(e.key==='Escape')$('request').blur();};
  document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('request').value=b.dataset.prompt;tools();$('request').focus();});
  $('logout').onclick=async()=>{try{const r=await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();await account();}catch{notice('Disconnect failed. Please retry.');}};
  $('signIn').onclick=()=>{sessionStorage.setItem('apartment.return',JSON.stringify({camera:viewer.snapshot(),draft:$('request').value}));};
  document.addEventListener('keydown',e=>{
    if(e.target.closest?.('input,textarea,dialog')||$('dialog').open)return;
    if(e.key.toLowerCase()==='t'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();toggleChat(true,true);}
    if(e.key==='Backspace'){e.preventDefault();viewer.unpin();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();step(e.shiftKey?1:-1);}
  });
}
try{
  viewer=createViewer({notice,selectionChanged,modeChanged,locationChanged:id=>{$('viewName').textContent=ROOMS[id].name;}});
  viewer.setDesign(states[cursor]);viewer.setLabels(labelsOn);toggleChat(chatOpen);wire();renderMessages();account();
  const returning=sessionStorage.getItem('apartment.return');
  if(returning){sessionStorage.removeItem('apartment.return');const a=JSON.parse(returning);viewer.restore(a.camera);$('request').value=a.draft||'';toggleChat(true);tools();}
}catch(err){console.error(err);$('fatal').hidden=false;$('fatal').textContent='The 3D view could not start. Open the Windows launcher and use a browser with WebGL 2 enabled. '+err.message;}
