import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const html=await readFile(resolve(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
for(const [,target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
  if(target.startsWith('#')) assert(ids.includes(target.slice(1)),`Broken anchor: ${target}`);
  else if(!/^https?:/.test(target)) assert((await stat(resolve(root,target))).isFile(),`Missing asset: ${target}`);
}
for(const url of ['https://momocat-yizhi.pages.dev/','https://momoqatools.pages.dev/','https://momotools.dorajackcui.workers.dev/']) assert(html.includes(`href="${url}"`),`Missing project: ${url}`);
for(const [,tag] of html.matchAll(/(<a\b[^>]*target="_blank"[^>]*>)/g)) assert(tag.includes('noopener noreferrer'),'External link missing isolation');
const points=JSON.parse(await readFile(resolve(root,'assets/data/land-points.json'),'utf8'));
assert(points.length>15000&&points.length%3===0,'Missing globe geometry');
for(let i=0;i<points.length;i+=3) assert(Math.abs(Math.hypot(...points.slice(i,i+3))-1)<.001,'Invalid spherical point');
for(const file of ['main.js','globe.js','scripts/serve.mjs','scripts/build-globe.mjs']){
  const result=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
}
console.log(`Passed: local assets, ${ids.length} unique IDs, anchor destinations, all three project URLs, external links, ${points.length/3} globe points, and JavaScript syntax.`);
