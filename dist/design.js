import {outline,fitsPart} from './spatial.js';

export function applyActions(design,actions,nodes,scene) {
  const next=structuredClone(design),ids=new Set(scene.objects.map(o=>o.id)),f=outline(nodes);
  for(const action of actions) {
    if(action.type==='color'&&ids.has(action.target)&&/^#[0-9a-f]{6}$/i.test(action.color)){
      next.colors[action.target]=action.color;
    }else if(action.type==='remove'&&next.added.some(a=>a.id===action.target)){
      next.added=next.added.filter(a=>a.id!==action.target);delete next.colors[action.target];ids.delete(action.target);
    }else if(action.type==='build'){
      if(!f)throw Error('Pin at least three points on the same flat surface, in order around the area, then send the request again.');
      if(!Array.isArray(action.parts)||!action.parts.length||action.parts.length>48)throw Error('The proposed object has an invalid set of parts.');
      for(const p of action.parts){
        if(!['box','sphere','cylinder'].includes(p.shape)||!/^#[0-9a-f]{6}$/i.test(p.color)||!Array.isArray(p.center)||!Array.isArray(p.size)||
          p.center.length!==3||p.size.length!==3||!p.center.every(Number.isFinite)||!p.size.every(v=>Number.isFinite(v)&&v>0)||
          p.center[2]-p.size[2]/2<-.00001||p.center[2]+p.size[2]/2>.65001||!fitsPart(p,f.polygon)){
          throw Error('Part of the proposed design extends beyond your outline. Nothing was applied. Ask for a smaller arrangement or adjust the outline.');
        }
      }
      if(next.added.length>=120)throw Error('The apartment contains 120 added objects. Remove an added object before building another.');
      const id='added-'+crypto.randomUUID();
      next.added.push({id,name:action.name,room:scene.objects.find(o=>o.id===nodes[0].id)?.roomId||'hall',frame:f,parts:structuredClone(action.parts)});
      ids.add(id);
    }else throw Error('This edit refers to an object that is no longer in the scene. Select it again and retry.');
  }
  return next;
}
