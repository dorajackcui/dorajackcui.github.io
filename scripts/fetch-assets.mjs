import { mkdir, writeFile } from 'node:fs/promises';
const assets = [
  ['https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js', 'assets/vendor/three.module.min.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.170.0/LICENSE', 'assets/vendor/THREE-LICENSE.txt'],
  ['https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json', 'scripts/land-110m.json'],
  ['https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@5.1.0/files/space-grotesk-latin-400-normal.woff2', 'assets/fonts/space-grotesk-regular.woff2'],
  ['https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@5.1.0/files/space-grotesk-latin-600-normal.woff2', 'assets/fonts/space-grotesk-semibold.woff2'],
  ['https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@5.1.0/LICENSE', 'assets/fonts/OFL.txt'],
];
const results = await Promise.allSettled(assets.map(async ([url, path]) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${path}`);
}));
for (const result of results) if (result.status === 'rejected') { console.error(result.reason); process.exitCode = 1; }
