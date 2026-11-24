import * as THREE from 'three';

// Small, tileable materials generated in the browser keep the walkthrough offline.
const cache = new Map();
function random(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function pattern(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rng = random(2319);
  const pixels = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = 4 * (256*y+x);
    const grain = Math.sin(y * .89 + Math.sin(x * .024) * 1.4);
    const coarse = Math.sin(y*.096 + Math.sin(x*.012)*.9);
    let shade = 247 + 7*rng();
    if (kind === 'wood') shade = 221 + 13*coarse + 7*grain + 11*rng();
    if (kind === 'cloth') shade = 232 + 5*(x%2) + 9*(y%2) + 9*rng();
    if (kind === 'stone' || kind === 'tile') shade = 237 + 7*Math.sin(x*.03+Math.cos(y*.036)) + 9*rng();
    pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = shade;
    pixels.data[i+3] = 255;
  }
  ctx.putImageData(pixels,0,0);
  if(kind==='screed') {
    for(let i=0;i<8400;i++){
      const pale=rng()>.46,x=rng()*256,y=rng()*256;
      const rad=i<320?2+rng()*15:.3+rng()*1.6;
      ctx.fillStyle=pale?(i<320?'rgba(255,250,233,.045)':'rgba(252,248,234,.35)'):(i<320?'rgba(75,59,57,.046)':'rgba(72,64,62,.21)');
      ctx.beginPath();ctx.ellipse(x,y,rad,rad*(.35+rng()*.63),rng()*3.14,0,Math.PI*2);ctx.fill();
    }
  }
  if (kind === 'tile') {
    ctx.strokeStyle = '#a8a69e'; ctx.lineWidth = 2.5; ctx.strokeRect(0,0,256,256);
    ctx.strokeStyle = '#f6f4ed'; ctx.lineWidth = 1; ctx.strokeRect(2,2,252,252);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  cache.set(kind,t); return t;
}
const materials = new Map();
function make(kind,color) {
  const id = kind + String(color);
  if (!materials.has(id)) {
    const map = ['paint','metal'].includes(kind) ? null : pattern(kind);
    materials.set(id, new THREE.MeshStandardMaterial({color,map,
      roughness:kind==='metal'?.34:kind==='wood'?.64:kind==='tile'?.49:.87,
      metalness:kind==='metal'?.58:0}));
  }
  return materials.get(id);
}
export const wood=c=>make('wood',c), cloth=c=>make('cloth',c), metal=c=>make('metal',c);
export const paint=c=>make('paint',c), stone=c=>make('stone',c);
export function tiled(c,w,d,pitch=.52) {
  const mat=make('tile',c).clone();
  mat.map=mat.map.clone(); mat.map.repeat.set(w/pitch,d/pitch);
  return mat;
}
export function screed(w,d) {
  const m=make('screed','#ad9e8c').clone();
  m.map=m.map.clone();m.map.repeat.set(w/1.3,d/1.3);return m;
}
