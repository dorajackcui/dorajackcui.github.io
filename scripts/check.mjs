import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const pages = ['index.html', 'reference.html', 'notion/index.html', 'design-reference/index.html', 'project.html'];
const projectUrls = ['https://momocat-yizhi.pages.dev/', 'https://momoqatools.pages.dev/', 'https://momotools.dorajackcui.workers.dev/'];

async function checkTarget(source, target) {
  if (/^(https?:|data:|mailto:)/.test(target)) return;
  const [path, hash] = target.split('#');
  let file = path ? resolve(dirname(source), path.split('?')[0]) : source;
  if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
  assert((await stat(file)).isFile(), `Missing local file: ${target}`);
  if (hash) {
    const html = await readFile(file, 'utf8');
    assert(html.includes(`id="${hash}"`), `Broken anchor in ${source}: ${target}`);
  }
}

for (const page of pages) {
  const file = resolve(root, page);
  const html = await readFile(file, 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `Duplicate IDs in ${page}`);
  for (const [, target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) await checkTarget(file, target);
  for (const [tag] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert(tag.includes('noopener noreferrer'), `External link missing isolation in ${page}`);
  }
}

const home = await readFile(resolve(root, 'index.html'), 'utf8');
for (const url of projectUrls) assert(home.includes(`href="${url}"`), `Missing project: ${url}`);

for (const css of ['css/home.css', 'css/reference.css', 'design-reference/tokens.css']) {
  const file = resolve(root, css);
  const source = await readFile(file, 'utf8');
  for (const [, url] of source.matchAll(/url\(["']?([^"')]+)["']?\)/g)) await checkTarget(file, url);
}

const css = await readFile(resolve(root, 'design-reference/tokens.css'), 'utf8');
const tokens = JSON.parse(await readFile(resolve(root, 'design-reference/tokens.json'), 'utf8'));
for (const { cssVariable, value } of Object.values(tokens.tokens)) {
  assert(css.includes(`${cssVariable}: ${value};`), `Token mismatch: ${cssVariable}`);
}
const reference = await readFile(resolve(root, 'reference.html'), 'utf8');
const guide = await readFile(resolve(root, 'design-reference/REFERENCE.md'), 'utf8');
const handoff = guide.split('\n').find(line => line.startsWith('> 请按')).slice(2);
assert(reference.includes(handoff), 'Reference handoff is out of sync with the guide');

for (const file of ['main.js', 'reference.js', 'scripts/serve.mjs', 'scripts/check.mjs']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
console.log('Passed: page and CSS assets, anchor destinations, project URLs, external links, tokens, handoff text and JavaScript syntax.');
