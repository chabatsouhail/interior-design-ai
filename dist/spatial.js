const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const d=Math.hypot(...a);return a.map(x=>x/d);};
const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onEdge(p,a,b,e=.00002) {
  return Math.abs(turn(a,b,p))<e && p.every((v,i)=>v>=Math.min(a[i],b[i])-e && v<=Math.max(a[i],b[i])+e);
}
function intersects(a,b,c,d) {
  return turn(a,b,c)*turn(a,b,d)<-1e-12 && turn(c,d,a)*turn(c,d,b)<-1e-12;
}
export function inside(p,poly) {
  let result=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];if(onEdge(p,a,b))return true;
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
export function outline(nodes) {
  if(nodes.length<3)return null;
  const origin=nodes[0].p,n=unit(nodes[0].n),u=unit(cross(Math.abs(n[1])>.94?[0,0,1]:[0,1,0],n)),v=cross(n,u);
  if(nodes.some(a=>Math.abs(dot(sub(a.p,origin),n))>.045 || dot(a.n,n)<.93))return null;
  const coords=nodes.map(a=>{const d=sub(a.p,origin);return [dot(d,u),dot(d,v)];});
  const min=[0,1].map(i=>Math.min(...coords.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...coords.map(p=>p[i])));
  const width=max[0]-min[0],height=max[1]-min[1];
  if(width<.025||height<.025)return null;
  const polygon=coords.map(p=>[(p[0]-min[0])/width,(p[1]-min[1])/height]);
  for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){
    const i2=(i+1)%polygon.length,j2=(j+1)%polygon.length;
    if(i2===j || i===j2)continue;
    if(intersects(polygon[i],polygon[i2],polygon[j],polygon[j2]) || onEdge(polygon[j],polygon[i],polygon[i2]))return null;
  }
  const twice=polygon.reduce((s,a,i)=>{const b=polygon[(i+1)%polygon.length];return s+a[0]*b[1]-a[1]*b[0];},0);
  if(Math.abs(twice)*width*height<.002)return null;
  return {base:origin.map((a,i)=>a+min[0]*u[i]+min[1]*v[i]),u,v,n,width,height,area:Math.abs(twice)*width*height/2,polygon};
}
export function fitsPart(p,poly) {
  const [x,y]=p.center,[w,h]=p.size;
  const rect=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+a*w/2,y+b*h/2]);
  if(!rect.every(q=>inside(q,poly)))return false;
  return !poly.some((a,i)=>rect.some((b,j)=>intersects(a,poly[(i+1)%poly.length],b,rect[(j+1)%4]))) &&
    !poly.some(([a,b])=>a>x-w/2+1e-5 && a<x+w/2-1e-5 && b>y-h/2+1e-5 && b<y+h/2-1e-5);
}
export function localToWorld(f,u,v,w) {return f.base.map((x,i)=>x+u*f.width*f.u[i]+v*f.height*f.v[i]+w*f.n[i]);}
