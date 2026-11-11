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
- `server/`: kleine webserver (alleen Node, geen npm-dependencies) voor Docker, met de beveiligde beheer-API.
- `Dockerfile`, `docker-compose.yml`, `.env.example`: om het geheel als container te draaien.

## Vragen beheren

Open `game/admin.html` (de pagina staat niet in het menu). Hier voeg je vragen toe, bewerk je ze en verwijder je ze, met de kaart om de plek en straal te kiezen.

- **In Docker (met de server):** de pagina is afgeschermd met een wachtwoord. Na inloggen klik je op **Publiceren**: de vragen worden op de server opgeslagen en spelers zien ze zodra ze de pagina verversen. Je kunt ook afbeeldingen, audio en video uploaden of een bestaand bestand kiezen. Voor elke publicatie wordt een back-up van de vorige versie bewaard (de laatste 20).
- **Op GitHub Pages (zonder server):** er is geen server om iets op te slaan. De pagina bewaart een concept in je browser; klik op **Download locations.js**, vervang `game/locations.js` in de repository door dat bestand en commit het. Nieuwe media zet je zelf in `media-vragen/`.

## Draaien in Docker

```
cp .env.example .env        # zet in .env een eigen ADMIN_PASSWORD (minimaal 8 tekens)
docker compose up -d --build
```

Het spel staat dan op http://localhost:8080 en het beheer op http://localhost:8080/admin. Zonder `ADMIN_PASSWORD` weigert `docker compose` te starten.

| Instelling | Standaard | Betekenis |
|---|---|---|
| `ADMIN_PASSWORD` | (verplicht) | Wachtwoord voor het beheer, minimaal 8 tekens. Korter of leeg: het beheer staat uit, het spel blijft werken. |
| `HOST_PORT` | `8080` | Poort op de computer waarop het spel bereikbaar is. |
| `TRUST_PROXY` | `0` | Zet op `1` achter een reverse proxy, zodat het echte IP-adres van de bezoeker wordt gebruikt voor de blokkade bij foute wachtwoorden. |
| `COOKIE_SECURE` | `0` | Zet op `1` als je de site via https aanbiedt. Gebruik dit niet via gewone http: dan kun je niet inloggen. |
| `MAX_UPLOAD_MB` | `50` | Maximale grootte van een upload. |

**Gegevens:** de vragen, back-ups en geüploade media staan in het volume `isfn-data` (in de container `/data`) en blijven dus bewaard bij herstarten, bijwerken en opnieuw aanmaken van de container. De vragen uit de image dienen alleen als beginstand op een nieuw volume. Bijwerken naar een nieuwe versie van de code: `git pull` en dan `docker compose up -d --build`. Een kopie van je gegevens maak je met:

```
docker run --rm -v isfn_isfn-data:/data -v "$PWD":/out alpine tar czf /out/isfn-data.tgz -C / data
```

**Beveiliging:**
- Het wachtwoord gaat bij inloggen over de lijn. Zet de site daarom op een openbaar adres altijd achter een reverse proxy met https (bijvoorbeeld Caddy: `jouwdomein.nl { reverse_proxy isfn:8080 }`) en zet dan `TRUST_PROXY=1` en `COOKIE_SECURE=1`. Op een vertrouwd thuisnetwerk via http werkt het ook, maar zonder die bescherming.
- Na 5 foute pogingen vanaf hetzelfde IP-adres is inloggen 15 minuten geblokkeerd.
- De sessie duurt 12 uur en staat in het geheugen van de server; na een herstart log je opnieuw in.
- Alleen de spelbestanden zijn van buiten bereikbaar (niet `server/`, `tests/` of `.git`). Uploads worden gecontroleerd op bestandstype én inhoud; SVG en HTML worden geweigerd.
- De container draait niet als root, met een alleen-lezen bestandssysteem; alleen `/data` is beschrijfbaar.

Zonder Docker kan het ook: `ADMIN_PASSWORD=... node server/server.js` (Node 18 of nieuwer; de gegevens komen dan in `./data`).

## Testen

Geen installatie nodig voor de eerste test.

- `node tests/check.mjs`: logica, Nederlandse labelregels, vragenlijst, het genereren van `locations.js` door de beheerpagina, alle verwijzingen in de pagina's.
- `node tests/smoke.cjs`: speelt alle spelvarianten door in headless Chromium (vereist Playwright). Leaflet en MapLibre worden daarbij vervangen door nepversies, dus dit test niet de echte kaart.
- `node tests/server.cjs`: start de echte server en test bestanden, beveiliging, inloggen, blokkeren, opslaan, uploads en herstarten (geen dependencies).
- `node tests/server-ui.cjs`: bedient de beheerpagina achter de server in headless Chromium (vereist Playwright).
