import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const container = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060b);
scene.fog = new THREE.FogExp2(0x05060b, 0.0024);

const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 2500);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x74b9ff,0x110916,1.25));
const sun = new THREE.DirectionalLight(0xffffff,2.2);
sun.position.set(-4,10,3);
scene.add(sun);

// Star field
const starGeo = new THREE.BufferGeometry();
const stars = [];
for(let i=0;i<850;i++) stars.push((Math.random()-.5)*1800, Math.random()*600+40, (Math.random()-.5)*1800);
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars,3));
scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x8ba6d9,size:1.2,sizeAttenuation:true})));

// Basic elevated oval-ish circuit from a Catmull-Rom spline.
const pts = [
  new THREE.Vector3(0,0,0),
  new THREE.Vector3(0,6,-160),
  new THREE.Vector3(80,14,-300),
  new THREE.Vector3(230,5,-360),
  new THREE.Vector3(390,-6,-270),
  new THREE.Vector3(420,12,-100),
  new THREE.Vector3(360,22,100),
  new THREE.Vector3(180,4,190),
  new THREE.Vector3(-20,-8,170),
  new THREE.Vector3(-180,8,80),
  new THREE.Vector3(-190,20,-80),
  new THREE.Vector3(-100,10,-150),
];
const curve = new THREE.CatmullRomCurve3(pts,true,'catmullrom',0.35);

function makeRibbon(width=28, segments=700){
  const pos=[], uv=[], idx=[];
  const up = new THREE.Vector3(0,1,0);
  for(let i=0;i<=segments;i++){
    const t=i/segments;
    const p=curve.getPointAt(t);
    const tangent=curve.getTangentAt(t).normalize();
    const side=new THREE.Vector3().crossVectors(up,tangent).normalize();
    const left=p.clone().addScaledVector(side,-width/2);
    const right=p.clone().addScaledVector(side,width/2);
    pos.push(left.x,left.y,left.z,right.x,right.y,right.z);
    uv.push(0,t*40,1,t*40);
  }
  for(let i=0;i<segments;i++){
    const a=i*2,b=a+1,c=a+2,d=a+3;
    idx.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  return g;
}

const trackMat = new THREE.MeshStandardMaterial({color:0x141a29,roughness:.62,metalness:.32,side:THREE.DoubleSide});
const track = new THREE.Mesh(makeRibbon(),trackMat);
scene.add(track);

// glowing edge strips
function edgeLine(sign){
  const arr=[];
  const up=new THREE.Vector3(0,1,0);
  for(let i=0;i<=500;i++){
    const t=i/500,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize();
    const side=new THREE.Vector3().crossVectors(up,tan).normalize();
    p.addScaledVector(side,sign*14.3).y+=.25;
    arr.push(p);
  }
  const g=new THREE.BufferGeometry().setFromPoints(arr);
  return new THREE.Line(g,new THREE.LineBasicMaterial({color:sign>0?0xff3bd4:0x00eaff,transparent:true,opacity:.9}));
}
scene.add(edgeLine(1),edgeLine(-1));

// sparse pylons to make speed readable
const pylonGeo=new THREE.BoxGeometry(1.2,8,1.2);
for(let i=0;i<90;i++){
  const t=i/90,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize();
  const side=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),tan).normalize();
  for(const sign of [-1,1]){
    const m=new THREE.Mesh(pylonGeo,new THREE.MeshStandardMaterial({color: sign>0?0xff3bd4:0x00eaff,emissive:sign>0?0x661155:0x004455,emissiveIntensity:2}));
    m.position.copy(p).addScaledVector(side,sign*18);m.position.y+=4;
    scene.add(m);
  }
}

// Ship: deliberately simple, easy to replace later.
const ship = new THREE.Group();
const bodyMat=new THREE.MeshStandardMaterial({color:0xe9f6ff,metalness:.82,roughness:.22});
const darkMat=new THREE.MeshStandardMaterial({color:0x0a1020,metalness:.65,roughness:.28});
const body=new THREE.Mesh(new THREE.BoxGeometry(3.8,.65,7.8),bodyMat); body.position.y=.25;
ship.add(body);
const nose=new THREE.Mesh(new THREE.ConeGeometry(2.1,5.4,4),bodyMat);nose.rotation.x=Math.PI/2;nose.rotation.y=Math.PI/4;nose.position.z=-5.2;ship.add(nose);
for(const x of [-2.8,2.8]){
  const wing=new THREE.Mesh(new THREE.BoxGeometry(3.5,.25,4.8),bodyMat); wing.position.set(x,0,0.5); wing.rotation.z=x<0?.08:-.08;ship.add(wing);
  const glow=new THREE.Mesh(new THREE.BoxGeometry(1.3,.18,.45),new THREE.MeshBasicMaterial({color:0x37eaff})); glow.position.set(x,-.18,2.9); ship.add(glow);
}
const canopy=new THREE.Mesh(new THREE.BoxGeometry(2.1,.8,2.8),darkMat);canopy.position.set(0,.65,-1);ship.add(canopy);
scene.add(ship);

// state
let s=0.005;
let speed=0;
let steer=0;
let throttle=false, braking=false, running=false;
let pointerX=null;
const lateral = {x:0, vx:0};

const speedEl=document.querySelector('#speed');
document.querySelector('#startBtn').onclick=()=>{
  running=true;
  document.querySelector('#start').style.display='none';
  try{document.documentElement.requestFullscreen?.()}catch(e){}
};

function bindHold(el,setter){
  ['pointerdown','touchstart'].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();setter(true)},{passive:false}));
  ['pointerup','pointercancel','pointerleave','touchend'].forEach(ev=>el.addEventListener(ev,e=>{e.preventDefault();setter(false)},{passive:false}));
}
bindHold(document.querySelector('#boost'),v=>throttle=v);
bindHold(document.querySelector('#brake'),v=>braking=v);

addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key==='w') throttle=true;
  if(e.key==='ArrowDown'||e.key==='s') braking=true;
  if(e.key==='ArrowLeft'||e.key==='a') steer=-1;
  if(e.key==='ArrowRight'||e.key==='d') steer=1;
});
addEventListener('keyup',e=>{
  if(['ArrowUp','w'].includes(e.key)) throttle=false;
  if(['ArrowDown','s'].includes(e.key)) braking=false;
  if(['ArrowLeft','ArrowRight','a','d'].includes(e.key)) steer=0;
});

renderer.domElement.addEventListener('pointerdown',e=>pointerX=e.clientX);
renderer.domElement.addEventListener('pointermove',e=>{
  if(pointerX===null)return;
  const dx=e.clientX-pointerX; pointerX=e.clientX;
  lateral.vx += dx/innerWidth*12;
});
addEventListener('pointerup',()=>pointerX=null);

const clock=new THREE.Clock();
const p=new THREE.Vector3(), tangent=new THREE.Vector3(), side=new THREE.Vector3(), forward=new THREE.Vector3();
const camTarget=new THREE.Vector3();

function update(dt){
  if(running){
    const targetSpeed = braking ? 10 : throttle ? 95 : 54;
    speed += (targetSpeed-speed)*Math.min(1,dt*(throttle?1.45:0.72));
    lateral.vx += steer*dt*5.5;
    lateral.vx *= Math.pow(.22,dt);
    lateral.x += lateral.vx;
    lateral.x=Math.max(-11.4,Math.min(11.4,lateral.x));
    if(Math.abs(lateral.x)>10.5) speed*=Math.pow(.82,dt*4);
    s=(s+speed*dt/1400)%1;
  }

  p.copy(curve.getPointAt(s));
  tangent.copy(curve.getTangentAt(s)).normalize();
  side.crossVectors(new THREE.Vector3(0,1,0),tangent).normalize();

  ship.position.copy(p).addScaledVector(side,lateral.x);
  ship.position.y += 2.25 + Math.sin(performance.now()*.004)*.08;

  // Three orientation points establish heading without requiring physics engine yet.
  const look=p.clone().add(tangent);
  ship.lookAt(look.x,ship.position.y,look.z);
  ship.rotateZ(-lateral.vx*.06);

  // Chase cam with inertia-like interpolation.
  forward.copy(tangent);
  const desired=ship.position.clone().addScaledVector(forward,-14);
  desired.y+=7.2;
  camera.position.lerp(desired,1-Math.pow(.0007,dt));
  camTarget.copy(ship.position).addScaledVector(forward,15);camTarget.y+=1;
  camera.lookAt(camTarget);

  camera.fov=72+Math.min(13,speed/8);
  camera.updateProjectionMatrix();
  speedEl.textContent=Math.round(speed*8.2);
}

function loop(){
  const dt=Math.min(clock.getDelta(),.033);
  update(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
loop();

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
});
