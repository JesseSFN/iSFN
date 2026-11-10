iSFN is een nabootsing van iScout

## Kaart

De spelkaart gebruikt geen API-key, account of instelling.

- **Data:** OpenStreetMap, als vector-tiles van [OpenFreeMap](https://openfreemap.org) (gratis, geen key), stijl `liberty` (licht en gedetailleerd).
- **Weergave:** MapLibre GL JS binnen de bestaande Leaflet-kaart (`@maplibre/maplibre-gl-leaflet`), zodat markers en klikken in de spelscripts hetzelfde werken.
- **Nederlandse labels:** `game/map.js` vervangt elk naamlabel door: Nederlandse naam → Latijnse naam → internationale naam → Engelse naam → lokale naam. Een Nederlandse of Latijnse naam bestaat alleen als OpenStreetMap die heeft; landen, hoofdsteden en grote steden hebben die vrijwel altijd, kleine plaatsen niet.
- **Terugval:** werkt de vectorkaart niet (geen WebGL, OpenFreeMap onbereikbaar), dan gebruikt het spel gewone OpenStreetMap-tegels, zonder Nederlandse labels.

De bibliotheken worden met een vaste versie van unpkg geladen (Leaflet 1.9.4, MapLibre GL 5.13.0, maplibre-gl-leaflet 0.1.3).

## Structuur

- `index.html`, `keuze-menu.html`: start en keuzemenu.
- `game/`: de spelvarianten (`game.html` Welpen/Bevers, `game-explo.html` Explorers, `game-scout.html` Scouts, `dingenenzoo.html` cheat-schema, `koud.html`).
  - `locations.js`: alle vragen (naam, hint, antwoord, media, coördinaten, straal in km).
  - `map.js`: de gedeelde kaart. `common.js`: afstand, veilige opslag, mediaweergave, geluid.
  - `script.js`, `explo-script.js`, `scout-script.js`, `cheat-loc.js`, `timer.js`: de spellogica per variant.
- `media-vragen/`, `Images/`, `Sounds/`: bestanden bij de vragen en het spel.

## Testen

Geen installatie nodig voor de eerste test.

- `node tests/check.mjs`: logica, Nederlandse labelregels, vragenlijst, alle verwijzingen in de pagina's.
- `node tests/smoke.cjs`: speelt alle spelvarianten door in headless Chromium (vereist Playwright). Leaflet en MapLibre worden daarbij vervangen door nepversies, dus dit test niet de echte kaart.
