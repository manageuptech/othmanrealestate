// Copies images/video still hosted on the old WordPress site into this project
// and rewrites the links, so nothing depends on the old site after launch.
// Run once before switching the domain:  npm run media:fetch
import fs from 'node:fs';
import path from 'node:path';

const OLD = 'https://alothman.com.sa/wp-content/uploads/';
const dirProps = 'src/content/properties';
const outImg = 'public/uploads/properties';
const outMedia = 'public/media';
fs.mkdirSync(outImg, { recursive: true });
fs.mkdirSync(outMedia, { recursive: true });

async function grab(url, dir) {
  const name = decodeURIComponent(url.split('/').pop()).normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const res = await fetch(encodeURI(decodeURI(url)));
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('✓', file);
  }
  return '/' + path.relative('public', file).split(path.sep).join('/');
}

async function rewrite(file, dir) {
  let txt = fs.readFileSync(file, 'utf8');
  const urls = [...new Set(txt.match(/https:\/\/alothman\.com\.sa\/wp-content\/uploads\/[^\s"')]+/g) || [])];
  for (const u of urls) {
    try { txt = txt.split(u).join(await grab(u, dir)); } catch (e) { console.warn('✗', e.message); }
  }
  fs.writeFileSync(file, txt);
}

for (const f of fs.readdirSync(dirProps)) if (f.endsWith('.md')) await rewrite(path.join(dirProps, f), outImg);
await rewrite('src/data/site.json', outMedia);
for (const f of ['src/pages/index.astro']) await rewrite(f, outImg);
console.log('done. Review changes, then commit.');
