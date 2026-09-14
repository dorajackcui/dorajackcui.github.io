import { readFile, writeFile, mkdir } from 'node:fs/promises';
const topology = JSON.parse(await readFile(new URL('./land-110m.json', import.meta.url), 'utf8'));
const { scale, translate } = topology.transform;
const arcs = topology.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
function ring(indices) {
  return indices.flatMap((index, i) => {
    const arc = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
    return i ? arc.slice(1) : arc;
  });
}
const polygons = topology.objects.land.geometries.flatMap(geometry => geometry.type === 'MultiPolygon' ? geometry.arcs : [geometry.arcs]).map(polygon => {
  const rings = polygon.map(ring);
  const bounds = rings[0].reduce((b, [x,y]) => [Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)], [180,90,-180,-90]);
  return { rings, bounds };
});
function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length-1; i < points.length; j = i++) {
    const [xi,yi] = points[i], [xj,yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) hit = !hit;
  }
  return hit;
}
const positions = [];
for (let lat = -79; lat < 84; lat += 1.12) {
  const latitude = lat * Math.PI / 180;
  const step = 1.12 / Math.cos(latitude);
  for (let lon = -180; lon < 180; lon += step) {
    const land = polygons.some(({rings,bounds:[minX,minY,maxX,maxY]}) => lon >= minX && lon <= maxX && lat >= minY && lat <= maxY && inside(lon,lat,rings[0]) && !rings.slice(1).some(hole=>inside(lon,lat,hole)));
    if (!land) continue;
    const longitude = lon * Math.PI / 180;
    positions.push(...[Math.cos(latitude)*Math.sin(longitude),Math.sin(latitude),Math.cos(latitude)*Math.cos(longitude)].map(n=>Number(n.toFixed(5))));
  }
}
await mkdir(new URL('../assets/data/', import.meta.url), { recursive:true });
await writeFile(new URL('../assets/data/land-points.json', import.meta.url), JSON.stringify(positions));
console.log(`Built ${positions.length/3} land points from Natural Earth / world-atlas.`);
