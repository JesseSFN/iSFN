/*
 * iSFN - gedeelde kaart voor alle spelvarianten.
 *
 * Kaartdata: OpenStreetMap, als vector-tiles geleverd door OpenFreeMap
 * (https://openfreemap.org: gratis, zonder API-key, account of cookies) en
 * getekend met MapLibre GL JS binnen de bestaande Leaflet-kaart. Daardoor
 * blijven markers, klikken en cirkels in de spelscripts precies hetzelfde.
 *
 * Nederlandse labels: de standaardstijl toont Engelse namen of zet de
 * oorspronkelijke tekens (bijv. Chinees) naast de Latijnse naam. Wij vervangen
 * elk naamlabel door:
 *   Nederlandse naam -> Latijnse naam -> internationale naam -> Engelse naam -> lokale naam
 * Let op: OpenFreeMap bouwt zijn tiles zonder automatische transliteratie. Een
 * Latijnse of Nederlandse naam bestaat dus alleen als OpenStreetMap die heeft
 * (name:nl, name:latin, int_name, name:en). Landen, hoofdsteden en grote
 * steden hebben die vrijwel altijd; kleine plekken zonder zo'n naam houden hun
 * lokale schrijfwijze.
 *
 * Valt de vectorkaart weg (geen WebGL, OpenFreeMap onbereikbaar of een
 * geblokkeerd script) dan schakelt de kaart automatisch over op gewone
 * OpenStreetMap-tegels, zonder Nederlandse labels, zodat het spel speelbaar
 * blijft.
 */
(function () {
  'use strict';

  var STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

  // Zelfde kleur als de achtergrond van de donkere stijl: voorkomt een lichte
  // flits zolang de kaart nog laadt.
  var MAP_BACKGROUND = 'rgb(12, 12, 12)';

  // Attributie zoals OpenFreeMap die voorschrijft.
  var VECTOR_ATTRIBUTION =
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
    'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  var FALLBACK_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var FALLBACK_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers';

  // Zoveel mislukte tiles voordat de kaart klaar is, wordt gezien als een
  // onbereikbare tileserver.
  var MAX_TILE_ERRORS_BEFORE_LOAD = 8;

  // Veldnamen uit het OpenMapTiles-schema waar een label uit wordt opgebouwd,
  // zowel als expressie (["get","name"]) als in de oude vorm ("{name}").
  var NAME_FIELD = /["{]name(?:[_:][\w-]+)?["}]/;

  function dutchLabelExpression() {
    return ['coalesce',
      ['get', 'name:nl'],
      ['get', 'name:latin'],
      ['get', 'name_int'],
      ['get', 'name_en'],
      ['get', 'name']
    ];
  }

  function usesNameField(textField) {
    return NAME_FIELD.test(JSON.stringify(textField));
  }

  // Geeft een kopie van de stijl terug waarin elk naamlabel Nederlands-eerst is.
  // Andere teksten (zoals wegnummers) blijven ongemoeid.
  function localizeStyle(style) {
    var copy = JSON.parse(JSON.stringify(style));
    (copy.layers || []).forEach(function (layer) {
      var layout = layer.layout;
      if (layout && layout['text-field'] !== undefined && usesNameField(layout['text-field'])) {
        layout['text-field'] = dutchLabelExpression();
      }
    });
    return copy;
  }

  function supportsWebGL() {
    try {
      var canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  function canUseVectorMap() {
    return typeof window.maplibregl !== 'undefined' &&
      typeof L.maplibreGL === 'function' &&
      typeof window.fetch === 'function' &&
      supportsWebGL();
  }

  function addFallbackLayer(map, reason) {
    console.warn('[iSFN] Reservekaart (OpenStreetMap, zonder Nederlandse labels) in gebruik:', reason);
    return L.tileLayer(FALLBACK_TILES, {
      maxZoom: 19,
      attribution: FALLBACK_ATTRIBUTION
    }).addTo(map);
  }

  // Haalt een half toegevoegde laag weer netjes weg. De GL-laag kan falen
  // tijdens onAdd; Leaflet heeft dan al luisteraars aan de kaart gehangen.
  function discardLayer(map, layer) {
    try { map.removeLayer(layer); } catch (e) { /* GL-kaart is nooit gestart */ }
    try { map.off(layer.getEvents(), layer); } catch (e) { /* al opgeruimd */ }
    map.attributionControl.removeAttribution(VECTOR_ATTRIBUTION);
  }

  function addVectorLayer(map) {
    return fetch(STYLE_URL)
      .then(function (response) {
        if (!response.ok) throw new Error('Kaartstijl laden mislukt (HTTP ' + response.status + ')');
        return response.json();
      })
      .then(function (style) {
        var layer = L.maplibreGL({
          style: localizeStyle(style),
          // De attributie staat in het Leaflet-attributievak (zie hieronder);
          // MapLibre hoeft er geen tweede te tekenen.
          attributionControl: false
        });

        try {
          layer.addTo(map);
        } catch (err) {
          discardLayer(map, layer);
          throw err;
        }
        map.attributionControl.addAttribution(VECTOR_ATTRIBUTION);

        // Faalt de tilebron voordat de kaart klaar is (OpenFreeMap onbereikbaar),
        // ga dan alsnog over op de reservekaart. Een enkele mislukte tile, of een
        // ontbrekend lettertype of sprite, mag de vectorkaart niet afbreken.
        var loaded = false;
        var switched = false;
        var tileErrors = 0;
        var gl = layer.getMaplibreMap();

        function switchToFallback(reason) {
          if (switched) return;
          switched = true;
          discardLayer(map, layer);
          addFallbackLayer(map, reason);
        }

        gl.once('load', function () { loaded = true; });
        gl.on('error', function (event) {
          if (loaded || switched) return;
          var message = (event && event.error && event.error.message) || 'onbekende fout';
          if (event && event.tile) {
            tileErrors += 1;
            if (tileErrors >= MAX_TILE_ERRORS_BEFORE_LOAD) switchToFallback(message);
          } else if (event && event.sourceId) {
            switchToFallback(message);
          }
        });
      });
  }

  function addBaseLayer(map) {
    if (!canUseVectorMap()) {
      addFallbackLayer(map, 'WebGL of kaartbibliotheek niet beschikbaar');
      return;
    }
    addVectorLayer(map).catch(function (err) {
      addFallbackLayer(map, err && err.message ? err.message : err);
    });
  }

  // Maakt de Leaflet-kaart met de gedeelde basiskaart. Net als L.map(): geef
  // het element-id en eventuele Leaflet-opties mee, en zet daarna zelf de view.
  //
  // Standaardopties volgens de maplibre-gl-leaflet-plugin:
  // - minZoom 1: zoom 0 geeft synchronisatieproblemen tussen Leaflet en MapLibre.
  // - maxZoom 19: de GL-laag geeft dit niet door aan Leaflet.
  // - maxBounds op de breedtegraad: MapLibre kan niet voorbij de poolgrens
  //   van Web Mercator tekenen; zijwaarts blijft de wereld oneindig.
  function createGameMap(elementId, options) {
    var map = L.map(elementId, L.extend({
      minZoom: 1,
      maxZoom: 19,
      maxBounds: [[-85, -Infinity], [85, Infinity]],
      maxBoundsViscosity: 1
    }, options || {}));
    map.getContainer().style.backgroundColor = MAP_BACKGROUND;
    addBaseLayer(map);
    return map;
  }

  var api = {
    createGameMap: createGameMap,
    localizeStyle: localizeStyle,
    STYLE_URL: STYLE_URL,
    VECTOR_ATTRIBUTION: VECTOR_ATTRIBUTION
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // voor de controles in tests/check.mjs
  } else {
    window.iSFNMap = api;
  }
})();
