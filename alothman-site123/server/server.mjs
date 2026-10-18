// خادم الموقع + لوحة التحكم (/admin/)
// يخدم الموقع المبني من dist/، ويوفر لوحة بكلمة مرور لإضافة العقارات وتعديلها،
// ثم يعيد بناء الموقع تلقائيًا بعد كل حفظ.
//
// التشغيل:  ADMIN_PASSWORD=xxxx node server/server.mjs   (أو ضعها في ملف .env)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);

// ---------- settings ----------
loadEnv(P('.env'));
const PORT = +(process.env.PORT || 8080);
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';
const SESSION_HOURS = 12;
if (!PASSWORD) console.warn('⚠️  ADMIN_PASSWORD غير محددة — لن يمكن الدخول للوحة.');

const DIST = P('dist');
const PROPS = P('src/content/properties');
const LOC = P('src/data/locations.json');
const TYPES = P('src/data/types.json');
const UPLOADS = P('public/uploads/properties');
const ADMIN_HTML = P('server/admin.html');

// ---------- persistent storage (Railway volume, etc.) ----------
// Hosting disks are usually wiped on every deploy. Set DATA_DIR to a mounted
// volume (e.g. /data): on first start it is filled from the repo, then the
// editable folders are linked to it so listings and photos added from the
// admin survive restarts and redeploys.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : '';
function linkToVolume(repoPath, volPath, isDir) {
  if (!fs.existsSync(volPath)) {
    if (fs.existsSync(repoPath)) fs.cpSync(repoPath, volPath, { recursive: true });
    else if (isDir) fs.mkdirSync(volPath, { recursive: true });
  }
  const st = fs.lstatSync(repoPath, { throwIfNoEntry: false });
  if (st?.isSymbolicLink() && fs.realpathSync(repoPath) === fs.realpathSync(volPath)) return;
  if (st) fs.rmSync(repoPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  fs.symlinkSync(volPath, repoPath, isDir ? 'dir' : 'file');
}
if (DATA_DIR) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  linkToVolume(PROPS, path.join(DATA_DIR, 'properties'), true);
  linkToVolume(LOC, path.join(DATA_DIR, 'locations.json'), false);
  linkToVolume(UPLOADS, path.join(DATA_DIR, 'uploads'), true);
  console.log(`البيانات محفوظة في ${DATA_DIR}`);
}

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// ---------- sessions & login throttling ----------
const sessions = new Map(); // token -> expiry
const fails = new Map(); // ip -> { n, until }
const MAX_FAILS = 5, LOCK_MIN = 15, GLOBAL_MAX = 50; // per IP, and across all IPs, per 15 minutes
let globalFails = { n: 0, since: Date.now() };
function lockedFor(ip) {
  const now = Date.now(), win = LOCK_MIN * 60000;
  if (now - globalFails.since > win) globalFails = { n: 0, since: now };
  if (globalFails.n >= GLOBAL_MAX) return globalFails.since + win - now;
  const f = fails.get(ip);
  if (!f || now - f.since > win) return 0;
  return f.n >= MAX_FAILS ? f.since + win - now : 0;
}
function noteFail(ip) {
  const now = Date.now(), f = fails.get(ip);
  if (!f || now - f.since > LOCK_MIN * 60000) fails.set(ip, { n: 1, since: now }); else f.n++;
  globalFails.n++;
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const passOk = (p) => PASSWORD && crypto.timingSafeEqual(sha(p), sha(PASSWORD));
// trust X-Forwarded-For only behind a known reverse proxy (TRUST_PROXY=1), otherwise it can be spoofed
// the last entry is the one added by our proxy; earlier entries can be forged by the client
const ipOf = (req) => ((process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',').pop()) || req.socket.remoteAddress || '').trim();

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function authed(req) {
  const t = cookies(req).ao_admin;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const cookie = (v, maxAge) =>
  `ao_admin=${v}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
};
function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, code, obj, headers = {}) =>
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });

async function readBody(req, limit = 12 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('الملف أكبر من المسموح'), { code: 413 });
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('طلب غير صالح'), { code: 400 }); }
}

// ---------- listings (markdown + frontmatter) ----------
const FILE_RE = /^[a-z0-9][a-z0-9-]{1,120}\.md$/;
const ORDER = ['slug_en', 'title', 'ref', 'status', 'type', 'city', 'district', 'street', 'price', 'oldPrice', 'priceNote',
  'rentPeriod', 'area', 'bedrooms', 'bathrooms', 'livingRooms', 'floors', 'streetWidth', 'facing', 'age', 'features',
  'cover', 'images', 'video', 'mapUrl', 'featured', 'available', 'date', 'summary'];
const NUMS = ['price', 'oldPrice', 'area', 'bedrooms', 'bathrooms', 'livingRooms', 'floors', 'streetWidth'];
const STRS = ['street', 'priceNote', 'facing', 'age', 'video'];

function parseMd(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = yaml.load(m[1]) || {};
  if (data.date instanceof Date) data.date = data.date.toISOString().slice(0, 10);
  return { data, body: m[2].replace(/^\n+/, '') };
}
function toMd(data, body) {
  const ordered = {};
  for (const k of ORDER) if (data[k] !== undefined && data[k] !== null && data[k] !== '') ordered[k] = data[k];
  const fm = yaml.dump(ordered, { lineWidth: -1, quotingType: '"' })
    // keep the date unquoted so Astro reads it as a date
    .replace(/^date: ["']?(\d{4}-\d{2}-\d{2})["']?$/m, 'date: $1');
  return `---\n${fm}---\n${(body || '').trim()}\n`;
}
async function listAll() {
  const files = (await fsp.readdir(PROPS)).filter((f) => FILE_RE.test(f));
  const out = [];
  for (const f of files) {
    const { data, body } = parseMd(await fsp.readFile(path.join(PROPS, f), 'utf8'));
    out.push({ file: f, data, body });
  }
  return out.sort((a, b) => String(b.data.ref || '').localeCompare(String(a.data.ref || ''), 'en', { numeric: true }));
}
const readJson = async (f) => JSON.parse(await fsp.readFile(f, 'utf8'));

function clean(input, loc) {
  const d = {}; const err = [];
  const s = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  d.title = s(input.title); if (!d.title) err.push('العنوان مطلوب');
  d.status = ['sale', 'rent'].includes(input.status) ? input.status : (err.push('اختر بيع أو إيجار'), 'sale');
  d.type = ['apartment', 'villa', 'land', 'building', 'commercial', 'resthouse'].includes(input.type) ? input.type : (err.push('اختر نوع العقار'), 'land');
  const city = loc.cities.find((c) => c.slug === input.city);
  if (!city) err.push('اختر المدينة');
  d.city = city?.slug || '';
  if (city && !city.districts.some((x) => x.slug === input.district)) err.push('اختر الحي');
  d.district = s(input.district);
  for (const k of NUMS) {
    const raw = s(input[k]).replace(/[,،\s]/g, '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) err.push(`قيمة غير صحيحة في ${k}`); else d[k] = n;
  }
  for (const k of STRS) if (s(input[k])) d[k] = s(input[k]);
  if (d.status === 'rent' && ['yearly', 'monthly'].includes(input.rentPeriod)) d.rentPeriod = input.rentPeriod;
  d.features = (Array.isArray(input.features) ? input.features : s(input.features).split('\n')).map(s).filter(Boolean);
  d.images = (Array.isArray(input.images) ? input.images : []).map(s).filter((x) => /^(\/uploads\/|https:\/\/)/.test(x));
  d.cover = s(input.cover) || d.images[0] || '';
  if (d.cover && !d.images.includes(d.cover) && d.cover.startsWith('/uploads/')) d.images.unshift(d.cover);
  const map = s(input.mapUrl);
  if (map) { try { new URL(map); d.mapUrl = map; } catch { err.push('رابط الخريطة غير صحيح'); } }
  d.featured = !!input.featured;
  d.available = input.available !== false;
  d.date = /^\d{4}-\d{2}-\d{2}$/.test(s(input.date)) ? s(input.date) : new Date().toISOString().slice(0, 10);
  d.summary = s(input.summary); if (!d.summary) err.push('الوصف المختصر مطلوب');
  return { d, err };
}
const TYPE_EN = { apartment: 'apartment', villa: 'villa', land: 'land', building: 'building', commercial: 'commercial', resthouse: 'resthouse' };
function newSlug(d, existing) {
  const base = `${TYPE_EN[d.type]}-for-${d.status}-${d.district}-${d.city}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  let slug = base, i = 2;
  while (existing.has(`${slug}.md`)) slug = `${base}-${i++}`;
  return slug;
}
function nextRef(all) {
  const nums = all.map((x) => +(String(x.data.ref || '').match(/(\d+)$/)?.[1] || 0));
  return `AO-${Math.max(1000, ...nums) + 1}`;
}

// transliterate an Arabic district name into a URL slug (best effort; can be edited)
const TR = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ة': 'ah', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ئ': 'e', 'ؤ': 'o', 'ء': '' };
const translit = (s) => s.trim().replace(/^حي\s+/, '').replace(/^ال/, 'al-').split('').map((c) => (c === ' ' ? '-' : TR[c] ?? (/[a-z0-9-]/i.test(c) ? c.toLowerCase() : ''))).join('').replace(/-+/g, '-').replace(/^-|-$/g, '');

// ---------- rebuild queue ----------
const build = { state: 'idle', at: null, error: '', queued: false };
function scheduleBuild() {
  if (build.state === 'building') { build.queued = true; return; }
  runBuild();
}
function runBuild() {
  build.state = 'building'; build.queued = false; build.error = '';
  const tmp = P('dist-next');
  fs.rmSync(tmp, { recursive: true, force: true });
  let log = '';
  const child = spawn(process.execPath, [P('node_modules/astro/astro.js'), 'build'], { cwd: ROOT, env: { ...process.env, OUT_DIR: 'dist-next' } });
  child.stdout.on('data', (c) => (log += c));
  child.stderr.on('data', (c) => (log += c));
  child.on('close', (code) => {
    if (code === 0 && fs.existsSync(path.join(tmp, 'index.html'))) {
      const old = P('dist-old');
      fs.rmSync(old, { recursive: true, force: true });
      if (fs.existsSync(DIST)) fs.renameSync(DIST, old);
      fs.renameSync(tmp, DIST);
      fs.rmSync(old, { recursive: true, force: true });
      build.state = 'ok'; build.at = new Date().toISOString();
    } else {
      build.state = 'error';
      build.error = (log.match(/(error|Error)[\s\S]{0,600}/)?.[0] || log.slice(-600)).replace(/\x1b\[[0-9;]*m/g, '');
      console.error('build failed\n' + log.slice(-2000));
    }
    if (build.queued) runBuild();
  });
}

// ---------- redirects (_redirects) ----------
const redirects = [];
try {
  for (const line of fs.readFileSync(P('public/_redirects'), 'utf8').split('\n')) {
    const [from, to, code] = line.trim().split(/\s+/);
    if (!from || from.startsWith('#') || !to) continue;
    redirects.push({ from: from.toLowerCase(), to, code: +code || 301 });
  }
} catch {}
function findRedirect(p) {
  const lp = p.toLowerCase();
  for (const r of redirects) {
    if (r.from.endsWith('*') ? lp.startsWith(r.from.slice(0, -1)) : lp === r.from) return r;
  }
}

// ---------- static files ----------
async function serveFile(res, file, req) {
  const st = await fsp.stat(file);
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size };
  headers['Cache-Control'] = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=86400';
  // byte ranges for video
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range && (ext === '.mp4' || ext === '.webm')) {
    const start = range[1] ? +range[1] : 0;
    const end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
async function exists(f) { try { return (await fsp.stat(f)).isFile(); } catch { return false; } }

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad request'); }
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, safe);
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden');
  if (rel.endsWith('/')) file = path.join(file, 'index.html');
  if (await exists(file)) return serveFile(res, file, req);
  // directory without trailing slash → redirect (site uses trailing slashes)
  if (!rel.endsWith('/') && !path.extname(rel) && (await exists(path.join(file, 'index.html')))) {
    return send(res, 301, '', { Location: pathname + '/' });
  }
  // freshly uploaded photo not yet in dist
  if (rel.startsWith('/uploads/')) {
    const pub = path.join(ROOT, 'public', safe);
    if (pub.startsWith(P('public')) && (await exists(pub))) return serveFile(res, pub, req);
  }
  const r = findRedirect(rel) || findRedirect(pathname);
  if (r) return send(res, r.code, '', { Location: r.to });
  const nf = path.join(DIST, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  return (await exists(nf)) ? fs.createReadStream(nf).pipe(res) : res.end('404');
}

// ---------- admin API ----------
async function api(req, res, route) {
  const method = req.method;
  if (route === 'login' && method === 'POST') {
    const ip = ipOf(req);
    const wait = lockedFor(ip);
    if (wait > 0) return json(res, 429, { error: `محاولات كثيرة. حاول بعد ${Math.ceil(wait / 60000)} دقيقة.` });
    const { password } = await readBody(req, 4096);
    if (!passOk(password || '')) {
      noteFail(ip);
      await new Promise((r) => setTimeout(r, 600));
      return json(res, 401, { error: 'كلمة المرور غير صحيحة' });
    }
    fails.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_HOURS * 3600e3);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(token, SESSION_HOURS * 3600) });
  }
  if (route === 'logout' && method === 'POST') {
    sessions.delete(cookies(req).ao_admin);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
  }
  if (!authed(req)) return json(res, 401, { error: 'سجّل الدخول أولًا' });
  // simple CSRF guard: API writes must come from our own page as JSON
  if (method !== 'GET' && !/application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'unsupported' });

  if (route === 'session') return json(res, 200, { ok: true });
  if (route === 'status') return json(res, 200, build);
  if (route === 'meta' && method === 'GET') {
    const loc = await readJson(LOC); const types = await readJson(TYPES);
    return json(res, 200, {
      cities: loc.cities.map((c) => ({ slug: c.slug, name: c.name, districts: c.districts.map((d) => ({ slug: d.slug, name: d.name })) })),
      types: types.types.map((t) => ({ key: t.key, name: t.single })),
    });
  }
  if (route === 'listings' && method === 'GET') return json(res, 200, { items: await listAll() });

  if (route === 'listings' && method === 'POST') {
    const { file, data: input, body } = await readBody(req);
    const loc = await readJson(LOC);
    const { d, err } = clean(input || {}, loc);
    if (err.length) return json(res, 400, { error: err.join('، ') });
    const all = await listAll();
    let name = file;
    if (name) {
      if (!FILE_RE.test(name) || !all.some((x) => x.file === name)) return json(res, 404, { error: 'العقار غير موجود' });
      const prev = all.find((x) => x.file === name).data;
      d.slug_en = prev.slug_en || name.replace(/\.md$/, '');
      d.ref = prev.ref || nextRef(all);
    } else {
      d.slug_en = newSlug(d, new Set(all.map((x) => x.file)));
      d.ref = nextRef(all);
      name = `${d.slug_en}.md`;
    }
    await fsp.writeFile(path.join(PROPS, name), toMd(d, body), 'utf8');
    scheduleBuild();
    return json(res, 200, { ok: true, file: name, ref: d.ref, url: `/properties/${d.slug_en}/` });
  }
  const del = route.match(/^listings\/([a-z0-9-]+\.md)$/);
  if (del && method === 'DELETE') {
    if (!FILE_RE.test(del[1])) return json(res, 400, { error: 'اسم غير صالح' });
    await fsp.rm(path.join(PROPS, del[1]), { force: true });
    scheduleBuild();
    return json(res, 200, { ok: true });
  }
  if (route === 'upload' && method === 'POST') {
    const { name, dataUrl } = await readBody(req);
    const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(res, 400, { error: 'الصورة يجب أن تكون JPG أو PNG أو WEBP' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return json(res, 413, { error: 'الصورة أكبر من 8 ميجا' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const base = String(name || 'photo').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'photo';
    const fname = `${base}-${Date.now().toString(36)}.${ext}`;
    await fsp.mkdir(UPLOADS, { recursive: true });
    await fsp.writeFile(path.join(UPLOADS, fname), buf);
    return json(res, 200, { ok: true, path: `/uploads/properties/${fname}` });
  }
  if (route === 'district' && method === 'POST') {
    const { city, name, slug } = await readBody(req);
    const loc = await readJson(LOC);
    const c = loc.cities.find((x) => x.slug === city);
    const nm = String(name || '').trim().replace(/^حي\s+/, '');
    if (!c || !nm) return json(res, 400, { error: 'اختر المدينة واكتب اسم الحي' });
    const sl = (String(slug || '').trim().toLowerCase() || translit(nm)).replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!sl) return json(res, 400, { error: 'اكتب اسم الحي بالإنجليزي' });
    const dup = c.districts.find((x) => x.slug === sl || x.name === nm);
    if (dup) return json(res, 200, { ok: true, slug: dup.slug, name: dup.name });
    c.districts.push({ slug: sl, name: nm });
    await fsp.writeFile(LOC, JSON.stringify(loc, null, 2) + '\n', 'utf8');
    return json(res, 200, { ok: true, slug: sl, name: nm });
  }
  if (route === 'rebuild' && method === 'POST') { scheduleBuild(); return json(res, 200, { ok: true }); }
  return json(res, 404, { error: 'not found' });
}

// ---------- server ----------
const SEC_HEADERS = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, nofollow' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/admin' || p === '/admin/index.html') return send(res, 301, '', { Location: '/admin/' });
    if (p === '/admin/') {
      return send(res, 200, await fsp.readFile(ADMIN_HTML), { 'Content-Type': 'text/html; charset=utf-8', ...SEC_HEADERS });
    }
    if (p.startsWith('/admin/api/')) {
      for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
      return await api(req, res, p.slice('/admin/api/'.length));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
    return await serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.code && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'خطأ في الخادم' });
  }
}).listen(PORT, () => {
  console.log(`الموقع يعمل على http://localhost:${PORT}  —  اللوحة: http://localhost:${PORT}/admin/`);
  // with a volume, rebuild on start so the site reflects the saved data, not the repo copy
  if (DATA_DIR || !fs.existsSync(path.join(DIST, 'index.html'))) scheduleBuild();
});
