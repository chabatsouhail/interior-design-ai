// Freestanding items and fixtures visible in the walkthrough. Positions are estimated.
export function furnish({object,box,ellipsoid,cylinder,metal,paint,stone}) {
  const white=paint('#e3dfcf'),porcelain=paint('#f0ede4'),chrome=metal('#adb1aa'),
    inset=metal('#636b65'),dark=paint('#4d4b40'),tile=stone('#d7cfb8');
  const fixed={accent:true,solid:false};
  const chair=object('plastic-armchair','Plastic armchair','bed1');
  // Chair-local right is south, front is west, so the chair faces into the room.
  function piece(x,y,z,w,h,d,rot=0,r=.021) {
    return box(chair,2.88-z,y,5.69+x,d,h,w,white,{radius:r,rotation:[0,0,rot]});
  }
  piece(0,.43,0,.51,.068,.47,0,.031);
  for(const side of [-1,1]){
    for(const end of [-1,1]){
      box(chair,2.88-end*.19,.218,5.69+side*.215,.053,.431,.055,white,
        {radius:.016,rotation:[side*.13,0,-end*.10]});
    }
    piece(side*.263,.635,-.012,.052,.052,.405,0,.020);
    piece(side*.254,.547,.131,.046,.19,.047,.18,.012);
    piece(side*.226,.67,-.201,.057,.42,.066,.14,.023);
  }
  piece(0,.83,-.223,.49,.089,.065,.13,.034);
  for(let t=-2;t<=2;t++)piece(t*.069,.681,-.215,.043,.239,.041,.14,.017);

  const light=object('ceiling-rose','Ceiling rose and bare bulb','bed1',{kind:'light',walkOnly:true});
  const ivory=paint('#ece6d6'),warm=paint('#fff6db');
  for(const [rad,y,h] of [[.224,2.733,.025],[.197,2.709,.026],[.16,2.69,.02],[.088,2.666,.038]])
    cylinder(light,1.67,y,3.03,rad,rad*.97,h,ivory,{solid:false});
  for(let i=0;i<12;i++){const a=i*Math.PI/6;
    ellipsoid(light,1.67+Math.sin(a)*.118,2.671,3.03+Math.cos(a)*.118,.043,.021,.096,ivory,{rotation:[0,a,0],solid:false});}
  cylinder(light,1.67,2.594,3.03,.006,.006,.126,paint('#806f59'),fixed);
  cylinder(light,1.67,2.51,3.03,.022,.02,.05,white,{solid:false});
  ellipsoid(light,1.67,2.457,3.03,.064,.084,.064,warm,{solid:false});

  const counter=object('tiled-counter','Open tiled kitchen counter','kitchen');
  box(counter,6.12,.80,.38,1.23,.119,.60,tile);
  box(counter,5.55,.39,.38,.088,.78,.59,tile);
  box(counter,6.69,.39,.38,.088,.78,.59,tile);
  for(let i=0;i<5;i++)box(counter,5.635+i*.244,.805,.681,.005,.103,.003,paint('#a79e8a'),fixed);
  const sink=object('kitchen-sink','Stainless steel sink and wall tap','kitchen');
  box(sink,6.085,.871,.365,1.05,.033,.475,chrome,{radius:.024});
  box(sink,5.876,.894,.379,.414,.012,.345,inset,{radius:.038});
  for(const s of [-1,1])box(sink,5.876+s*.219,.913,.379,.028,.04,.389,chrome,{radius:.012});
  for(const s of [-1,1])box(sink,5.876,.913,.379+s*.185,.447,.039,.026,chrome,{radius:.011});
  cylinder(sink,5.876,.904,.392,.024,.024,.007,dark,fixed);
  for(let i=0;i<8;i++)box(sink,6.16+i*.043,.891,.366,.013,.012,.345,chrome,{radius:.005});
  cylinder(sink,5.884,1.087,.103,.03,.03,.06,chrome,{rotation:[Math.PI/2,0,0],solid:false});
  box(sink,5.884,1.09,.212,.025,.025,.224,chrome,{radius:.009,solid:false});
  cylinder(sink,5.884,1.061,.316,.014,.014,.063,chrome,{solid:false});
  const blue=object('blue-basin','Blue washing basin','kitchen');
  const bluePlastic=paint('#386ebc'),inside=paint('#285899');
  cylinder(blue,6.365,.916,.378,.145,.132,.048,bluePlastic);
  for(let i=0;i<32;i++){const a=i*Math.PI/16;
    box(blue,6.365+Math.sin(a)*.158,.996,.378+Math.cos(a)*.158,.035,.153,.014,bluePlastic,
      {rotation:[.18*Math.cos(a),a,-.18*Math.sin(a)],radius:.004});
    box(blue,6.365+Math.sin(a)*.173,1.072,.378+Math.cos(a)*.173,.036,.014,.018,bluePlastic,{rotation:[0,a,0],radius:.006});}
  cylinder(blue,6.365,.941,.378,.141,.140,.004,inside,fixed);

  const basin=object('bath-basin','Wall-mounted ceramic handbasin','bath');
  const bx=3.759,bz=2.57;
  ellipsoid(basin,bx,.771,bz,.525,.173,.357,porcelain);
  ellipsoid(basin,bx,.85,bz+.036,.393,.021,.245,paint('#c9c7b9'),fixed);
  cylinder(basin,bx,.866,bz+.039,.019,.019,.006,inset,fixed);
  box(basin,bx,.853,bz-.14,.49,.087,.086,porcelain,{radius:.021});
  cylinder(basin,bx,.926,bz-.141,.019,.024,.08,chrome,fixed);
  box(basin,bx,.96,bz-.10,.023,.023,.102,chrome,{radius:.009,accent:true,solid:false});
  cylinder(basin,bx,.602,bz,.029,.026,.206,chrome,fixed);
  box(basin,bx,.511,bz-.063,.05,.049,.16,chrome,{radius:.012,accent:true,solid:false});
  const wc=object('toilet','Toilet','bath');
  const cx=4.376,cz=2.71;
  ellipsoid(wc,cx,.233,cz+.072,.302,.44,.436,porcelain);
  ellipsoid(wc,cx,.393,cz+.061,.381,.183,.564,porcelain);
  ellipsoid(wc,cx,.48,cz+.081,.291,.015,.38,paint('#aeb2a5'),fixed);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;
    const x=Math.sin(a)*.153,z=Math.cos(a)*.218;
    box(wc,cx+x,.493,cz+.077+z,.063,.025,.04,porcelain,
      {rotation:[0,Math.atan2(.218*Math.sin(a),.153*Math.cos(a)),0],radius:.011});}
  box(wc,cx,.695,2.492,.367,.343,.155,porcelain,{radius:.032});
  box(wc,cx,.877,2.492,.381,.032,.169,porcelain,{radius:.014});
  cylinder(wc,cx,.899,2.494,.019,.019,.008,chrome,fixed);
}
