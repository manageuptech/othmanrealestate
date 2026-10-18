// Works out which landing pages have nothing to show yet, so they are kept
// out of the sitemap and marked noindex (avoids thin pages in Google).
// The same rules are used by the pages themselves (see rules below).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function readListings() {
  const dir = path.join(root, 'src/content/properties');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = (txt.split('---')[1] || '');
    const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
    return { status: get('status'), type: get('type'), city: get('city'), district: get('district'), available: get('available') !== 'false' };
  }).filter((l) => l.available);
}

export function noindexPaths() {
  const listings = readListings();
  const loc = JSON.parse(fs.readFileSync(path.join(root, 'src/data/locations.json'), 'utf8'));
  const types = JSON.parse(fs.readFileSync(path.join(root, 'src/data/types.json'), 'utf8')).types;
  const out = [];
  for (const c of loc.cities) {
    const inCity = listings.filter((l) => l.city === c.slug);
    if (!c.primary && inCity.length === 0) out.push(`/${c.slug}/`);
    for (const d of c.districts) {
      const n = inCity.filter((l) => l.district === d.slug).length;
      if (!d.featured && n === 0) out.push(`/${c.slug}/${d.slug}/`);
    }
    if (c.primary) for (const t of types) for (const s of ['sale', 'rent']) {
      const n = inCity.filter((l) => l.type === t.key && l.status === s).length;
      if (n === 0) out.push(`/${c.slug}/${t.slug}-for-${s}/`);
    }
  }
  return out;
}
