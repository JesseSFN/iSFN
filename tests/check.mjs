// Snelle controles zonder browser of dependencies:  node tests/check.mjs
//
// Test de losse logica (afstand, opslag, Nederlandse kaartlabels), de vragenlijst
// en of alle pagina's naar bestaande bestanden verwijzen.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(root, file), 'utf8');

let failures = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- common.js
console.log('common.js');
const iSFN = require(join(root, 'game/common.js'));

check('afstand Amsterdam-Parijs is ca. 430 km',
  near(iSFN.distanceMeters(52.3676, 4.9041, 48.8566, 2.3522) / 1000, 430, 5));
check('afstand van punt naar zichzelf is 0', iSFN.distanceMeters(10, 20, 10, 20) === 0);
check('afstand is symmetrisch',
  near(iSFN.distanceMeters(1, 2, 3, 4), iSFN.distanceMeters(3, 4, 1, 2), 1e-6));
check('afstand over datumgrens klopt (179 -> -179 graden is ca. 222 km)',
  near(iSFN.distanceMeters(0, 179, 0, -179) / 1000, 222.4, 1));

function withStorage(impl, fn) {
  globalThis.localStorage = impl;
  try { return fn(); } finally { delete globalThis.localStorage; }
}
const memory = () => {
  const data = new Map();
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k)
  };
};
const broken = {
  getItem() { throw new Error('geen toegang'); },
  setItem() { throw new Error('vol'); },
  removeItem() { throw new Error('geen toegang'); }
};

withStorage(memory(), () => {
  iSFN.storage.set('score', 7);
  check('opslag: getal wordt als tekst bewaard en teruggelezen', iSFN.storage.getInt('score', 0) === 7);
  iSFN.storage.set('lijst', ['a', 'b']);
  check('opslag: lijst wordt als JSON bewaard', localStorage.getItem('lijst') === '["a","b"]');
  check('opslag: lijst wordt teruggelezen', iSFN.storage.getArray('lijst').join() === 'a,b');
  localStorage.setItem('kapot', '{niet-json');
  check('opslag: kapotte JSON geeft lege lijst', iSFN.storage.getArray('kapot').length === 0);
  localStorage.setItem('geen-lijst', '{"a":1}');
  check('opslag: JSON die geen lijst is geeft lege lijst', iSFN.storage.getArray('geen-lijst').length === 0);
  localStorage.setItem('tekst', 'abc');
  check('opslag: niet-numerieke waarde geeft de standaardwaarde', iSFN.storage.getInt('tekst', -1) === -1);
  check('opslag: ontbrekende sleutel geeft de standaardwaarde', iSFN.storage.getInt('bestaat-niet', 5) === 5);
  iSFN.storage.remove('score');
  check('opslag: verwijderen werkt', iSFN.storage.getInt('score', 0) === 0);
});
withStorage(broken, () => {
  let threw = false;
  try {
    iSFN.storage.set('x', 1); iSFN.storage.remove('x');
    check('opslag: ontoegankelijke localStorage geeft standaardwaarde', iSFN.storage.getInt('x', 3) === 3);
    check('opslag: ontoegankelijke localStorage geeft lege lijst', iSFN.storage.getArray('x').length === 0);
  } catch (e) { threw = true; }
  check('opslag: ontoegankelijke localStorage gooit geen fout', !threw);
});

// ------------------------------------------------------------------- map.js
console.log('map.js (Nederlandse labels)');
const iSFNMap = require(join(root, 'game/map.js'));

// Minimale uitvoering van de ["coalesce", ["get", veld], ...]-expressie, om de
// voorrangsvolgorde te controleren. Dit test onze logica, niet MapLibre zelf.
function evalLabel(expr, props) {
  if (Array.isArray(expr) && expr[0] === 'coalesce') {
    for (const part of expr.slice(1)) {
      const value = evalLabel(part, props);
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return null;
  }
  if (Array.isArray(expr) && expr[0] === 'get') return props[expr[1]] ?? null;
  throw new Error('onbekende expressie ' + JSON.stringify(expr));
}

const sampleStyle = {
  version: 8,
  layers: [
    { id: 'land', type: 'fill' },
    { id: 'place_old', type: 'symbol', layout: { 'text-field': '{name:latin}\n{name:nonlatin}' } },
    { id: 'place_new', type: 'symbol', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } },
    { id: 'country', type: 'symbol', layout: { 'text-field': '{name_en}' } },
    { id: 'road', type: 'symbol', layout: { 'text-field': '{name}' } },
    { id: 'poi', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'name']] } },
    { id: 'ref', type: 'symbol', layout: { 'text-field': '{ref}' } },
    { id: 'housenumber', type: 'symbol', layout: { 'text-field': '{housenumber}' } },
    { id: 'icon_only', type: 'symbol', layout: { 'icon-image': 'x' } }
  ]
};
const frozen = JSON.stringify(sampleStyle);
const localized = iSFNMap.localizeStyle(sampleStyle);
const field = id => localized.layers.find(l => l.id === id).layout['text-field'];

check('stijl: bronobject wordt niet aangepast', JSON.stringify(sampleStyle) === frozen);
for (const id of ['place_old', 'place_new', 'country', 'road', 'poi']) {
  check(`stijl: naamlabel "${id}" wordt Nederlands-eerst`, Array.isArray(field(id)) && field(id)[0] === 'coalesce');
}
check('stijl: wegnummers blijven ongemoeid', field('ref') === '{ref}');
check('stijl: huisnummers blijven ongemoeid', field('housenumber') === '{housenumber}');
check('stijl: laag zonder tekst blijft ongemoeid', localized.layers.find(l => l.id === 'icon_only').layout['icon-image'] === 'x');
check('stijl: laag zonder layout blijft ongemoeid', localized.layers.find(l => l.id === 'land').layout === undefined);

const label = props => evalLabel(field('country'), props);
check('label: land met Nederlandse naam -> "China" (niet 中国)',
  label({ name: '中国', 'name:nl': 'China', name_en: 'China' }) === 'China');
check('label: Peking -> Nederlandse naam',
  label({ name: '北京市', 'name:nl': 'Peking', name_en: 'Beijing' }) === 'Peking');
check('label: Moskou -> Nederlandse naam',
  label({ name: 'Москва', 'name:nl': 'Moskou', name_en: 'Moscow' }) === 'Moskou');
check('label: Griekenland -> Nederlandse naam',
  label({ name: 'Ελλάδα', 'name:nl': 'Griekenland', name_en: 'Greece' }) === 'Griekenland');
check('label: zonder Nederlandse naam wordt de Latijnse naam gebruikt',
  label({ name: 'Београд', 'name:latin': 'Beograd', name_en: 'Београд' }) === 'Beograd');
check('label: zonder Latijnse naam wordt de internationale naam gebruikt',
  label({ name: '東京', name_int: 'Tokyo', name_en: '東京' }) === 'Tokyo');
check('label: zonder Nederlands/Latijns wordt de Engelse naam gebruikt',
  label({ name: '서울', name_en: 'Seoul' }) === 'Seoul');
check('label: zonder enige vertaling blijft de lokale naam staan (beter dan niets)',
  label({ name: '小镇' }) === '小镇');
check('label: lege Nederlandse naam wordt overgeslagen',
  label({ name: 'X', 'name:nl': '', name_en: 'Y' }) === 'Y');

check('kaartstijl-URL vraagt geen API-key', !/key|token|apikey/i.test(iSFNMap.STYLE_URL));
check('attributie noemt OpenStreetMap, OpenMapTiles en OpenFreeMap',
  ['OpenStreetMap', 'OpenMapTiles', 'OpenFreeMap'].every(n => iSFNMap.VECTOR_ATTRIBUTION.includes(n)));

// ------------------------------------------------------------ vragenlijst
console.log('locations.js (vragenlijst)');
const sandbox = {};
vm.runInNewContext(read('game/locations.js') + '\nthis.locations = locations;', sandbox);
const locations = sandbox.locations;

check('er zijn vragen', Array.isArray(locations) && locations.length > 0, String(locations && locations.length));
const names = locations.map(l => l.name);
check('vraagnamen zijn uniek (de Welpen-voortgang wordt per naam opgeslagen)',
  new Set(names).size === names.length,
  names.filter((n, i) => names.indexOf(n) !== i).join(', '));
locations.forEach((l, i) => {
  const where = `vraag ${i + 1} (${l.name})`;
  const valid =
    typeof l.name === 'string' && l.name.trim() !== '' &&
    typeof l.hint === 'string' && (l.hint.trim() !== '' || Boolean(l.media)) &&
    typeof l.lat === 'number' && l.lat >= -90 && l.lat <= 90 &&
    typeof l.lng === 'number' && l.lng >= -180 && l.lng <= 180 &&
    typeof l.radius === 'number' && l.radius > 0;
  if (!valid) check(where + ': naam, hint (of media), lat, lng en radius kloppen', false);
  if (l.media) {
    check(where + ': mediabestand bestaat (' + l.media + ')', existsSync(join(root, 'game', l.media)));
  }
});
check('alle vragen hebben geldige velden (een lege hint mag alleen met media)', locations.every(l =>
  typeof l.name === 'string' && l.name.trim() && typeof l.hint === 'string' && (l.hint.trim() || l.media) &&
  Number.isFinite(l.lat) && Math.abs(l.lat) <= 90 && Number.isFinite(l.lng) && Math.abs(l.lng) <= 180 &&
  Number.isFinite(l.radius) && l.radius > 0));
check('media verwijst niet naar een externe site (werkt zo ook lokaal)',
  locations.every(l => !l.media || !/^https?:/.test(l.media)));

// ------------------------------------------------- pagina's en bestandsverwijzingen
console.log("pagina's en verwijzingen");
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    statSync(full).isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}
const allFiles = walk(root);
const textFiles = allFiles.filter(f => /\.(html|js|mjs|cjs|css|md)$/.test(f) && !f.includes('/tests/'));

check('geen enkele verwijzing naar CARTO meer in de code',
  textFiles.every(f => !/carto(cdn|\.com)|basemaps\.carto/i.test(readFileSync(f, 'utf8'))),
  textFiles.filter(f => /carto/i.test(readFileSync(f, 'utf8'))).join(', '));

const pages = allFiles.filter(f => f.endsWith('.html'));
for (const page of pages) {
  const rel = page.slice(root.length + 1);
  const html = readFileSync(page, 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#?]+)"/g)].map(m => m[1])
    .filter(r => !/^(https?:|data:|mailto:|\/)/.test(r));
  const missing = refs.filter(r => !existsSync(resolve(dirname(page), r)));
  check(`${rel}: alle lokale verwijzingen bestaan`, missing.length === 0, missing.join(', '));

  const external = [...html.matchAll(/\b(?:src|href)="(https?:[^"]+)"/g)].map(m => m[1]);
  const unpinned = external.filter(u => /unpkg\.com\/(?!@?[\w.-]+(?:\/[\w.-]+)?@\d)/.test(u));
  check(`${rel}: bibliotheken van unpkg hebben een vaste versie`, unpinned.length === 0, unpinned.join(', '));

  const opens = (html.match(/<div[\s>]/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  check(`${rel}: evenveel <div> als </div>`, opens === closes, `${opens} open, ${closes} dicht`);

  if (/leaflet\.js/.test(html)) {
    const order = ['leaflet.js', 'maplibre-gl.js', 'leaflet-maplibre-gl.js', 'common.js', 'map.js', 'locations.js']
      .map(n => html.search(new RegExp(`src="[^"]*${n.replace('.', '\\.')}"`)));
    check(`${rel}: scripts staan in de juiste volgorde`,
      order.every(i => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), order.join(','));
    check(`${rel}: MapLibre-stijlblad wordt geladen`, /maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/.test(html));
  }
}

// -------------------------------------------------------------- uitkomst
console.log(`\n${passed} gelukt, ${failures} mislukt`);
process.exit(failures ? 1 : 0);
