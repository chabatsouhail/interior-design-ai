import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {wood,cloth,metal,paint,stone,tiled,screed} from './materials.js';
import {furnish} from './furnishings.js';

export const BASE={width:11.1,depth:6.16,height:2.75};
export const ROOMS={
  bed1:{name:'First bedroom',at:[1.68,3.1],entry:[2.77,4.72],look:[1.6,1.15]},
  kitchen:{name:'Kitchen',at:[5.22,1.25],entry:[5.76,2.83],look:[4.7,0]},
  bath:{name:'Toilet',at:[4.10,3.04],entry:[4.21,3.06],look:[3.34,2.55]},
  hall:{name:'Hallway',at:[5.13,5.22],entry:[6.28,5.69],look:[4.63,3.95]},
  bed2:{name:'Second bedroom',at:[8.96,2.64],entry:[7.44,4.42],look:[9.01,1.49]}
};
export function roomAt(x,z) {
  if(x<3.32)return 'bed1';
  if(x>6.86)return 'bed2';
  if(z>3.78)return 'hall';
  if(x<4.69 && z>2.34)return 'bath';
  return 'kitchen';
}
const shared = new Map();
function geometry(key,create) {
  if(!shared.has(key))shared.set(key,create());
  return shared.get(key);
}
export function makeApartment() {
  const root=new THREE.Group(), objects=new Map(), solids=[], caps=[], cuts=[];
  root.name='Apartment';
  function object(id,name,room,options={}) {
    if(objects.has(id))return objects.get(id);
    const g=new THREE.Group(); g.name=name;
    g.userData={id,room,kind:'furniture',...options};root.add(g);objects.set(id,g);return g;
  }
  function mesh(g,geom,x,y,z,mat,o={}) {
    const m=new THREE.Mesh(geom,mat);m.position.set(x,y,z);
    if(o.rotation)m.rotation.set(...o.rotation);
    m.castShadow=o.shadow!==false;m.receiveShadow=true;
    m.userData={owner:g.userData.id,accent:!!o.accent};
    m.userData.baseColor=mat.color?.getHex();
    g.add(m);
    if(o.solid!==false)solids.push(m);
    return m;
  }
  function box(g,x,y,z,w,h,d,mat,o={}) {
    const r=Math.min(o.radius||0,w*.47,h*.47,d*.47);
    const key=['b',w,h,d,r].join(',');
    const geom=geometry(key,()=>r?new RoundedBoxGeometry(w,h,d,2,r):new THREE.BoxGeometry(w,h,d));
    return mesh(g,geom,x,y,z,mat,o);
  }
  function ellipsoid(g,x,y,z,w,h,d,mat,o={}) {
    const geom=geometry(['e',w,h,d].join(','),()=>new THREE.SphereGeometry(.5,20,14).scale(w,h,d));
    return mesh(g,geom,x,y,z,mat,o);
  }
  function cylinder(g,x,y,z,r1,r2,h,mat,o={}) {
    const geom=geometry(['c',r1,r2,h].join(','),()=>new THREE.CylinderGeometry(r1,r2,h,24));
    return mesh(g,geom,x,y,z,mat,o);
  }
  const opening={height:2.12}, H=BASE.height, wt=.13;
  const plaster=paint('#f3efe8'), skirting=stone('#beae98');
  const jamb=wood('#957052'),frame=metal('#d5d1c7');
  const glass=new THREE.MeshStandardMaterial({color:'#c2d7db',roughness:.22,metalness:.13,transparent:true,opacity:.40});
  const frost=new THREE.MeshStandardMaterial({color:'#dae6df',roughness:.72,metalness:.06,emissive:'#b6d6d1',emissiveIntensity:.23});
  const archCrowns=[];
  // Runs are measured from the left or north perimeter, in the sketch's axes.
  function wall(id,name,room,axis,k,start,end,gaps=[],cut=.53,material=plaster) {
    const group=object(id,name,room,{kind:'wall'}), along=axis==='x';
    function piece(g,a,b,bottom,top,thick,mat,accent=false,offset=0,solid=true) {
      if(b-a<.002 || top-bottom<.002)return;
      const c=(a+b)/2,y=(bottom+top)/2;
      const m=box(g,along?c:k+offset,y,along?k+offset:c,along?b-a:thick,top-bottom,along?thick:b-a,mat,{accent,solid});
      cuts.push({m,bottom,top,cut});return m;
    }
    function panel(a,b,bottom,top) {
      piece(group,a,b,bottom,top,wt,material);
      const tiledFace=(id==='kitchen-north'||id==='bed1-east')?1:(id==='kitchen-south'||id==='bed2-west')?-1:0;
      if(tiledFace) {
        const finishEnd=along?b:Math.min(b,3.78);
        if(finishEnd>a)piece(group,a,finishEnd,bottom,top,.010,tiled('#f0e9d9',finishEnd-a,top-bottom,.32),false,tiledFace*(wt/2+.005),false);
      }
      if(bottom===0 && !name.toLowerCase().includes('bedroom'))piece(group,a,b,0,.075,wt+.024,skirting,true,0,false);
      if(top===H)piece(group,a,b,H-.055,H,wt+.035,plaster,true,0,false);
      if(bottom<cut && top>cut && cut<H){
        const c=(a+b)/2;
        const cap=box(group,along?c:k,cut+.006,along?k:c,along?b-a:wt+.006,.013,along?wt+.006:b-a,paint('#a49b8b'),{accent:true,solid:false});
        caps.push(cap);
      }
    }
    let cursor=start;
    for(const gap of [...gaps].sort((a,b)=>a.a-b.a)) {
      const {a,b,type}=gap;
      panel(cursor,a,0,H);
      const low=type==='window'?(gap.sill??.95):0, high=type==='window'?2.22:opening.height;
      if(low) panel(a,b,0,low);
      panel(a,b,high,H);
      if(type==='arch') {
        const mid=(a+b)/2,r=(b-a)/2,rise=.32,spring=high-rise;
        const shape=new THREE.Shape();
        shape.moveTo(a,high);shape.lineTo(b,high);shape.lineTo(b,spring);
        shape.absellipse(mid,spring,r,rise,0,Math.PI,false,0);shape.closePath();
        const geom=new THREE.ExtrudeGeometry(shape,{depth:wt,bevelEnabled:false,curveSegments:20});
        const m=mesh(group,geom,along?0:k+wt/2,0,along?k-wt/2:0,plaster,along?{}:{rotation:[0,-Math.PI/2,0]});
        archCrowns.push(m);cursor=b;continue;
      }
      const isGlass=type==='window'||type==='patio';
      const og=object(id+'-'+type+'-'+a,gap.label||(type==='window'?'Window':type==='patio'?'Patio door':'Door frame'),room,{kind:isGlass?'window':'frame'});
      const trim=isGlass?frame:jamb;
      piece(og,a-.032,a+.035,low,high+.044,wt+.054,trim);
      piece(og,b-.035,b+.032,low,high+.044,wt+.054,trim);
      piece(og,a,b,high-.014,high+.044,wt+.054,trim);
      if(isGlass){
        piece(og,a,b,low,low+.048,wt+.04,trim);
        if(type==='patio'){
          piece(og,a+.034,b-.034,.045,1.00,.048,paint('#dadad1'));
          piece(og,a+.034,b-.034,1.00,1.08,wt,trim);
          piece(og,a+.034,b-.034,1.08,high-.03,.027,frost);
          piece(og,a+.07,a+.21,.93,.965,.15,metal('#30342f'),true);
        }else{
          piece(og,a+.027,b-.027,low+.045,high-.025,.025,glass);
          piece(og,(a+b)/2-.025,(a+b)/2+.025,low,high,wt*.93,trim,true);
        }
        if(type==='window')piece(og,a-.075,b+.075,low-.042,low+.005,wt+.20,stone('#dfd8c6'),true);
      } else if(type==='entry') {
        const door=object('entry-door','Entry door','hall',{kind:'door'});
        piece(door,a+.035,b-.035,0,high-.026,.066,wood('#714735'));
        for(const hh of [0.57,1.48])piece(door,a+.13,b-.13,hh-.26,hh+.26,.085,wood('#815943'));
        piece(door,b-.24,b-.08,.99,1.022,.17,metal('#b6a376'),true);
      }
      cursor=b;
    }
    panel(cursor,end,0,H);
  }
  const flooring=[
    ['bed1',0,0,3.32,6.16],['kitchen',3.32,0,6.86,3.78],
    ['hall',3.32,3.78,6.86,6.16],['bed2',6.86,0,11.1,5.22]
  ];
  for(const [id,x0,z0,x1,z1] of flooring) {
    const w=x1-x0,d=z1-z0,x=(x1+x0)/2,z=(z1+z0)/2;
    const floor=object(id+'-floor',ROOMS[id].name+' floor',id,{kind:'floor'});
    box(floor,x,-.105,z,w+.1,.18,d+.1,stone('#9f9988'),{accent:true,solid:false,radius:.025});
    box(floor,x,-.015,z,w,.03,d,id==='bed1'?screed(w,d):tiled('#d7cbb9',w,d),{solid:false});
    const ceil=object(id+'-ceiling',ROOMS[id].name+' ceiling',id,{kind:'ceiling',walkOnly:true});
    box(ceil,x,H+.025,z,w,.05,d,paint('#f5f1eb'),{solid:false,shadow:false});
  }
  wall('bed1-north','Bedroom window wall','bed1','x',0,0,3.32,[{a:1.02,b:2.37,type:'window',sill:1.10}],H);
  wall('kitchen-north','Kitchen patio wall','kitchen','x',0,3.32,6.86,[{a:4.63,b:5.47,type:'patio'}],H);
  wall('bed2-north','Second bedroom window wall','bed2','x',0,6.86,11.1,[{a:8.55,b:9.63,type:'window'}],H);
  wall('bed1-west','West bedroom wall','bed1','z',0,0,6.16,[],1.04);
  wall('bed1-south','South bedroom wall','bed1','x',6.16,0,3.32,[],.36);
  wall('hall-south','South hallway wall','hall','x',6.16,3.32,6.86,[],.36);
  wall('bed2-east','East bedroom wall','bed2','z',11.1,0,5.22,[],.41);
  wall('bed2-south','South bedroom wall','bed2','x',5.22,6.86,11.1,[],.38);
  wall('bed1-east','Bedroom partition','bed1','z',3.32,0,6.16,[{a:4.24,b:5.15,type:'arch'}],.65);
  wall('bed2-west','Second bedroom partition','bed2','z',6.86,0,5.22,[{a:4.24,b:5.18,type:'door',label:'Second bedroom doorway'}],.65);
  wall('hall-east','Entrance wall','hall','z',6.86,5.22,6.16,[{a:5.27,b:6.10,type:'entry',label:'Entrance frame'}],.36);
  wall('kitchen-south','Kitchen doorway wall','kitchen','x',3.78,3.32,6.86,[{a:4.66,b:5.58,type:'door',label:'Kitchen doorway'}],.58);
  wall('bath-north','Toilet partition','bath','x',2.34,3.32,4.69,[],1.12);
  furnish({object,box,ellipsoid,cylinder,wood,cloth,metal,paint,stone});
  function cutaway(yes) {
    for(const g of objects.values())if(g.userData.walkOnly)g.visible=!yes;
    for(const {m,bottom,top,cut} of cuts) {
      const upper=yes?Math.min(top,cut):top;
      m.visible=bottom<upper;
      m.scale.y=Math.max(.0001,(upper-bottom)/(top-bottom));
      m.position.y=(bottom+upper)/2;
    }
    for(const c of caps)c.visible=yes;
    for(const c of archCrowns)c.visible=!yes;
    root.updateMatrixWorld(true);
  }
  return {root,objects,solids,cutaway,object,box,ellipsoid,cylinder};
}
