import * as THREE from './assets/vendor/three.module.min.js';

export async function createGlobe({ canvas, viewport, onFailure, onRestore }) {
  const response = await fetch(new URL('./assets/data/land-points.json', import.meta.url));
  if (!response.ok) throw new Error('Globe map data is unavailable.');
  const land = await response.json();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x0b0d0c, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 20);
  camera.position.z = 4;
  const tilt = new THREE.Group();
  tilt.rotation.z = -.18;
  tilt.rotation.x = .18;
  scene.add(tilt);
  const earth = new THREE.Group();
  tilt.add(earth);

  earth.add(new THREE.Mesh(new THREE.SphereGeometry(.994, 64, 48), new THREE.MeshBasicMaterial({ color: 0x0c120c })));
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(land, 3));
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `uniform float pixelRatio; varying float light;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 normal = normalize(normalMatrix * position);
        light = 0.35 + 0.65 * max(0.0, normal.z);
        gl_PointSize = pixelRatio * 2.1 * (3.3 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float light;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if(d > 0.5) discard;
        float a = (1.0-smoothstep(0.3,0.5,d)) * light;
        gl_FragColor = vec4(vec3(0.63,0.83,0.40), a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  earth.add(new THREE.Points(pointsGeometry, pointMaterial));

  const geo = (lat, lon, r = 1.006) => {
    const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(Math.cos(p)*Math.sin(l)*r, Math.sin(p)*r, Math.cos(p)*Math.cos(l)*r);
  };
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x789859, transparent: true, opacity: .12 });
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = Array.from({length:181}, (_,i)=>geo(lat,i*2));
    earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const points = Array.from({length:91}, (_,i)=>geo(i*2-90,lon));
    earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
  }
  const sea = [];
  for (let lat = -78; lat < 80; lat += 4.5) for (let lon = 0; lon < 360; lon += 4.5/Math.cos(lat*Math.PI/180)) sea.push(...geo(lat,lon,1.003).toArray());
  const seaGeometry = new THREE.BufferGeometry();
  seaGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sea,3));
  earth.add(new THREE.Points(seaGeometry,new THREE.PointsMaterial({color:0x769659,size:.004,transparent:true,opacity:.2,depthWrite:false})));

  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.055,64,48),new THREE.ShaderMaterial({
    vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n; varying vec3 v; void main(){float rim=pow(1.0-abs(dot(normalize(n),normalize(v))),4.5);gl_FragColor=vec4(0.47,0.68,0.25,rim*0.14);}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  }));
  scene.add(atmosphere);

  const orbit = new THREE.Group();
  orbit.rotation.set(1.08,.2,-.35);
  const orbitPoints = Array.from({length:181},(_,i)=>new THREE.Vector3(Math.cos(i/180*Math.PI*2)*1.32,Math.sin(i/180*Math.PI*2)*1.32,0));
  orbit.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPoints),new THREE.LineBasicMaterial({color:0x829966,transparent:true,opacity:.25})));
  scene.add(orbit);
  const secondOrbit = orbit.clone();
  secondOrbit.rotation.set(.38,.84,.6);
  secondOrbit.scale.setScalar(1.1);
  scene.add(secondOrbit);

  const locations = [[31,121],[35,139],[49,2],[40,-74],[1,104],[52,13]];
  const routes = [];
  const routeMaterial = new THREE.LineBasicMaterial({color:0xaddb80,transparent:true,opacity:.37});
  const markerGeometry = new THREE.SphereGeometry(.013,12,8);
  const markerMaterial = new THREE.MeshBasicMaterial({color:0xd8ffac});
  for (const [lat,lon] of locations) {
    const marker = new THREE.Mesh(markerGeometry,markerMaterial);
    marker.position.copy(geo(lat,lon,1.014));
    earth.add(marker);
  }
  for (let i=1;i<locations.length;i++) {
    const start=geo(...locations[0],1),end=geo(...locations[i],1);
    const angle=start.angleTo(end);
    const points=Array.from({length:65},(_,j)=>{
      const t=j/64;
      return start.clone().multiplyScalar(Math.sin((1-t)*angle)/Math.sin(angle)).add(end.clone().multiplyScalar(Math.sin(t*angle)/Math.sin(angle))).normalize().multiplyScalar(1.015+Math.sin(t*Math.PI)*.22);
    });
    const curve=new THREE.CatmullRomCurve3(points);
    earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),routeMaterial));
    const particle=new THREE.Mesh(new THREE.SphereGeometry(.009,8,6),markerMaterial);
    earth.add(particle);
    routes.push({curve,particle,offset:i*.17});
  }
  let failed = false;
  function resize(){
    const size=viewport.clientWidth;
    renderer.setSize(size,size,false);
  }
  const resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  resize();
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();
    failed=true;
    document.documentElement.classList.remove('globe-ready');
    onFailure();
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    failed=false;
    document.documentElement.classList.add('globe-ready');
    onRestore?.();
  });
  return {
    render(rotation,time){
      if(failed) return;
      earth.rotation.y=rotation;
      routes.forEach(({curve,particle,offset})=>particle.position.copy(curve.getPoint((time*.06+offset)%1)));
      renderer.render(scene,camera);
    },
  };
}
