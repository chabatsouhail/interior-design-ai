import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {makeApartment,BASE,ROOMS,roomAt} from './apartment.js';
import {outline} from './spatial.js';

const V=(a)=>new T.Vector3(...a);
export function createViewer({selectionChanged,locationChanged,modeChanged,notice}) {
  const el=document.querySelector('#viewport'),stage=document.querySelector('#stage'),labels=document.querySelector('#roomLabels');
  const gl=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  gl.setPixelRatio(Math.min(window.devicePixelRatio,1.7));gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFSoftShadowMap;
  gl.outputColorSpace=T.SRGBColorSpace;gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.03;el.append(gl.domElement);
  const scene=new T.Scene(),home=makeApartment(),root=home.root;scene.add(root);
  const sky=new T.HemisphereLight(0xfff5de,0xc9c3b5,2.05),sun=new T.DirectionalLight(0xfff2dd,2.28);
  sun.position.set(-1,13,7);sun.target.position.set(5.5,0,3);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-11,right:11,top:10,bottom:-10,near:.5,far:35});sun.shadow.mapSize.set(2048,2048);
  sun.shadow.normalBias=.017;sun.shadow.bias=-.00016;sun.shadow.radius=3;
  scene.add(sun,sun.target,sky);
  const fill=new T.DirectionalLight(0xc0e1e1,.56);fill.position.set(13,7,-8);scene.add(fill);
  // The first bedroom looks onto pale rendered facades, shuttered windows and red parapets.
  const street=new T.Group();scene.add(street);street.visible=false;
  function facade(x,y,z,w,h,d,c) {
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color:c,roughness:.92}));
    m.position.set(x,y,z);street.add(m);
  }
  for(const [x,w,h,c] of [[-6,9,4.7,'#efe3c8'],[1,5,4.3,'#f4e9d5'],[6.4,5.8,3.6,'#e5c683'],[13,7.5,4.1,'#e8e7d5']]){
    facade(x,(h-8)/2,-8,w,h+8,1,c);facade(x,h-.06,-7.35,w+.10,.15,.25,'#ede2d1');
    for(let a=x-w*.32;a<x+w*.44;a+=1.8)for(let y=-3;y<h-.35;y+=2.15){
      facade(a,y,-7.44,.83,.97,.13,'#e4d4bf');facade(a,y,-7.34,.7,.85,.08,'#725947');
      for(let i=0;i<4;i++)facade(a,y-.31+i*.18,-7.288,.7,.026,.02,'#8d7361');
    }
  }
  facade(-.6,4.82,-8.5,3.45,1.3,1.4,'#b96b55');
  const floorShadow=new T.Mesh(new T.PlaneGeometry(180,180),new T.ShadowMaterial({opacity:.16}));
  floorShadow.rotation.x=-Math.PI/2;floorShadow.position.y=-.204;floorShadow.receiveShadow=true;scene.add(floorShadow);
  const walkCamera=new T.PerspectiveCamera(65,1,.025,80),iso=new T.OrthographicCamera(-9,9,7,-7,.04,130);
  walkCamera.rotation.order='YXZ';
  const orbit=new OrbitControls(iso,gl.domElement);orbit.enablePan=false;orbit.enableDamping=true;
  orbit.minPolarAngle=.16;orbit.maxPolarAngle=1.25;orbit.minZoom=.49;orbit.maxZoom=4.5;orbit.zoomSpeed=.85;
  let mode='overview',activeRoom='hall',labelsOn=true,chatOpen=true,dim={...BASE},nodes=[],revision=0;
  let keys=new Set(),shift=false,dirty=true,walkReady=false,dragLook=false,lastPointer=null,cache=[],hit=null;
  let pointer=new T.Vector2(100,100),pointerDown=null,worldScale=new T.Vector3(1,1,1);
  const ray=new T.Raycaster(),center=new T.Vector2(0,0),lineLayer=new T.Group();scene.add(lineLayer);
  const hover=document.querySelector('#hitLabel'),aim=document.querySelector('#aim'),roomEls=[];
  let labelRoomIds=['bed1','kitchen','hall','bed2'];
  for(const id of labelRoomIds){const a=document.createElement('span');a.className='map-name';a.textContent=ROOMS[id].name;labels.append(a);roomEls.push(a);}
  const selectionLine=new T.LineBasicMaterial({color:0xdd5f32,depthTest:true});
  const tint=new T.MeshBasicMaterial({color:0xff965c,transparent:true,opacity:.25,side:T.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const bead=new T.MeshBasicMaterial({color:0xff6739}),dotMat=new T.MeshBasicMaterial({color:0xff4f29});
  const dot=new T.Mesh(new T.SphereGeometry(.012,10,8),dotMat);dot.visible=false;scene.add(dot);
  const nodeGeom=new T.SphereGeometry(.028,12,9);
  const surfaceBox=new T.Box3Helper(new T.Box3(),0x357e65);surfaceBox.visible=false;
  surfaceBox.material.transparent=true;surfaceBox.material.opacity=.69;scene.add(surfaceBox);
  function size(){
    const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;
    gl.setSize(w,h,false);walkCamera.aspect=w/h;walkCamera.updateProjectionMatrix();
    const gap=chatOpen&&w>770?Math.min(w*.27,325):0;
    const width=Math.max(dim.width*1.26,dim.depth*1.7)*w/(w-gap);
    const span=Math.max(width*h/w,Math.max(dim.depth*1.26,dim.height*2.5));
    const full=span*w/h;
    iso.left=-full*(.5-gap/(2*w));iso.right=iso.left+full;
    iso.top=span*.51;iso.bottom=iso.top-span;iso.updateProjectionMatrix();dirty=true;
  }
  function resetOrbit(){
    const target=V([dim.width*.51,dim.height*.34,dim.depth*.5]);
    orbit.target.copy(target);iso.position.copy(target).add(V([8.3,14.4,16.6]));iso.zoom=1;
    iso.updateProjectionMatrix();orbit.update();dirty=true;
  }
  orbit.addEventListener('change',()=>dirty=true);
  function recolor(g,c) {
    if(!g)return;
    g.traverse(m=>{
      if(!m.isMesh||m.userData.accent)return;
      if(!m.userData.customMat){m.material=m.material.clone();m.userData.customMat=true;}
      m.material.color.set(c||m.userData.baseColor);
    });
  }
  function setDesign(state){
    for(const [id,g] of home.objects)if(g.userData.added){root.remove(g);home.objects.delete(id);
      g.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    }
    for(const [id,g] of home.objects)if(!g.userData.added)recolor(g,state.colors[id]);
    for(const add of state.added){
      const g=home.object(add.id,add.name,add.room,{kind:'addition',added:true,removable:true});
      // Parts and their mounting frame are kept in the base model's coordinate system.
      const frame=add.frame;
      const basis=new T.Matrix4().makeBasis(V(frame.u),V(frame.v),V(frame.n));
      g.position.copy(V(frame.base));g.quaternion.setFromRotationMatrix(basis);
      for(const p of add.parts){
        const s=[p.size[0]*frame.width,p.size[1]*frame.height,p.size[2]];
        let geom;
        if(p.shape==='sphere')geom=new T.SphereGeometry(.5,22,14).scale(...s);
        else if(p.shape==='cylinder')geom=new T.CylinderGeometry(.5,.5,1,24).scale(...s);
        else geom=new T.BoxGeometry(...s);
        const m=new T.Mesh(geom,new T.MeshStandardMaterial({color:state.colors[add.id]||p.color,roughness:.69}));
        m.position.set(p.center[0]*frame.width,p.center[1]*frame.height,p.center[2]);m.castShadow=m.receiveShadow=true;
        m.userData={owner:add.id,baseColor:new T.Color(p.color).getHex()};g.add(m);
      }
    }
    setDimensions(state.dimensions);nodes=nodes.filter(a=>home.objects.has(a.id));revision++;
    refreshSelection();dirty=true;
  }
  function setDimensions(d){dim={...BASE,...d};worldScale.set(dim.width/BASE.width,dim.height/BASE.height,dim.depth/BASE.depth);
    root.scale.copy(worldScale);root.updateMatrixWorld(true);size();if(mode==='walk')cacheSolids();}
  function cacheSolids(){
    const shapes=[...home.solids];
    for(const g of home.objects.values())if(g.userData.added)shapes.push(...g.children);
    cache=shapes.filter(m=>m.visible&&m.parent?.visible).map(m=>new T.Box3().setFromObject(m)).filter(b=>b.max.y>.13 && b.min.y<1.72);
  }
  function canStand(x,z){
    const r=.19;
    const xx=x/worldScale.x,zz=z/worldScale.z;
    if(xx<0||xx>BASE.width||zz<0||zz>(xx>6.86?5.22:BASE.depth))return false;
    return !cache.some(b=>{const dx=x-T.MathUtils.clamp(x,b.min.x,b.max.x),dz=z-T.MathUtils.clamp(z,b.min.z,b.max.z);return dx*dx+dz*dz<r*r;});
  }
  function spawn(id){
    const room=ROOMS[id]||ROOMS.hall;let [x,z]=room.entry;x*=worldScale.x;z*=worldScale.z;
    if(!canStand(x,z)){
      const baseX=x,baseZ=z;
      find:for(let d=.15;d<2.6;d+=.15)for(let i=0;i<20;i++){
        const xx=baseX+d*Math.cos(i*Math.PI/10),zz=baseZ+d*Math.sin(i*Math.PI/10);
        if(roomAt(xx/worldScale.x,zz/worldScale.z)===id&&canStand(xx,zz)){x=xx;z=zz;break find;}
      }
    }
    walkCamera.position.set(x,Math.min(1.60,dim.height-.3),z);
    walkCamera.lookAt(room.look[0]*worldScale.x,1.30,room.look[1]*worldScale.z);walkCamera.updateMatrixWorld();walkReady=true;
    activeRoom=id;locationChanged(id);dirty=true;
  }
  function freeMouse(){keys.clear();shift=false;dragLook=false;if(document.pointerLockElement===gl.domElement)document.exitPointerLock();dirty=true;}
  function lock(){
    if(mode!=='walk')return;
    el.focus({preventScroll:true});
    if(document.pointerLockElement===gl.domElement)return;
    try{gl.domElement.requestPointerLock()?.catch(()=>notice('Drag to look around. Use WASD to walk.'));}catch{notice('Drag to look around. Use WASD to walk.');}
  }
  function switchMode(m,id,grab=true){
    if(m==='overview')freeMouse();
    mode=m;orbit.enabled=m==='overview';home.cutaway(m==='overview');
    floorShadow.visible=m==='overview';street.visible=m==='walk';scene.background=m==='walk'?new T.Color('#94c5ed'):null;
    sky.intensity=m==='walk'?2.65:2.05;sun.intensity=m==='walk'?1.5:2.28;
    labels.hidden=m!=='overview'||!labelsOn;stage.classList.toggle('walk-mode',m==='walk');
    aim.hidden=m!=='walk';dot.visible=false;
    if(m==='walk'){cacheSolids();if(id||!walkReady)spawn(id||'hall');if(grab)lock();}
    modeChanged(m,document.pointerLockElement===gl.domElement);refreshSelection();dirty=true;
  }
  const mouse=(e)=>{const r=gl.domElement.getBoundingClientRect();return new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);};
  function firstHit(){
    const cam=mode==='walk'?walkCamera:iso;cam.updateMatrixWorld();
    ray.setFromCamera(mode==='walk'?center:pointer,cam);
    const hits=ray.intersectObject(root,true);
    for(const h of hits){
      let obj=h.object;
      while(obj && obj.visible)obj=obj.parent;
      if(obj||!h.object.userData.owner)continue;
      const local=root.worldToLocal(h.point.clone());
      const relative=new T.Matrix4().copy(root.matrixWorld).invert().multiply(h.object.matrixWorld);
      const normal=h.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(relative));
      return {id:h.object.userData.owner,p:local.toArray(),n:normal.toArray(),world:h.point};
    }
    return null;
  }
  function select(append){
    const h=firstHit();if(!h)return;
    const item={id:h.id,p:h.p,n:h.n};
    if(append&&nodes.length){
      if(nodes.length>=48){notice('This outline already has 48 points.');return;}
      if(V(nodes.at(-1).p).distanceTo(V(h.p))<.02)return;
      if(nodes.length>=3&&V(nodes[0].p).distanceTo(V(h.p))<.04){notice('Outline closed. Press T to describe the edit.');return;}
      nodes.push(item);
    }else nodes=[item];
    refreshSelection();dirty=true;
  }
  function refreshSelection(){
    drawSelection();selectionChanged(nodes,outline(nodes),home.objects.get(nodes[0]?.id));dirty=true;
  }
  function place(p,n,delta=.008){return V(p).addScaledVector(V(n),delta).multiply(worldScale);}
  function drawSelection(){
    for(const child of [...lineLayer.children]){lineLayer.remove(child);if(child.geometry!==nodeGeom)child.geometry?.dispose();}
    surfaceBox.visible=false;
    if(!nodes.length)return;
    if(nodes.length===1){const group=home.objects.get(nodes[0].id);if(group){surfaceBox.box.setFromObject(group);surfaceBox.visible=true;}}
    const positions=nodes.map(a=>place(a.p,a.n));
    positions.forEach(pos=>{const m=new T.Mesh(nodeGeom,bead);m.position.copy(pos);lineLayer.add(m);});
    const f=outline(nodes);
    const path=f?[...positions,positions[0]]:positions.slice();
    if(path.length>1)lineLayer.add(new T.Line(new T.BufferGeometry().setFromPoints(path),selectionLine));
    if(f){
      const poly=f.polygon.map(p=>new T.Vector2(...p)),tri=T.ShapeUtils.triangulateShape(poly,[]);
      const verts=tri.flat().map(i=>place(nodes[i].p,nodes[i].n,.004));
      lineLayer.add(new T.Mesh(new T.BufferGeometry().setFromPoints(verts),tint));
    }
  }
  const live=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),selectionLine);scene.add(live);
  function updateAim(){
    hit=firstHit();dot.visible=!!hit&&(mode==='walk'||shift);
    if(hit)dot.position.copy(place(hit.p,hit.n,.009));
    aim.classList.toggle('empty',!hit);hover.hidden=mode!=='walk'||!hit;
    if(mode==='walk'&&hit)hover.textContent=home.objects.get(hit.id)?.name||'';
    live.visible=!!(shift&&hit&&nodes.length);
    if(live.visible){const a=nodes.at(-1),att=live.geometry.attributes.position;
      const p=place(a.p,a.n),q=place(hit.p,hit.n);
      att.setXYZ(0,p.x,p.y,p.z);att.setXYZ(1,q.x,q.y,q.z);att.needsUpdate=true;live.geometry.computeBoundingSphere();}
  }
  function labelsAt(){
    if(labels.hidden)return;
    labelRoomIds.forEach((id,i)=>{const [x,z]=ROOMS[id].at;const a=V([x,.13,z]).multiply(worldScale).project(iso);
      roomEls[i].style.transform='translate('+((a.x*.5+.5)*el.clientWidth)+'px,'+((-a.y*.5+.5)*el.clientHeight)+'px) translate(-50%,-50%)';});
  }
  function look(dx,dy){walkCamera.rotation.y-=dx*.00225;walkCamera.rotation.x=T.MathUtils.clamp(walkCamera.rotation.x-dy*.00225,-1.49,1.49);dirty=true;}
  gl.domElement.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;pointerDown={x:e.clientX,y:e.clientY};lastPointer=pointerDown;
    pointer=mouse(e);el.focus({preventScroll:true});dragLook=mode==='walk'&&!document.pointerLockElement;
  });
  gl.domElement.addEventListener('pointermove',e=>{
    pointer=mouse(e);
    if(dragLook&&e.buttons===1&&lastPointer)look(e.clientX-lastPointer.x,e.clientY-lastPointer.y);
    lastPointer={x:e.clientX,y:e.clientY};dirty=true;
  });
  gl.domElement.addEventListener('pointerup',e=>{
    if(e.button!==0||!pointerDown)return;
    const moved=Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y);
    if(document.pointerLockElement===gl.domElement||moved<5)select(e.shiftKey);
    pointerDown=null;dragLook=false;
  });
  gl.domElement.addEventListener('pointerleave',()=>{if(mode==='overview'){pointer.set(100,100);dirty=true;}});
  document.addEventListener('mousemove',e=>{if(mode==='walk'&&document.pointerLockElement===gl.domElement)look(e.movementX,e.movementY);});
  document.addEventListener('pointerlockchange',()=>{keys.clear();shift=false;modeChanged(mode,document.pointerLockElement===gl.domElement);dirty=true;});
  function typing(){return !!document.activeElement?.closest('input,textarea,dialog')||!!document.querySelector('dialog[open]');}
  window.addEventListener('keydown',e=>{
    if(typing())return;
    if(e.key==='Shift'){shift=true;dirty=true;}
    if(mode==='walk'&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code)){e.preventDefault();keys.add(e.code);}
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.key==='Shift'){shift=false;dirty=true;}});
  window.addEventListener('blur',()=>{keys.clear();shift=dragLook=false;dirty=true;});
  function move(dt){
    const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    const right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    if((!forward&&!right)||typing())return;
    const y=walkCamera.rotation.y,length=Math.hypot(forward,right),speed=dt*2.15/length;
    const dx=(right*Math.cos(y)-forward*Math.sin(y))*speed,dz=(-forward*Math.cos(y)-right*Math.sin(y))*speed;
    const p=walkCamera.position;
    // Resolve in small steps so low frame rates cannot jump a thin wall.
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.055));
    for(let i=0;i<steps;i++){if(canStand(p.x+dx/steps,p.z))p.x+=dx/steps;if(canStand(p.x,p.z+dz/steps))p.z+=dz/steps;}
    const room=roomAt(p.x/worldScale.x,p.z/worldScale.z);if(room!==activeRoom){activeRoom=room;locationChanged(room);}
    dirty=true;
  }
  let last=performance.now();
  function frame(ms){
    requestAnimationFrame(frame);const dt=Math.min(.1,(ms-last)/1000);last=ms;
    if(mode==='overview')orbit.update();else move(dt);
    if(!dirty)return;
    updateAim();labelsAt();gl.render(scene,mode==='walk'?walkCamera:iso);dirty=false;
  }
  gl.domElement.addEventListener('webglcontextlost',ev=>{ev.preventDefault();notice('Graphics paused. Restoring the apartment view…');});
  gl.domElement.addEventListener('webglcontextrestored',()=>dirty=true);
  new ResizeObserver(size).observe(el);
  home.cutaway(true);size();resetOrbit();requestAnimationFrame(frame);
  return {home,setDesign,freeMouse,lock,switchMode,resetOrbit,get mode(){return mode;},get room(){return activeRoom;},
    get nodes(){return structuredClone(nodes);},get dimensions(){return {...dim};},get revision(){return revision;},
    zoom(k){iso.zoom=T.MathUtils.clamp(iso.zoom*k,.49,4.5);iso.updateProjectionMatrix();dirty=true;},
    setChat(open){chatOpen=open;size();},setLabels(v){labelsOn=v;labels.hidden=mode!=='overview'||!v;dirty=true;},
    clear(){nodes=[];refreshSelection();},unpin(){nodes.pop();refreshSelection();},
    snapshot(){return {nodes,mode,position:walkCamera.position.toArray(),rotation:walkCamera.rotation.toArray().slice(0,3),room:activeRoom};},
    restore(a){if(!a)return;nodes=(a.nodes||[]).filter(n=>home.objects.has(n.id)&&n.p?.length===3&&n.n?.length===3);
      if(a.mode==='walk'&&ROOMS[a.room]){switchMode('walk',a.room,false);if(a.position?.length===3 && canStand(a.position[0],a.position[2])){walkCamera.position.fromArray(a.position);walkCamera.rotation.set(...a.rotation,'YXZ');}}
      refreshSelection();dirty=true;},
    describe(){
      const cut=mode==='overview';if(cut)home.cutaway(false);
      try{
        const rounded=v=>v.toArray().map(n=>Number(n.toFixed(3)));
        const objects=[...home.objects].map(([id,g])=>{
          const bounds=new T.Box3().setFromObject(g),surface=g.children.find(m=>m.isMesh&&!m.userData.accent);
          return {id,name:g.name,room:ROOMS[g.userData.room]?.name,roomId:g.userData.room,kind:g.userData.kind,
            added:!!g.userData.added,color:surface?'#'+surface.material.color.getHexString():undefined,
            bounds:{min:rounded(bounds.min),max:rounded(bounds.max)}};
        });
        return {dimensions:dim,unit:'m',scale:'estimated',axes:'x east, y up, z south',objects};
      }finally{if(cut)home.cutaway(true);}
    },
    spatial(){const f=outline(nodes), data={room:activeRoom,target:nodes[0]?.id,points:nodes.map(a=>({object:a.id,position:V(a.p).multiply(worldScale).toArray(),normal:a.n}))};
      if(f){const w=V(f.u).multiply(worldScale).length()*f.width,h=V(f.v).multiply(worldScale).length()*f.height;
        data.surface={width:w,height:h,polygon:f.polygon,normal:f.n,area:f.area*w*h/(f.width*f.height)};}
      return data;},
    async export(){const {GLTFExporter}=await import('./vendor/GLTFExporter.js');home.cutaway(false);const was=mode==='overview';
      try{return await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});}finally{home.cutaway(was);dirty=true;}}
  };
}
