// Tests van de Docker-server:  node tests/server.cjs
//
// Start de échte server (server/server.js) in een tijdelijke map en test hem via HTTP:
// bestanden, beveiliging van het beheer, inloggen, opslaan, uploads en herstarten.
// Geen dependencies, geen Docker nodig.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const PASSWORD = 'testwachtwoord-123';

let passed = 0;
let failures = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ hulpmiddelen
function startServer(env = {}, dataDir) {
  dataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'isfn-data-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'server/server.js')], {
      env: { PATH: process.env.PATH, PORT: '0', DATA_DIR: dataDir, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const timer = setTimeout(() => reject(new Error('server startte niet: ' + output)), 8000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const m = /Luistert op http:\/\/0\.0\.0\.0:(\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolve({
          port: Number(m[1]), dataDir, child, log: () => output,
          stop: () => new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); })
        });
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('exit', code => { clearTimeout(timer); reject(new Error('server stopte met code ' + code + ': ' + output)); });
  });
}

async function call(server, method, url, { headers = {}, body, cookie, admin = true } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (admin && method !== 'GET' && method !== 'HEAD') h['X-Admin'] = '1';
  let payload = body;
  if (body !== undefined && typeof body === 'object' && !Buffer.isBuffer(body)) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  const res = await fetch(`http://127.0.0.1:${server.port}${url}`, { method, headers: h, body: payload, redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* geen JSON */ }
  return { status: res.status, headers: res.headers, buf, text: buf.toString('utf8'), json };
}

// Zonder dat de URL wordt genormaliseerd (fetch ruimt ../ op; een aanvaller niet).
function rawGet(server, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.port, path: rawPath }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

async function login(server, password = PASSWORD, extra = {}) {
  const res = await call(server, 'POST', '/api/login', { body: { password }, ...extra });
  const setCookie = res.headers.get('set-cookie');
  return { res, cookie: setCookie ? setCookie.split(';')[0] : null, setCookie };
}

const parseLocations = text => {
  const sandbox = {};
  vm.runInNewContext(text + '\nthis.locations = locations;', sandbox);
  return sandbox.locations;
};
const png = (extraBytes = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32 + extraBytes, 7)]);
const newQuestion = (name, extra = {}) => ({ name, hint: 'Een hint', ans: 'antwoord', media: '', lat: 52.37, lng: 4.89, radius: 2, ...extra });

(async () => {
  const repoLocations = fs.readFileSync(path.join(root, 'game/locations.js'), 'utf8');
  const servers = [];
  const start = async (...args) => { const s = await startServer(...args); servers.push(s); return s; };

  try {
    // ================================================================ bestanden
    console.log('Bestanden');
    const s = await start({ ADMIN_PASSWORD: PASSWORD });
    {
      check('/healthz geeft ok', (await call(s, 'GET', '/healthz')).text === 'ok');
      const home = await call(s, 'GET', '/');
      check('/ toont de startpagina', home.status === 200 && /text\/html/.test(home.headers.get('content-type')) && /<html/i.test(home.text));
      check('beveiligingsheaders staan aan', home.headers.get('x-content-type-options') === 'nosniff' && home.headers.get('x-frame-options') === 'DENY');
      check('Referrer-Policy stuurt de herkomst mee (nodig voor OSM-tegels)', home.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
      check('GitHub Pages-pad /iSFN/... werkt ook', (await call(s, 'GET', '/iSFN/Images/iSFN_favicon.png')).status === 200);
      check('spelpagina en script worden geserveerd', (await call(s, 'GET', '/game/game-explo.html')).status === 200 && (await call(s, 'GET', '/game/map.js')).status === 200);
      check('afbeelding krijgt het juiste type', /image\/png/.test((await call(s, 'GET', '/Images/iSFN_favicon.png')).headers.get('content-type')));
      check('HEAD werkt', (await call(s, 'HEAD', '/style.css')).status === 200);
      check('POST op een bestand geeft 405', (await call(s, 'POST', '/index.html', { body: 'x' })).status === 405);

      for (const p of ['/.git/config', '/server/server.js', '/server/login.html', '/tests/check.mjs', '/README.md', '/data/locations.js', '/game/../server/server.js', '/%2e%2e/server/server.js', '/game/%2e%2e/server/server.js', '/game/..%2fserver/server.js', '/media-vragen/../server/server.js', '/game/.hidden', '/%00']) {
        const r = await rawGet(s, p);
        check(`niet bereikbaar: ${p}`, r.status === 404 && !/createServer|ADMIN_PASSWORD/.test(r.text), r.status);
      }

      const mp4 = '/media-vragen/weg.mp4';
      const size = fs.statSync(path.join(root, 'media-vragen/weg.mp4')).size;
      const part = await call(s, 'GET', mp4, { headers: { Range: 'bytes=0-99' } });
      check('Range (nodig voor video op iOS): 206 met juiste lengte', part.status === 206 && part.buf.length === 100 && part.headers.get('content-range') === `bytes 0-99/${size}`, `${part.status} ${part.headers.get('content-range')}`);
      const tail = await call(s, 'GET', mp4, { headers: { Range: 'bytes=-10' } });
      check('Range: laatste 10 bytes', tail.status === 206 && tail.buf.length === 10);
      check('Range buiten het bestand geeft 416', (await call(s, 'GET', mp4, { headers: { Range: `bytes=${size + 5}-` } })).status === 416);
      check('video zegt dat Range wordt ondersteund', (await call(s, 'HEAD', mp4)).headers.get('accept-ranges') === 'bytes');
      const first = await call(s, 'GET', '/style.css');
      check('ETag: onveranderd bestand geeft 304', (await call(s, 'GET', '/style.css', { headers: { 'If-None-Match': first.headers.get('etag') } })).status === 304);

      const served = await call(s, 'GET', '/game/locations.js');
      check('eerste start: de vragen uit de repository worden geserveerd', served.text === repoLocations);
      check('eerste start: vragen zijn naar de datamap gekopieerd', fs.existsSync(path.join(s.dataDir, 'locations.js')));
    }

    // ================================================================ beveiliging
    console.log('Beveiliging van het beheer');
    {
      const session = await call(s, 'GET', '/api/session');
      check('sessie-info: beheer aan, niet ingelogd', session.json && session.json.server === true && session.json.enabled === true && session.json.authed === false);
      const page = await call(s, 'GET', '/game/admin.html');
      check('beheerpagina zonder login stuurt door naar de loginpagina', page.status === 302 && page.headers.get('location') === '/admin/login');
      check('/admin stuurt door naar de beheerpagina', (await call(s, 'GET', '/admin')).headers.get('location') === '/game/admin.html');
      check('beheerscript en -stijl zijn ook niet zonder login op te halen', (await call(s, 'GET', '/game/admin.js')).status === 401 && (await call(s, 'GET', '/game/admin.css')).status === 401);
      const loginPage = await call(s, 'GET', '/admin/login');
      check('loginpagina is wel bereikbaar', loginPage.status === 200 && /type="password"/.test(loginPage.text));

      check('opslaan zonder login: 401', (await call(s, 'PUT', '/api/questions', { body: { questions: [] } })).status === 401);
      check('media uploaden zonder login: 401', (await call(s, 'POST', '/api/media?name=a.png', { body: png() })).status === 401);
      check('media-lijst zonder login: 401', (await call(s, 'GET', '/api/media')).status === 401);
      check('vals cookie telt niet', (await call(s, 'GET', '/api/media', { cookie: 'isfn_session=abc123' })).status === 401);

      check('inloggen zonder beveiligingsheader: 403', (await call(s, 'POST', '/api/login', { body: { password: PASSWORD }, admin: false })).status === 403);
      const started = Date.now();
      const wrong = await login(s, 'fout wachtwoord');
      check('fout wachtwoord: 401 met melding, zonder cookie', wrong.res.status === 401 && /Onjuist/.test(wrong.res.json.error) && !wrong.setCookie);
      check('fout wachtwoord wordt vertraagd (gokken kost tijd)', Date.now() - started >= 350, Date.now() - started + ' ms');
      check('leeg wachtwoord en niet-tekst worden geweigerd',
        (await call(s, 'POST', '/api/login', { body: { password: '' } })).status === 401 && (await call(s, 'POST', '/api/login', { body: { password: 12345678 } })).status === 401);
      check('ongeldige JSON bij inloggen: 400', (await call(s, 'POST', '/api/login', { body: '{kapot', headers: { 'Content-Type': 'application/json' } })).status === 400);

      const ok = await login(s);
      check('juist wachtwoord: 200 en sessiecookie', ok.res.status === 200 && /^isfn_session=[0-9a-f]{64}$/.test(ok.cookie));
      check('cookie is HttpOnly en SameSite=Strict', /HttpOnly/.test(ok.setCookie) && /SameSite=Strict/.test(ok.setCookie));
      check('cookie zonder https heeft geen Secure (anders werkt inloggen niet)', !/Secure/.test(ok.setCookie));
      s.cookie = ok.cookie;

      const admin = await call(s, 'GET', '/game/admin.html', { cookie: s.cookie });
      check('ingelogd: beheerpagina is bereikbaar', admin.status === 200 && /Vragenbeheer/.test(admin.text));
      check('ingelogd: sessie-info zegt authed', (await call(s, 'GET', '/api/session', { cookie: s.cookie })).json.authed === true);
      check('opslaan zonder X-Admin-header: 403 (bescherming tegen andere websites)', (await call(s, 'PUT', '/api/questions', { body: { questions: [] }, cookie: s.cookie, admin: false })).status === 403);
      check('OPTIONS (CORS-preflight) wordt niet toegestaan', !(await call(s, 'OPTIONS', '/api/questions', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' } })).headers.get('access-control-allow-origin'));
      check('onbekend API-adres: 404 als JSON', (await call(s, 'GET', '/api/bestaat-niet', { cookie: s.cookie })).status === 404);
    }

    // ================================================================ opslaan
    console.log('Vragen opslaan');
    {
      const cookie = s.cookie;
      const current = parseLocations((await call(s, 'GET', '/game/locations.js')).text);
      const total = current.length;
      const save = (questions, base, extra) => call(s, 'PUT', '/api/questions', { body: { questions, base: JSON.stringify(base) }, cookie, ...extra });

      const added = [...current, newQuestion('Nieuwe vraag "met" aanhalingstekens', { hint: 'regel 1\nregel 2 </script>' })];
      const first = await save(added, current);
      check('geldige lijst opslaan: 200', first.status === 200 && first.json.count === total + 1, first.text);
      const afterText = (await call(s, 'GET', '/game/locations.js')).text;
      const after = parseLocations(afterText);
      check('spelers krijgen direct de nieuwe vraag', after.length === total + 1 && after[total].name === 'Nieuwe vraag "met" aanhalingstekens' && after[total].hint.includes('</script>'));
      check('bestand in de datamap is bijgewerkt', fs.readFileSync(path.join(s.dataDir, 'locations.js'), 'utf8') === afterText);
      check('het bestand in de repository blijft ongemoeid', fs.readFileSync(path.join(root, 'game/locations.js'), 'utf8') === repoLocations);
      check('er is een back-up van de vorige versie gemaakt', fs.readdirSync(path.join(s.dataDir, 'backups')).length === 1 &&
        fs.readFileSync(path.join(s.dataDir, 'backups', fs.readdirSync(path.join(s.dataDir, 'backups'))[0]), 'utf8') === repoLocations);
      check('opslaan laat geen tijdelijke bestanden achter', fs.readdirSync(s.dataDir).every(f => !f.endsWith('.tmp')));

      // De browser stuurt zijn eigen lijst als uitgangspunt; die heeft een andere veldvolgorde dan het bestand.
      const reordered = added.map(q => Object.fromEntries(Object.entries(q).reverse()));
      const second = await save([...reordered, newQuestion('Tweede nieuwe')], reordered);
      check('tweede keer opslaan met andere veldvolgorde geeft geen vals conflict', second.status === 200, second.text);

      const stale = await save([...current, newQuestion('Verouderd')], current);
      check('opslaan met een verouderde uitgangsversie: 409', stale.status === 409 && /veranderd/.test(stale.json.error));

      const latest = parseLocations((await call(s, 'GET', '/game/locations.js')).text);
      const race = await Promise.all([
        save([...latest, newQuestion('Race A')], latest),
        save([...latest, newQuestion('Race B')], latest)
      ]);
      check('twee gelijktijdige opslagen: precies één lukt, de ander krijgt 409',
        race.map(r => r.status).sort().join() === '200,409', race.map(r => r.status).join());

      const now = parseLocations((await call(s, 'GET', '/game/locations.js')).text);
      const bad = async (label, questions, expectedPart) => {
        const r = await save(questions, now);
        check(`geweigerd (422): ${label}`, r.status === 422 && (!expectedPart || r.json.details.join(' ').includes(expectedPart)), r.status + ' ' + (r.json && JSON.stringify(r.json.details)));
      };
      await bad('dubbele naam', [...now, newQuestion(now[0].name)], 'bestaat al');
      await bad('breedtegraad 91', [...now, newQuestion('X', { lat: 91 })]);
      await bad('lengtegraad -181', [...now, newQuestion('X', { lng: -181 })]);
      await bad('straal 0', [...now, newQuestion('X', { radius: 0 })]);
      await bad('coördinaat als tekst', [...now, newQuestion('X', { lat: '52.1' })]);
      await bad('lege naam', [...now, newQuestion('  ')]);
      await bad('geen hint en geen media', [...now, newQuestion('X', { hint: '' })]);
      await bad('media met javascript:', [...now, newQuestion('X', { media: 'javascript:alert(1)' })]);
      await bad('media naar een andere map', [...now, newQuestion('X', { media: '../../etc/passwd' })]);
      await bad('media als externe URL', [...now, newQuestion('X', { media: 'https://evil.example/x.png' })]);
      await bad('media die niet bestaat', [...now, newQuestion('X', { media: '../media-vragen/bestaat-niet.png' })], 'bestaat niet');
      await bad('te lange naam', [...now, newQuestion('n'.repeat(201))], 'te lang');
      await bad('geen lijst', { name: 'x' });
      await bad('meer dan 1000 vragen', Array.from({ length: 1001 }, (_, i) => newQuestion('Q' + i)), 'Te veel');
      check('na geweigerde pogingen is niets veranderd', (await call(s, 'GET', '/game/locations.js')).text === (await call(s, 'GET', '/game/locations.js')).text &&
        parseLocations((await call(s, 'GET', '/game/locations.js')).text).length === now.length);

      const big = await call(s, 'PUT', '/api/questions', { body: JSON.stringify({ questions: [], pad: 'x'.repeat(2.5 * 1024 * 1024) }), headers: { 'Content-Type': 'application/json' }, cookie });
      check('te groot verzoek: 413', big.status === 413);
      check('ongeldige JSON bij opslaan: 400', (await call(s, 'PUT', '/api/questions', { body: '{kapot', headers: { 'Content-Type': 'application/json' }, cookie })).status === 400);

      const empty = await save([], now);
      check('alle vragen verwijderen is toegestaan en geeft een geldig bestand', empty.status === 200 && parseLocations((await call(s, 'GET', '/game/locations.js')).text).length === 0);
      await save(now, []);

      // Back-ups: nooit meer dan 20
      let base = now;
      for (let i = 0; i < 24; i++) {
        const next = [...base.slice(0, 3), newQuestion('Lus ' + i)];
        const r = await save(next, base);
        if (r.status !== 200) { check('lus: opslaan lukt', false, r.text); break; }
        base = next;
      }
      check('er worden hooguit 20 back-ups bewaard', fs.readdirSync(path.join(s.dataDir, 'backups')).length === 20, fs.readdirSync(path.join(s.dataDir, 'backups')).length);
    }

    // ================================================================ media
    console.log('Media uploaden');
    {
      const cookie = s.cookie;
      const upload = (name, body, extra = '') => call(s, 'POST', `/api/media?name=${encodeURIComponent(name)}${extra}`, { body, cookie, headers: { 'Content-Type': 'application/octet-stream' } });

      const list = await call(s, 'GET', '/api/media', { cookie });
      check('media-lijst bevat bestaande bestanden', list.status === 200 && list.json.files.some(f => f.name === 'weg.mp4'));

      const data = png();
      const up = await upload('test-upload.png', data);
      check('png uploaden: 200 met pad', up.status === 200 && up.json.path === '../media-vragen/test-upload.png' && up.json.size === data.length, up.text);
      const served = await call(s, 'GET', '/media-vragen/test-upload.png');
      check('geüpload bestand wordt geserveerd met het juiste type', served.status === 200 && /image\/png/.test(served.headers.get('content-type')) && served.buf.equals(data));
      check('geüpload bestand staat in de datamap, niet in de repository', fs.existsSync(path.join(s.dataDir, 'media-vragen/test-upload.png')) && !fs.existsSync(path.join(root, 'media-vragen/test-upload.png')));
      check('geüpload bestand komt in de media-lijst', (await call(s, 'GET', '/api/media', { cookie })).json.files.some(f => f.name === 'test-upload.png'));

      const now = parseLocations((await call(s, 'GET', '/game/locations.js')).text);
      const withMedia = await call(s, 'PUT', '/api/questions', { body: { questions: [...now, newQuestion('Met media', { media: '../media-vragen/test-upload.png' })], base: JSON.stringify(now) }, cookie });
      check('een vraag met het geüploade bestand kan worden opgeslagen', withMedia.status === 200, withMedia.text);

      check('zelfde naam nogmaals: 409', (await upload('test-upload.png', data)).status === 409);
      check('overschrijven met overwrite=1: 200', (await upload('test-upload.png', png(5), '&overwrite=1')).status === 200);
      check('bestand uit de repository overschrijven zonder overwrite: 409', (await upload('weg.mp4', Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]))).status === 409);

      check('.exe wordt geweigerd', (await upload('virus.exe', png())).status === 400);
      check('.svg wordt geweigerd (kan scripts bevatten)', (await upload('plaatje.svg', Buffer.from('<svg onload="alert(1)"/>'))).status === 400);
      check('.html wordt geweigerd', (await upload('pagina.html', Buffer.from('<script>1</script>'))).status === 400);
      check('inhoud moet bij de extensie passen', (await upload('nep.png', Buffer.from('dit is geen plaatje'))).status === 400);
      check('padtruc in de bestandsnaam wordt geweigerd', (await upload('../evil.png', png())).status === 400 && (await upload('..%2Fevil.png', png())).status === 400);
      check('bestandsnaam die met een punt begint wordt geweigerd', (await upload('.verborgen.png', png())).status === 400);
      check('bestandsnaam met spaties of vreemde tekens wordt geweigerd', (await upload('mijn foto.png', png())).status === 400 && (await upload('a;b.png', png())).status === 400);
      check('bestandsnaam zonder extensie wordt geweigerd', (await upload('plaatje', png())).status === 400);
      check('leeg bestand wordt geweigerd', (await upload('leeg.png', Buffer.alloc(0))).status === 400);
      check('niets buiten de datamap geschreven', !fs.existsSync(path.join(s.dataDir, '../evil.png')) && !fs.existsSync(path.join(root, 'evil.png')));

      const other = [['mp3', Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00')], ['wav', Buffer.from('RIFF\x00\x00\x00\x00WAVE')], ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])],
        ['mp4', Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], ['webp', Buffer.from('RIFF\x00\x00\x00\x00WEBP')], ['gif', Buffer.from('GIF89a')]];
      for (const [ext, bytes] of other) {
        check(`.${ext} met passende inhoud wordt geaccepteerd`, (await upload('ok-' + ext + '.' + ext, bytes)).status === 200);
      }
    }

    // ================================================================ uitloggen en herstarten
    console.log('Uitloggen en herstarten');
    {
      const out = await call(s, 'POST', '/api/logout', { cookie: s.cookie });
      check('uitloggen: 200 en cookie wordt gewist', out.status === 200 && /Max-Age=0/.test(out.headers.get('set-cookie')));
      check('na uitloggen is het oude cookie ongeldig', (await call(s, 'GET', '/api/media', { cookie: s.cookie })).status === 401 && (await call(s, 'GET', '/game/admin.html', { cookie: s.cookie })).status === 302);

      const before = (await call(s, 'GET', '/game/locations.js')).text;
      const dataDir = s.dataDir;
      const oldCookie = (await login(s)).cookie;
      await s.stop();
      servers.splice(servers.indexOf(s), 1);
      const again = await start({ ADMIN_PASSWORD: PASSWORD }, dataDir);
      check('na herstart zijn de vragen er nog (zoals het Docker-volume)', (await call(again, 'GET', '/game/locations.js')).text === before);
      check('na herstart staat de geüploade media er nog', (await call(again, 'GET', '/media-vragen/ok-gif.gif')).status === 200);
      check('na herstart moet je opnieuw inloggen', (await call(again, 'GET', '/api/media', { cookie: oldCookie })).status === 401);
      check('na herstart wordt een bestaand bestand niet opnieuw overschreven door de seed', !/Eerste start/.test(again.log()));
    }

    // ================================================================ blokkeren na foute pogingen
    console.log('Blokkeren na foute pogingen');
    {
      const t = await start({ ADMIN_PASSWORD: PASSWORD, TRUST_PROXY: '1', COOKIE_SECURE: '1' });
      const fromA = { headers: { 'X-Forwarded-For': '203.0.113.7' } };
      for (let i = 0; i < 5; i++) await login(t, 'fout', fromA);
      const locked = await login(t, PASSWORD, fromA);
      check('na 5 foute pogingen is zelfs het juiste wachtwoord geblokkeerd (429)', locked.res.status === 429 && !locked.setCookie, locked.res.status);
      check('de blokkade meldt hoelang het duurt (Retry-After)', Number(locked.res.headers.get('retry-after')) > 800);
      const fromB = await login(t, PASSWORD, { headers: { 'X-Forwarded-For': '198.51.100.9' } });
      check('een ander IP-adres wordt niet meegeblokkeerd (TRUST_PROXY)', fromB.res.status === 200);
      check('COOKIE_SECURE=1 zet Secure op de cookie', /Secure/.test(fromB.setCookie));
      const spoof = await login(t, PASSWORD, { headers: { 'X-Forwarded-For': '1.2.3.4, 203.0.113.7' } });
      check('een door de bezoeker verzonnen X-Forwarded-For omzeilt de blokkade niet', spoof.res.status === 429, spoof.res.status);
    }

    // ================================================================ beheer uit
    console.log('Beheer uitgeschakeld');
    for (const [label, env] of [['zonder ADMIN_PASSWORD', {}], ['met te kort wachtwoord (7 tekens)', { ADMIN_PASSWORD: '1234567' }]]) {
      const t = await start(env);
      const info = await call(t, 'GET', '/api/session');
      check(`${label}: sessie-info zegt dat beheer uit staat`, info.json.enabled === false && info.json.authed === false);
      check(`${label}: inloggen kan niet (503)`, (await call(t, 'POST', '/api/login', { body: { password: '1234567' } })).status === 503);
      check(`${label}: beheerpagina niet bereikbaar`, (await call(t, 'GET', '/game/admin.html')).status === 302);
      check(`${label}: opslaan niet mogelijk`, [401, 503].includes((await call(t, 'PUT', '/api/questions', { body: { questions: [] } })).status));
      check(`${label}: het spel zelf werkt gewoon`, (await call(t, 'GET', '/game/game-explo.html')).status === 200 && (await call(t, 'GET', '/game/locations.js')).status === 200);
      check(`${label}: waarschuwing in de log`, /ADMIN_PASSWORD/.test(t.log()));
    }
  } finally {
    await Promise.all(servers.map(srv => srv.stop().catch(() => {})));
  }

  console.log(`\n${passed} gelukt, ${failures} mislukt`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
