// Browsertest van de beheerpagina achter de server:  node tests/server-ui.cjs
//
// Start de echte server en bedient de beheerpagina in headless Chromium: inloggen,
// vragen toevoegen, media uploaden, publiceren, conflicten, verlopen sessie, uitloggen.
// Leaflet en MapLibre zijn hier nepversies (tests/stubs.js), de kaart zelf is dus niet getest.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const stubs = fs.readFileSync(path.join(__dirname, 'stubs.js'), 'utf8');
const PASSWORD = 'testwachtwoord-123';

let passed = 0;
let failures = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isfn-ui-'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'server/server.js')], {
      env: { PATH: process.env.PATH, PORT: '0', DATA_DIR: dataDir, ADMIN_PASSWORD: PASSWORD }, stdio: ['ignore', 'pipe', 'inherit']
    });
    let out = '';
    child.stdout.on('data', c => {
      out += c;
      const m = /:(\d+) \(data/.exec(out);
      if (m) resolve({ port: Number(m[1]), dataDir, stop: () => new Promise(r => { child.once('exit', r); child.kill('SIGTERM'); }) });
    });
    child.on('exit', code => reject(new Error('server stopte: ' + code)));
  });
}

(async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const u = route.request().url();
    if (/leaflet@1\.9\.4\/dist\/leaflet\.js$/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: stubs });
    if (/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.js$/.test(u) || /leaflet-maplibre-gl\.js$/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (/\.css$/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
    if (/openfreemap\.org\/styles/.test(u)) return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ version: 8, sources: {}, layers: [] }) });
    return route.abort();
  });

  const serverQuestions = async () => {
    const text = await (await fetch(base + '/game/locations.js')).text();
    const sandbox = {}; require('node:vm').runInNewContext(text + '\nthis.l = locations', sandbox); return sandbox.l;
  };
  const notice = async () => (await page.isVisible('#notice')) ? (await page.textContent('#notice')) : '';
  async function waitNotice(re) {
    try {
      await page.waitForFunction(source => new RegExp(source).test(document.getElementById('notice').textContent), re.source, { timeout: 8000 });
    } catch (e) {
      throw new Error('Melding verwacht ' + re + ' maar de pagina toonde: "' + (await notice()) + '" | fouten: "' + (await page.textContent('#errors')) + '"');
    }
  }

  try {
    console.log('Inloggen');
    await page.goto(base + '/game/admin.html', { waitUntil: 'load' });
    check('beheerpagina zonder login stuurt naar de loginpagina', page.url() === base + '/admin/login', page.url());
    await page.fill('#password', 'fout wachtwoord');
    await page.click('#submit');
    await page.waitForFunction(() => document.getElementById('error').textContent.length > 0);
    check('fout wachtwoord: melding op de pagina, geen toegang', /Onjuist/.test(await page.textContent('#error')) && page.url().endsWith('/admin/login'));
    await page.fill('#password', PASSWORD);
    await page.click('#submit');
    await page.waitForURL(base + '/game/admin.html');
    await page.waitForSelector('#list li');
    check('juist wachtwoord: beheerpagina met alle vragen', (await page.locator('#list li').count()) === (await serverQuestions()).length);

    console.log('Servermodus op de pagina');
    check('Publiceren en Uitloggen zijn zichtbaar', (await page.isVisible('#publish')) && (await page.isVisible('#logout')));
    check('uploaden en bestaande media kiezen zijn zichtbaar', (await page.isVisible('#media-file')) && (await page.isVisible('#media-pick')));
    check('uitleg voor handmatig publiceren (GitHub) is verborgen, serveruitleg zichtbaar', (await page.isHidden('#static-help')) && (await page.isVisible('#server-help')));
    check('"Kopieer code" is verborgen', await page.isHidden('#copy'));
    check('bestaande media staan in de keuzelijst', (await page.locator('#media-pick option').count()) > 10);

    console.log('Toevoegen, uploaden en publiceren');
    const before = await serverQuestions();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);
    await page.setInputFiles('#media-file', { name: 'Mijn Foto é (1).png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.getElementById('f-media').value !== '');
    check('upload: ongeldige tekens in de bestandsnaam worden opgeschoond en het pad komt in het formulier',
      (await page.inputValue('#f-media')) === '../media-vragen/Mijn-Foto-e-1-.png', await page.inputValue('#f-media'));
    check('upload: melding noemt het bestand', /Geüpload: Mijn-Foto-e-1-\.png/.test(await notice()), await notice());
    check('upload: bestand staat op de server', fs.existsSync(path.join(server.dataDir, 'media-vragen/Mijn-Foto-e-1-.png')));
    check('upload: bestand staat in de keuzelijst', (await page.locator('#media-pick option', { hasText: 'Mijn-Foto-e-1-.png' }).count()) === 1);

    await page.fill('#f-name', 'UI-testvraag');
    await page.fill('#f-hint', 'Waar ligt de Dom?');
    await page.fill('#f-radius', '1,5');
    await page.evaluate(() => __map.clickAt(52.0907, 5.1214));
    await page.click('#save');
    check('vraag aan de lijst toegevoegd, badge "niet gepubliceerd" zichtbaar', (await page.locator('#list li', { hasText: 'UI-testvraag' }).count()) === 1 && await page.isVisible('#dirty'));
    check('nog niets op de server vóór Publiceren', (await serverQuestions()).length === before.length);

    await page.click('#publish');
    await waitNotice(/Gepubliceerd/);
    const afterPublish = await serverQuestions();
    const saved = afterPublish.find(q => q.name === 'UI-testvraag');
    check('publiceren: de server heeft de nieuwe vraag', afterPublish.length === before.length + 1 && saved && saved.radius === 1.5 && saved.lat === 52.0907 && saved.media === '../media-vragen/Mijn-Foto-e-1-.png', JSON.stringify(saved));
    check('publiceren: badge verdwijnt', await page.isHidden('#dirty'));

    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#list li');
    check('herladen: de gepubliceerde vraag staat in de lijst, zonder concept', (await page.locator('#list li', { hasText: 'UI-testvraag' }).count()) === 1 && await page.isHidden('#dirty'));

    // Tweede keer publiceren na een bewerking (de veldvolgorde verschilt van het bestand)
    await page.locator('#list li', { hasText: 'UI-testvraag' }).click();
    await page.fill('#f-hint', 'Aangepaste hint');
    await page.click('#save');
    await page.click('#publish');
    await waitNotice(/Gepubliceerd/);
    check('tweede keer publiceren na bewerken lukt', (await serverQuestions()).find(q => q.name === 'UI-testvraag').hint === 'Aangepaste hint');
    await page.click('#publish');
    check('publiceren zonder wijzigingen meldt dat netjes', /geen wijzigingen/.test(await notice()));

    const backups = fs.readdirSync(path.join(server.dataDir, 'backups')).length;
    check('elke keer publiceren maakt een back-up', backups === 2, backups);

    console.log('Het spel gebruikt direct de nieuwe vragen');
    const game = await context.newPage();
    await game.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
      const u = route.request().url();
      if (/leaflet@1\.9\.4\/dist\/leaflet\.js$/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: stubs });
      if (/\.css$/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    });
    await game.goto(base + '/game/dingenenzoo.html', { waitUntil: 'load' });
    check('spelpagina laadt de vragen van de server', await game.evaluate(() => locations.some(q => q.name === 'UI-testvraag' && q.hint === 'Aangepaste hint')));
    const img = await game.request.get(base + '/media-vragen/Mijn-Foto-e-1-.png');
    check('geüploade media is voor spelers bereikbaar', img.status() === 200);
    await game.close();

    console.log('Foutsituaties');
    // Mediabestand dat niet bestaat
    await page.click('#new');
    await page.fill('#f-name', 'Kapotte media');
    await page.fill('#f-hint', 'x');
    await page.fill('#f-media', '../media-vragen/bestaat-echt-niet.png');
    await page.fill('#f-lat', '1'); await page.fill('#f-lng', '1'); await page.fill('#f-radius', '1');
    await page.click('#save');
    await page.click('#publish');
    await waitNotice(/Niet gepubliceerd/);
    check('server weigert media die niet bestaat, met uitleg op de pagina', /bestaat niet/.test(await page.textContent('#errors')) && /Niet gepubliceerd/.test(await notice()));
    check('na een geweigerde publicatie is op de server niets veranderd', (await serverQuestions()).every(q => q.name !== 'Kapotte media'));
    check('de vraag blijft als concept bewaard', await page.isVisible('#dirty'));

    // Conflict: iemand anders publiceert intussen
    const other = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: JSON.stringify({ password: PASSWORD }) });
    const otherCookie = other.headers.get('set-cookie').split(';')[0];
    const current = await serverQuestions();
    await fetch(base + '/api/questions', { method: 'PUT', headers: { Cookie: otherCookie, 'X-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [...current, { name: 'Van een ander', hint: 'h', ans: '', media: '', lat: 1, lng: 1, radius: 1 }], base: JSON.stringify(current) }) });
    // eerst de kapotte vraag in het concept repareren (media leegmaken), dan pas publiceren
    await page.locator('#list li', { hasText: 'Kapotte media' }).click();
    await page.fill('#f-media', '');
    await page.click('#save');
    await page.click('#publish');
    await waitNotice(/veranderd/);
    check('conflict: waarschuwing met knop om te herladen', (await page.locator('#notice button', { hasText: 'Pagina herladen' }).count()) === 1);
    check('conflict: de wijziging van de ander is niet overschreven', (await serverQuestions()).some(q => q.name === 'Van een ander'));

    // Verlopen sessie
    await context.clearCookies();
    await page.click('#publish');
    await waitNotice(/sessie is verlopen/);
    check('verlopen sessie: melding met knop om opnieuw in te loggen, concept blijft', (await page.locator('#notice button', { hasText: 'Inloggen' }).count()) === 1 && await page.isVisible('#dirty'));

    console.log('Uitloggen');
    await page.goto(base + '/admin/login', { waitUntil: 'load' });
    await page.fill('#password', PASSWORD);
    await page.click('#submit');
    await page.waitForURL(base + '/game/admin.html');
    await page.waitForSelector('#list li');
    await page.click('#logout');
    await page.waitForURL(base + '/admin/login');
    check('uitloggen: terug op de loginpagina', page.url() === base + '/admin/login');
    await page.goto(base + '/game/admin.html', { waitUntil: 'load' });
    check('na uitloggen is de beheerpagina weer afgeschermd', page.url() === base + '/admin/login');

    check('geen JavaScript- of consolefouten tijdens de hele test', problems.length === 0, JSON.stringify(problems));
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log(`\n${passed} gelukt, ${failures} mislukt`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
