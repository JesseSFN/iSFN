// Browsertest van de spelpagina's:  node tests/smoke.cjs
//
// Draait de échte pagina's en spelscripts in headless Chromium. Alleen Leaflet en
// MapLibre worden vervangen door tests/stubs.js (er is hier geen internet), dus dit
// test de spellogica, het laden van scripts en de overschakeling naar de
// reservekaart, maar NIET de echte kaart, tegels of Nederlandse labels.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const stubs = fs.readFileSync(path.join(__dirname, 'stubs.js'), 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };

let passed = 0;
let failures = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('niet gevonden'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(server));
  });
}

const MOCK_STYLE = {
  version: 8, sources: {}, layers: [
    { id: 'place', type: 'symbol', layout: { 'text-field': '{name:latin}\n{name:nonlatin}' } }
  ]
};

// Opent een pagina met nep-bibliotheken en verzamelt alle fouten.
async function open(browser, base, url, { glMode = 'ok', styleStatus = 200, storage } = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const problems = { pageErrors: [], consoleErrors: [], failedLocal: [], requests: [] };

  page.on('pageerror', e => problems.pageErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') problems.consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) problems.failedLocal.push(r.status() + ' ' + r.url()); });
  page.on('dialog', d => { problems.lastDialog = d.message(); d.accept(); });

  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const u = route.request().url();
    problems.requests.push(u);
    if (/leaflet@1\.9\.4\/dist\/leaflet\.js$/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: stubs });
    if (/maplibre-gl@[\d.]+\/dist\/maplibre-gl\.js$/.test(u) || /leaflet-maplibre-gl\.js$/.test(u)) {
      return route.fulfill({ contentType: 'text/javascript', body: '/* stub: zie leaflet.js */' });
    }
    if (/\.css$/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
    if (/openfreemap\.org\/styles\/liberty/.test(u)) {
      return route.fulfill({ status: styleStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(MOCK_STYLE) });
    }
    return route.abort(); // alles anders (tegels enz.) is hier niet bereikbaar
  });

  await page.addInitScript(mode => { window.__glMode = mode; }, glMode);
  if (storage) await page.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);

  await page.goto(base + url, { waitUntil: 'load' });
  await sleep(150);
  return { context, page, problems };
}

const noErrors = (name, p) => check(name + ': geen JavaScript- of consolefouten',
  p.pageErrors.length === 0 && p.consoleErrors.filter(e => !/Failed to load resource/.test(e)).length === 0,
  JSON.stringify([...p.pageErrors, ...p.consoleErrors]));

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();

  try {
    // ------------------------------------------------------ Explorers
    console.log('Explorers (game/game-explo.html)');
    {
      const { context, page, problems } = await open(browser, base, 'game/game-explo.html');
      noErrors('laden', problems);
      check('laden: geen lokale bestanden ontbreken', problems.failedLocal.length === 0, problems.failedLocal.join(', '));
      check('geen enkel verzoek naar CARTO', !problems.requests.some(u => /carto/i.test(u)));

      const log = await page.evaluate(() => window.__mapLog.layers.map(l => l.kind));
      check('kaart: vectorlaag (OpenFreeMap) wordt gebruikt, geen reservekaart', log.join() === 'maplibreGL', log.join());
      const styleField = await page.evaluate(() => window.__mapLog.layers[0].options.style.layers[0].layout['text-field']);
      check('kaart: aan de GL-laag wordt de Nederlandse stijl doorgegeven', Array.isArray(styleField) && styleField[0] === 'coalesce' && JSON.stringify(styleField).includes('name:nl'), JSON.stringify(styleField));
      const mapOpts = await page.evaluate(() => ({ min: __map.options.minZoom, max: __map.options.maxZoom, wcj: __map.options.worldCopyJump, bounds: JSON.stringify(__map.options.maxBounds) }));
      check('kaart: minZoom 1, maxZoom 19, worldCopyJump behouden', mapOpts.min === 1 && mapOpts.max === 19 && mapOpts.wcj === true, JSON.stringify(mapOpts));
      const attr = await page.evaluate(() => window.__mapLog.attribution.filter(a => a[0] === 'add').map(a => a[1]).join(' '));
      check('kaart: attributie (OpenFreeMap, OpenMapTiles, OpenStreetMap) wordt getoond', /OpenFreeMap/.test(attr) && /OpenMapTiles/.test(attr) && /OpenStreetMap/.test(attr));

      const title = await page.textContent('#place-name');
      check('eerste vraag wordt getoond', title && title !== '--', title);
      check('score begint op 0', (await page.textContent('#score')) === 'Score: 0');

      // Fout antwoord
      const q = await page.evaluate(() => { const i = +localStorage.getItem('currentIndex'); return { i, ...locations[i] }; });
      await page.evaluate(() => __map.clickAt(-60, -100));
      await page.click('#confirmBtn');
      check('fout antwoord: "FOUT" verschijnt, score blijft 0',
        (await page.textContent('#feedbackCenter')) === 'FOUT' && (await page.textContent('#score')) === 'Score: 0');

      // Goed antwoord, dubbel snel bevestigen mag maar één punt geven
      await page.evaluate(([la, ln]) => __map.clickAt(la, ln), [q.lat, q.lng]);
      await page.click('#confirmBtn');
      await page.click('#confirmBtn');
      await page.click('#confirmBtn');
      check('goed antwoord: "GOED" en precies 1 punt, ook bij driemaal klikken',
        (await page.textContent('#feedbackCenter')) === 'GOED' && (await page.textContent('#score')) === 'Score: 1', await page.textContent('#score'));
      await sleep(1200);
      const next = await page.evaluate(() => +localStorage.getItem('currentIndex'));
      const used = await page.evaluate(() => JSON.parse(localStorage.getItem('usedIndexes')).length);
      check('na een goed antwoord komt precies één nieuwe vraag', next !== q.i && used === 2, `used=${used}`);

      // Voortgang blijft na herladen
      await page.reload({ waitUntil: 'load' }); await sleep(150);
      check('herladen: score blijft bewaard', (await page.textContent('#score')) === 'Score: 1');
      check('herladen: dezelfde vraag komt terug', (await page.evaluate(() => +localStorage.getItem('currentIndex'))) === next);

      // Reset
      await page.click('#resetBtn');
      check('reset: score weer 0', (await page.textContent('#score')) === 'Score: 0');
      check('reset: opgeslagen voortgang gewist (behalve de nieuwe vraag)', (await page.evaluate(() => localStorage.getItem('exploScore'))) === null);
      noErrors('spelen', problems);
      await context.close();
    }

    // Laatste vraag -> eindscherm
    {
      const { context, page, problems } = await open(browser, base, 'game/game-explo.html');
      const n = await page.evaluate(() => locations.length);
      const used = Array.from({ length: n }, (_, i) => i);
      await page.evaluate(([n, used]) => {
        localStorage.setItem('exploScore', n - 1);
        localStorage.setItem('usedIndexes', JSON.stringify(used));
        localStorage.setItem('currentIndex', n - 1);
      }, [n, used]);
      await page.reload({ waitUntil: 'load' }); await sleep(150);
      const last = await page.evaluate(() => locations[locations.length - 1]);
      await page.evaluate(([la, ln]) => __map.clickAt(la, ln), [last.lat, last.lng]);
      await page.click('#confirmBtn');
      await sleep(1200);
      check('laatste vraag goed: eindscherm met volledige score', (await page.isVisible('#endPopup')) && (await page.textContent('#finalScore')) === String(n), await page.textContent('#finalScore'));
      await page.click('#restartBtn');
      check('eindscherm: Reset start opnieuw', !(await page.isVisible('#endPopup')) && (await page.textContent('#score')) === 'Score: 0');
      noErrors('eindscherm', problems);
      await context.close();
    }

    // Verouderde/kapotte opgeslagen voortgang
    {
      const { context, page, problems } = await open(browser, base, 'game/game-explo.html', {
        storage: { currentIndex: '9999', usedIndexes: '{kapot', exploScore: 'abc' }
      });
      check('kapotte opslag: spel start gewoon met een vraag', (await page.textContent('#place-name')) !== '--');
      check('kapotte opslag: score valt terug op 0', (await page.textContent('#score')) === 'Score: 0');
      noErrors('kapotte opslag', problems);
      await context.close();
    }

    // ------------------------------------------------------ Scouts
    console.log('Scouts (game/game-scout.html)');
    {
      const { context, page, problems } = await open(browser, base, 'game/game-scout.html');
      noErrors('laden', problems);
      check('laden: geen lokale bestanden ontbreken', problems.failedLocal.length === 0, problems.failedLocal.join(', '));
      check('vraag wordt getoond', (await page.textContent('#place-name')) !== '--');
      const name = await page.textContent('#place-name');
      const q = await page.evaluate(n => locations.find(l => l.name === n), name);
      await page.evaluate(([la, ln]) => __map.clickAt(la, ln), [q.lat, q.lng]);
      await page.click('#confirmBtn'); await page.click('#confirmBtn');
      check('goed antwoord: precies 1 punt bij dubbel klikken', (await page.textContent('#score')) === 'Score: 1');
      await sleep(1200);
      check('daarna volgt een andere vraag', (await page.textContent('#place-name')) !== name || (await page.evaluate(() => locations.length)) === 1);
      await page.click('#resetBtn');
      check('reset: score weer 0', (await page.textContent('#score')) === 'Score: 0');
      noErrors('spelen', problems);
      await context.close();
    }

    // ------------------------------------------------------ Welpen
    console.log('Welpen/Bevers (game/game.html)');
    {
      const { context, page, problems } = await open(browser, base, 'game/game.html');
      noErrors('laden', problems);
      check('laden: geen lokale bestanden ontbreken (o.a. win.mp3 / win.png)', problems.failedLocal.length === 0, problems.failedLocal.join(', '));
      const n = await page.evaluate(() => locations.length);
      check('alle vragen staan in de lijst', (await page.locator('.location-item').count()) === n);

      // klik de eerste vraag in de lijst aan en beantwoord goed
      // kies een vraag met een hint (bij media-vragen is de hint bewust leeg)
      const first = page.locator('.location-item:has(.hint-text:not(:empty))').first(); // de lijst staat in willekeurige volgorde
      const text = (await first.evaluate(el => el.firstChild.textContent)).replace(/^\d+\.\s*/, '');
      const q = await page.evaluate(t => locations.find(l => l.name === t), text);
      await first.click();
      check('hint wordt getoond na aanklikken', await first.locator('.hint-text').isVisible());
      await page.evaluate(([la, ln]) => __map.clickAt(la, ln), [q.lat + 80, q.lng]);
      check('fout antwoord geeft melding', /Fout/.test(problems.lastDialog || ''));
      await page.evaluate(([la, ln]) => __map.clickAt(la, ln), [q.lat, q.lng]);
      check('goed antwoord geeft melding', /Goed/.test(problems.lastDialog || ''));
      check('score is 1 en vraag heeft één vinkje', (await page.textContent('#score')) === 'Score: 1' && (await first.locator('.checkmark').count()) === 1);

      await page.reload({ waitUntil: 'load' }); await sleep(150);
      check('herladen: voortgang blijft', (await page.textContent('#score')) === 'Score: 1' && (await page.locator('.location-item.correct').count()) === 1);
      await page.click('#reset-button');
      check('reset: score 0, geen vinkjes meer', (await page.textContent('#score')) === 'Score: 0' && (await page.locator('.checkmark').count()) === 0);
      noErrors('spelen', problems);
      await context.close();
    }

    // ------------------------------------------------------ Cheat
    console.log('Cheat-schema (game/dingenenzoo.html)');
    {
      const { context, page, problems } = await open(browser, base, 'game/dingenenzoo.html');
      noErrors('laden', problems);
      check('laden: geen lokale bestanden ontbreken', problems.failedLocal.length === 0, problems.failedLocal.join(', '));
      const counts = await page.evaluate(() => {
        const group = __mapLog.maps[0]._layers.find(l => l.layers);
        return { markers: group.layers.filter(l => !l.isCircle).length, circles: group.layers.filter(l => l.isCircle).length, n: locations.length };
      });
      check('elke vraag heeft een marker en een cirkel', counts.markers === counts.n && counts.circles === counts.n, JSON.stringify(counts));
      await page.fill('#search-locations', 'leeuwen');
      check('zoeken geeft suggesties', (await page.locator('#suggestions div').count()) >= 1);
      await page.locator('#suggestions div').first().click();
      check('suggestie kiezen opent de popup en zoomt in', await page.evaluate(() => __mapLog.maps[0]._view.zoom === 15));
      // namen met speciale tekens mogen de popup niet breken
      const safe = await page.evaluate(() => {
        const withMedia = __mapLog.maps[0]._layers.find(l => l.layers).layers.find(l => l.popup && l.popup.querySelector && l.popup.querySelector('video,audio,img'));
        return Boolean(withMedia);
      });
      check('popup met media wordt als DOM-element opgebouwd', safe);
      noErrors('gebruik', problems);
      await context.close();
    }

    // ------------------------------------------------------ Terugval
    console.log('Reservekaart bij problemen');
    const fallbackCases = [
      ['OpenFreeMap-stijl geeft HTTP 500', { styleStatus: 500 }, true],
      ['tilebron (TileJSON) onbereikbaar', { glMode: 'source-error' }, true],
      ['8 mislukte tiles voor de kaart klaar is', { glMode: 'tile-errors' }, true],
      ['GL-laag kan niet starten', { glMode: 'throw' }, true],
      ['enkele mislukte tile: vectorkaart blijft', { glMode: 'few-tile-errors' }, false],
      ['ontbrekend lettertype/sprite: vectorkaart blijft', { glMode: 'glyph-error' }, false]
    ];
    for (const [label, opts, expectFallback] of fallbackCases) {
      const { context, page, problems } = await open(browser, base, 'game/game-scout.html', opts);
      await sleep(100);
      const state = await page.evaluate(() => ({
        kinds: __mapLog.layers.map(l => l.kind),
        glStillOnMap: __map._layers.some(l => l.isGlLayer),
        osmOnMap: __map._layers.some(l => l.isTileLayer && /tile\.openstreetmap\.org/.test(l.url)),
        removed: __mapLog.attribution.filter(a => a[0] === 'remove').length
      }));
      if (expectFallback) {
        check(`${label}: schakelt over op OpenStreetMap-tegels`, state.osmOnMap && !state.glStillOnMap, JSON.stringify(state));
      } else {
        check(`${label}`, state.glStillOnMap && !state.osmOnMap, JSON.stringify(state));
      }
      check(`${label}: spel blijft werken`, (await page.textContent('#place-name')) !== '--' && problems.pageErrors.length === 0, JSON.stringify(problems.pageErrors));
      await context.close();
    }
    {
      // Geen WebGL / geen MapLibre-script: direct de reservekaart
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
        const u = route.request().url();
        if (/leaflet@1\.9\.4\/dist\/leaflet\.js$/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: stubs });
        if (/\.css$/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
        return route.abort(); // MapLibre-scripts en tegels geblokkeerd
      });
      await page.goto(base + 'game/game-explo.html', { waitUntil: 'load' }); await sleep(150);
      const kinds = await page.evaluate(() => __mapLog.layers.map(l => l.kind + ':' + (l.url || '')));
      check('MapLibre-script geblokkeerd: OpenStreetMap-tegels, geen fout', kinds.length === 1 && /tileLayer:.*tile\.openstreetmap\.org/.test(kinds[0]) && errors.length === 0, kinds.join() + ' ' + errors.join());
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} gelukt, ${failures} mislukt`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
