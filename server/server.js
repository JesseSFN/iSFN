/*
 * iSFN - kleine webserver voor in Docker. Geen npm-dependencies, alleen Node.
 *
 *  - Serveert de site (en bij GitHub Pages-paden zoals /iSFN/... ook die).
 *  - Beheer (game/admin.html) alleen na inloggen met ADMIN_PASSWORD.
 *  - Ingelogd kun je vragen opslaan en afbeeldingen/audio/video uploaden; spelers
 *    zien de wijziging direct, zonder commit of nieuwe build.
 *
 * Alles wat je bewaart staat in DATA_DIR (in Docker: het volume /data):
 *   locations.js        de vragen (overschaduwt game/locations.js uit de image)
 *   media-vragen/       geüploade media (aangevuld door die uit de image)
 *
 * Instellingen (omgevingsvariabelen):
 *   ADMIN_PASSWORD   verplicht voor het beheer, minimaal 8 tekens
 *   PORT             standaard 8080
 *   DATA_DIR         standaard ./data
 *   MAX_UPLOAD_MB    standaard 50
 *   TRUST_PROXY=1    achter een reverse proxy: gebruik X-Forwarded-For/-Proto
 *   COOKIE_SECURE=1  zet "Secure" op de sessiecookie (bij https)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { pipeline } = require('node:stream/promises');
const admin = require('../game/admin.js'); // dezelfde controle en opmaak als de beheerpagina

// ----------------------------------------------------------------- instellingen
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT === undefined ? 8080 : Number(process.env.PORT);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ENABLED = PASSWORD.length >= 8;
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = 'isfn_session';
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const FAIL_DELAY_MS = 400;

const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.js');
const MEDIA_DIR = path.join(DATA_DIR, 'media-vragen');
const MAX_QUESTIONS = 1000;

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', mp3: 'audio/mpeg',
  wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm'
};
const UPLOAD_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'mp4', 'webm'];

// Alleen deze onderdelen van de repository zijn van buiten bereikbaar.
const PUBLIC_FILES = new Set(['index.html', 'keuze-menu.html', 'style.css']);
const PUBLIC_DIRS = ['game', 'Images', 'Sounds', 'media-vragen'];
const ADMIN_ASSETS = new Set(['game/admin.html', 'game/admin.js', 'game/admin.css']);

function log(message) { console.log(new Date().toISOString() + ' ' + message); }

// ----------------------------------------------------------------- sessies en inlogpogingen
const sessions = new Map();   // token -> verloopmoment
const attempts = new Map();   // ip -> { fails, lockedUntil }

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1]; // wat de eigen proxy erbij zette
  }
  return req.socket.remoteAddress || 'onbekend';
}

function isSecureRequest(req) {
  return COOKIE_SECURE || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function isAuthed(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function passwordMatches(candidate) {
  // Vergelijking van hashes met gelijke lengte: geen verschil in tijd door waar het wachtwoord afwijkt.
  const a = crypto.createHash('sha256').update(String(candidate)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

setInterval(() => {
  const now = Date.now();
  sessions.forEach((expires, token) => { if (expires < now) sessions.delete(token); });
  attempts.forEach((a, ip) => { if (a.lockedUntil < now && a.fails < MAX_FAILS && !a.touched) attempts.delete(ip); a.touched = false; });
}, 10 * 60 * 1000).unref();

// ----------------------------------------------------------------- hulpfuncties voor antwoorden
function baseHeaders(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin', // OSM-tegels (reservekaart) eisen een Referer
    'X-Frame-Options': 'DENY'
  }, extra);
}

function sendJson(res, status, body, extraHeaders) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, baseHeaders(Object.assign({
    'Content-Type': MIME.json, 'Content-Length': data.length, 'Cache-Control': 'no-store'
  }, extraHeaders)));
  res.end(data);
}

function sendText(res, status, text) {
  const data = Buffer.from(text);
  res.writeHead(status, baseHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' }));
  res.end(data);
}

function redirect(res, location) {
  res.writeHead(302, baseHeaders({ Location: location, 'Cache-Control': 'no-store' }));
  res.end();
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) { reject(new HttpError(413, 'Bestand of verzoek is te groot.')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new HttpError(413, 'Bestand of verzoek is te groot.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, MAX_JSON_BYTES);
  try { return JSON.parse(body.toString('utf8')); } catch (e) { throw new HttpError(400, 'Ongeldige JSON.'); }
}

// Muterende verzoeken moeten een eigen header meesturen. Een andere website kan
// dat niet (zonder CORS-toestemming, die wij nooit geven), naast SameSite=Strict op de cookie.
function requireAdminHeader(req) {
  if (req.headers['x-admin'] !== '1') throw new HttpError(403, 'Ontbrekende beveiligingsheader.');
}

function requireAuth(req) {
  if (!ADMIN_ENABLED) throw new HttpError(503, 'Beheer staat uit: stel ADMIN_PASSWORD in (minimaal 8 tekens).');
  if (!isAuthed(req)) throw new HttpError(401, 'Niet ingelogd of sessie verlopen.');
}

// ----------------------------------------------------------------- vragen
function parseLocationsFile(text) {
  const sandbox = {};
  vm.runInNewContext(text + '\nthis.locations = locations;', sandbox, { timeout: 2000 });
  return sandbox.locations;
}

async function readCurrentQuestions() {
  let text;
  try { text = await fsp.readFile(LOCATIONS_FILE, 'utf8'); }
  catch (e) { text = await fsp.readFile(path.join(ROOT, 'game', 'locations.js'), 'utf8'); }
  return parseLocationsFile(text);
}

const MEDIA_PATH = /^\.\.\/media-vragen\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Bouwt een schone lijst op uit wat de browser stuurt en meldt alle fouten.
function sanitizeQuestions(input) {
  const errors = [];
  if (!Array.isArray(input)) return { errors: ['De vragen moeten een lijst zijn.'] };
  if (input.length > MAX_QUESTIONS) return { errors: ['Te veel vragen (maximaal ' + MAX_QUESTIONS + ').'] };

  const clean = input.map(raw => {
    const q = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return q;
    ['name', 'hint', 'ans', 'media'].forEach(key => { q[key] = typeof raw[key] === 'string' ? raw[key] : ''; });
    ['lat', 'lng', 'radius'].forEach(key => { q[key] = typeof raw[key] === 'number' ? raw[key] : NaN; });
    Object.keys(raw).forEach(key => {
      const value = raw[key];
      const simple = ['string', 'number', 'boolean'].includes(typeof value);
      if (!['name', 'hint', 'ans', 'media', 'lat', 'lng', 'radius'].includes(key) && /^[A-Za-z_]\w{0,40}$/.test(key) && key !== '__proto__' && simple) {
        q[key] = value;
      }
    });
    return q;
  });

  clean.forEach((q, i) => {
    const label = 'Vraag ' + (i + 1) + (q.name ? ' (' + q.name + ')' : '') + ': ';
    admin.validateQuestion(q, clean, i).forEach(message => errors.push(label + message));
    if (q.name.length > 200) errors.push(label + 'de naam is te lang (maximaal 200 tekens).');
    if (q.hint.length > 3000) errors.push(label + 'de hint is te lang (maximaal 3000 tekens).');
    if (q.ans.length > 1000) errors.push(label + 'het antwoord is te lang (maximaal 1000 tekens).');
    if (q.media && !MEDIA_PATH.test(q.media)) {
      errors.push(label + 'media moet naar ../media-vragen/<bestandsnaam> wijzen.');
    }
  });
  return { errors, clean };
}

async function writeFileAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

// Zelfde inhoud = zelfde tekst, ongeacht de volgorde van de velden binnen een vraag.
function canonicalJson(value) {
  return JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
}

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 20;

// Bewaart de huidige vragen als back-up voordat ze worden overschreven (de laatste 20).
async function backupCurrent() {
  try {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(LOCATIONS_FILE, path.join(BACKUP_DIR, 'locations-' + stamp + '.js'));
    const files = (await fsp.readdir(BACKUP_DIR)).filter(f => /^locations-.*\.js$/.test(f)).sort();
    for (const old of files.slice(0, -KEEP_BACKUPS)) await fsp.unlink(path.join(BACKUP_DIR, old));
  } catch (e) {
    log('Back-up maken mislukt (opslaan gaat door): ' + e.message);
  }
}

let saveQueue = Promise.resolve(); // één opslag tegelijk, zodat twee verzoeken elkaar niet overschrijven

function saveQuestions(clean, baseJson) {
  const job = saveQueue.then(async () => {
    const current = await readCurrentQuestions();
    if (typeof baseJson === 'string') {
      let base;
      try { base = JSON.parse(baseJson); } catch (e) { throw new HttpError(400, 'Ongeldige uitgangsversie.'); }
      if (canonicalJson(base) !== canonicalJson(current)) {
        throw new HttpError(409, 'De vragen zijn intussen op de server veranderd (door jou in een ander tabblad of door iemand anders). Herlaad de pagina en probeer het opnieuw.');
      }
    }
    await backupCurrent();
    await writeFileAtomic(LOCATIONS_FILE, admin.serializeLocations(clean));
  });
  saveQueue = job.catch(() => {});
  return job;
}

// ----------------------------------------------------------------- media
function magicMatches(ext, buf) {
  const at = (bytes, offset) => bytes.every((b, i) => buf[(offset || 0) + i] === b);
  switch (ext) {
    case 'png': return at([0x89, 0x50, 0x4e, 0x47]);
    case 'jpg': case 'jpeg': return at([0xff, 0xd8, 0xff]);
    case 'gif': return at([0x47, 0x49, 0x46, 0x38]);
    case 'webp': return at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8);
    case 'wav': return at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x41, 0x56, 0x45], 8);
    case 'mp3': return at([0x49, 0x44, 0x33]) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'ogg': return at([0x4f, 0x67, 0x67, 0x53]);
    case 'mp4': return at([0x66, 0x74, 0x79, 0x70], 4);
    case 'webm': return at([0x1a, 0x45, 0xdf, 0xa3]);
    default: return false;
  }
}

const MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;

async function listMedia() {
  const names = new Map();
  for (const dir of [path.join(ROOT, 'media-vragen'), MEDIA_DIR]) {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { /* map bestaat niet */ }
    for (const entry of entries) {
      if (!entry.isFile() || !MEDIA_NAME.test(entry.name)) continue;
      const ext = entry.name.split('.').pop().toLowerCase();
      if (!UPLOAD_EXTENSIONS.includes(ext)) continue;
      const stat = await fsp.stat(path.join(dir, entry.name));
      names.set(entry.name, stat.size);
    }
  }
  return Array.from(names, ([name, size]) => ({ name, size })).sort((a, b) => a.name.localeCompare(b.name));
}

async function mediaExists(name) {
  for (const dir of [path.join(ROOT, 'media-vragen'), MEDIA_DIR]) {
    try { await fsp.access(path.join(dir, name)); return true; } catch (e) { /* volgende map */ }
  }
  return false;
}

async function handleUpload(req, res, url) {
  const name = url.searchParams.get('name') || '';
  const overwrite = url.searchParams.get('overwrite') === '1';
  const ext = name.split('.').pop().toLowerCase();

  if (!MEDIA_NAME.test(name) || name.includes('..') || !name.includes('.')) {
    throw new HttpError(400, 'Ongeldige bestandsnaam. Gebruik letters, cijfers, punt, streepje en underscore.');
  }
  if (!UPLOAD_EXTENSIONS.includes(ext)) {
    throw new HttpError(400, 'Dit bestandstype is niet toegestaan. Toegestaan: ' + UPLOAD_EXTENSIONS.join(', ') + '.');
  }
  if (!overwrite && await mediaExists(name)) {
    throw new HttpError(409, 'Er bestaat al een bestand met de naam "' + name + '".');
  }

  const body = await readBody(req, MAX_UPLOAD_BYTES);
  if (body.length === 0) throw new HttpError(400, 'Leeg bestand.');
  if (!magicMatches(ext, body)) throw new HttpError(400, 'De inhoud van het bestand past niet bij ".' + ext + '".');

  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  await writeFileAtomic(path.join(MEDIA_DIR, name), body);
  return { name, path: '../media-vragen/' + name, size: body.length };
}

// ----------------------------------------------------------------- statische bestanden
// Vertaalt een URL naar een pad binnen de toegestane onderdelen, of null.
function publicRelPath(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p === '/iSFN' || p.startsWith('/iSFN/')) p = p.slice(5) || '/'; // paden van de GitHub Pages-versie
  if (p === '/') p = '/index.html';
  const parts = p.split('/').slice(1);
  if (parts.some(s => s === '' || s.startsWith('.'))) return null;
  const rel = parts.join('/');
  if (parts.length === 1) return PUBLIC_FILES.has(rel) ? rel : null;
  return PUBLIC_DIRS.includes(parts[0]) ? rel : null;
}

async function locateFile(rel) {
  let candidates;
  if (rel === 'game/locations.js') candidates = [LOCATIONS_FILE, path.join(ROOT, rel)];
  else if (rel.startsWith('media-vragen/')) candidates = [path.join(MEDIA_DIR, rel.slice('media-vragen/'.length)), path.join(ROOT, rel)];
  else candidates = [path.join(ROOT, rel)];

  for (const file of candidates) {
    try {
      const stat = await fsp.stat(file);
      if (stat.isFile()) return { file, stat };
    } catch (e) { /* volgende kandidaat */ }
  }
  return null;
}

async function sendFile(req, res, file, stat) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  const headers = baseHeaders({
    'Content-Type': type, 'ETag': etag, 'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes'
  });

  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }

  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  // Range-verzoeken: nodig om te kunnen spoelen in video/audio (o.a. Safari op iOS).
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (m[1] === '' && m[2] === '')) {
      res.writeHead(416, Object.assign(headers, { 'Content-Range': 'bytes */' + stat.size })); res.end(); return;
    }
    if (m[1] === '') { start = Math.max(0, stat.size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
    if (start > end || start >= stat.size) {
      res.writeHead(416, Object.assign(headers, { 'Content-Range': 'bytes */' + stat.size })); res.end(); return;
    }
    status = 206;
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
  }

  headers['Content-Length'] = stat.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
  try { await pipeline(fs.createReadStream(file, { start, end }), res); }
  catch (e) { /* de bezoeker brak het af */ }
}

// ----------------------------------------------------------------- routes
async function handleApi(req, res, url) {
  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /api/session') {
    return sendJson(res, 200, { server: true, enabled: ADMIN_ENABLED, authed: ADMIN_ENABLED && isAuthed(req) });
  }

  if (route === 'POST /api/login') {
    requireAdminHeader(req);
    if (!ADMIN_ENABLED) throw new HttpError(503, 'Beheer staat uit: stel ADMIN_PASSWORD in (minimaal 8 tekens).');
    const ip = clientIp(req);
    const state = attempts.get(ip) || { fails: 0, lockedUntil: 0 };
    state.touched = true;
    if (state.lockedUntil > Date.now()) {
      const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
      return sendJson(res, 429, { error: 'Te veel pogingen. Probeer het over ' + Math.ceil(seconds / 60) + ' minuten opnieuw.' }, { 'Retry-After': String(seconds) });
    }
    const body = await readJson(req);
    if (typeof body.password === 'string' && passwordMatches(body.password)) {
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      log('Ingelogd vanaf ' + ip);
      const cookie = COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + SESSION_MS / 1000 + (isSecureRequest(req) ? '; Secure' : '');
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }
    state.fails += 1;
    if (state.fails >= MAX_FAILS) { state.lockedUntil = Date.now() + LOCK_MS; state.fails = 0; log('Inloggen geblokkeerd voor ' + ip + ' (te veel pogingen)'); }
    attempts.set(ip, state);
    log('Mislukte inlogpoging vanaf ' + ip);
    await new Promise(r => setTimeout(r, FAIL_DELAY_MS)); // vertraagt het gokken
    return sendJson(res, 401, { error: 'Onjuist wachtwoord.' });
  }

  if (route === 'POST /api/logout') {
    requireAdminHeader(req);
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }

  if (route === 'PUT /api/questions') {
    requireAuth(req); requireAdminHeader(req);
    const body = await readJson(req);
    const { errors, clean } = sanitizeQuestions(body && body.questions);
    if (!errors.length) {
      for (let i = 0; i < clean.length; i++) {
        const file = clean[i].media && clean[i].media.slice('../media-vragen/'.length);
        if (file && !(await mediaExists(file))) {
          errors.push('Vraag ' + (i + 1) + ' (' + clean[i].name + '): het mediabestand "' + file + '" bestaat niet. Upload het eerst.');
        }
      }
    }
    if (errors.length) return sendJson(res, 422, { error: 'De vragen zijn niet geldig.', details: errors });
    await saveQuestions(clean, body.base);
    log('Vragen opgeslagen (' + clean.length + ') door ' + clientIp(req));
    return sendJson(res, 200, { ok: true, count: clean.length });
  }

  if (route === 'GET /api/media') {
    requireAuth(req);
    return sendJson(res, 200, { files: await listMedia(), maxBytes: MAX_UPLOAD_BYTES });
  }

  if (route === 'POST /api/media') {
    requireAuth(req); requireAdminHeader(req);
    const saved = await handleUpload(req, res, url);
    log('Media geüpload: ' + saved.name + ' (' + saved.size + ' bytes) door ' + clientIp(req));
    return sendJson(res, 200, saved);
  }

  throw new HttpError(404, 'Onbekend adres.');
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') return sendText(res, 200, 'ok');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, baseHeaders({ Allow: 'GET, HEAD' })); res.end(); return;
  }

  if (url.pathname === '/admin' || url.pathname === '/admin/') return redirect(res, '/game/admin.html');
  if (url.pathname === '/admin/login') {
    const html = await fsp.readFile(path.join(__dirname, 'login.html'));
    res.writeHead(200, baseHeaders({ 'Content-Type': MIME.html, 'Cache-Control': 'no-store', 'Content-Length': html.length }));
    return res.end(req.method === 'HEAD' ? undefined : html);
  }

  const rel = publicRelPath(url.pathname);
  if (!rel) return sendText(res, 404, 'Niet gevonden');

  // De beheerpagina zelf is ook alleen voor ingelogde beheerders.
  if (ADMIN_ASSETS.has(rel) && !(ADMIN_ENABLED && isAuthed(req))) {
    if (rel === 'game/admin.html') return redirect(res, '/admin/login');
    return sendText(res, 401, 'Niet ingelogd');
  }

  const found = await locateFile(rel);
  if (!found) return sendText(res, 404, 'Niet gevonden');
  return sendFile(req, res, found.file, found.stat);
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      if (res.headersSent) { res.destroy(); return; }
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      log('Fout: ' + (err && err.stack || err));
      sendJson(res, 500, { error: 'Er ging iets mis op de server.' });
    });
  });
}

async function prepareData() {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  try { await fsp.access(LOCATIONS_FILE); }
  catch (e) {
    await fsp.copyFile(path.join(ROOT, 'game', 'locations.js'), LOCATIONS_FILE);
    log('Eerste start: vragen uit de image gekopieerd naar ' + LOCATIONS_FILE);
  }
}

async function main() {
  await prepareData();
  const server = createServer();
  server.requestTimeout = 5 * 60 * 1000;
  server.listen(PORT, '0.0.0.0', () => {
    log('Luistert op http://0.0.0.0:' + server.address().port + ' (data: ' + DATA_DIR + ')');
    if (!ADMIN_ENABLED) log('LET OP: ADMIN_PASSWORD ontbreekt of is korter dan 8 tekens, het beheer staat uit.');
  });
  const stop = () => { log('Afsluiten…'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { publicRelPath, sanitizeQuestions, magicMatches, canonicalJson };
