/*
 * Minimale nepversies van Leaflet en MapLibre voor tests/smoke.cjs.
 *
 * Ze bestaan alleen om de spelscripts in een headless browser te kunnen draaien
 * zonder internet. Ze tekenen niets; ze onthouden wat de scripts doen, zodat de
 * test dat kan nakijken. De echte kaart is hiermee dus NIET getest.
 */
(function () {
  'use strict';

  var log = window.__mapLog = { maps: [], layers: [], attribution: [], errors: [] };

  function Evented() { this._h = {}; }
  Evented.prototype.on = function (type, fn) { (this._h[type] = this._h[type] || []).push(fn); return this; };
  Evented.prototype.once = function (type, fn) {
    var self = this;
    var wrapper = function (e) { self.off(type, wrapper); fn(e); };
    return this.on(type, wrapper);
  };
  Evented.prototype.off = function (type, fn) {
    if (!type || typeof type !== 'string') return this;
    this._h[type] = (this._h[type] || []).filter(function (f) { return f !== fn; });
    return this;
  };
  Evented.prototype.fire = function (type, data) {
    (this._h[type] || []).slice().forEach(function (fn) { fn(data || {}); });
    return this;
  };

  function Layer() { Evented.call(this); this._map = null; }
  Layer.prototype = Object.create(Evented.prototype);
  Layer.prototype.addTo = function (map) { map.addLayer(this); return this; };

  function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }

  function Bounds() {}
  Bounds.prototype.pad = function () { return this; };

  function GameMap(id, options) {
    Evented.call(this);
    this.options = options || {};
    this._layers = [];
    this._container = document.getElementById(id);
    if (!this._container) throw new Error('Kaartcontainer #' + id + ' bestaat niet');
    this._view = null;
    var attributions = log.attribution;
    this.attributionControl = {
      addAttribution: function (text) { attributions.push(['add', text]); },
      removeAttribution: function (text) { attributions.push(['remove', text]); }
    };
    log.maps.push(this);
    window.__map = this;
  }
  GameMap.prototype = Object.create(Evented.prototype);
  GameMap.prototype.getContainer = function () { return this._container; };
  GameMap.prototype.setView = function (center, zoom) { this._view = { center: center, zoom: zoom }; return this; };
  GameMap.prototype.fitBounds = function () { return this; };
  GameMap.prototype.addLayer = function (layer) {
    if (this._layers.indexOf(layer) === -1) this._layers.push(layer);
    layer._map = this;
    if (layer.onAdd) layer.onAdd(this);
    return this;
  };
  GameMap.prototype.removeLayer = function (layer) {
    this._layers = this._layers.filter(function (l) { return l !== layer; });
    layer._map = null;
    return this;
  };
  GameMap.prototype.hasLayer = function (layer) { return this._layers.indexOf(layer) !== -1; };
  // Hulpfunctie voor de test: doet alsof de speler op de kaart klikt.
  GameMap.prototype.clickAt = function (lat, lng) { this.fire('click', { latlng: new LatLng(lat, lng) }); };

  function Marker(latlng, options) {
    Layer.call(this);
    this._latlng = Array.isArray(latlng) ? new LatLng(latlng[0], latlng[1]) : latlng;
    this.options = options || {};
    this.popup = null;
    this.popupOpen = false;
  }
  Marker.prototype = Object.create(Layer.prototype);
  Marker.prototype.getLatLng = function () { return this._latlng; };
  Marker.prototype.bindPopup = function (content) { this.popup = content; return this; };
  Marker.prototype.openPopup = function () { this.popupOpen = true; return this; };
  Marker.prototype.getEvents = function () { return {}; };

  function FeatureGroup() { Layer.call(this); this.layers = []; }
  FeatureGroup.prototype = Object.create(Layer.prototype);
  FeatureGroup.prototype.addLayer = function (layer) { this.layers.push(layer); return this; };
  FeatureGroup.prototype.getBounds = function () { return new Bounds(); };

  function TileLayer(url, options) {
    Layer.call(this);
    this.url = url;
    this.options = options || {};
    this.isTileLayer = true;
    log.layers.push({ kind: 'tileLayer', url: url, options: this.options });
    if (this.options.attribution) log.attribution.push(['add', this.options.attribution]);
  }
  TileLayer.prototype = Object.create(Layer.prototype);

  // --- nep-MapLibre -------------------------------------------------------
  // window.__glMode stuurt het gedrag: 'ok' (standaard), 'source-error' of 'throw'.
  function GlMap() { Evented.call(this); }
  GlMap.prototype = Object.create(Evented.prototype);

  function GlLayer(options) {
    Layer.call(this);
    this.options = options;
    this.isGlLayer = true;
    this._gl = new GlMap();
    log.layers.push({ kind: 'maplibreGL', options: options });
  }
  GlLayer.prototype = Object.create(Layer.prototype);
  GlLayer.prototype.onAdd = function () {
    if (window.__glMode === 'throw') throw new Error('nep-GL kon niet starten');
    var gl = this._gl;
    var mode = window.__glMode || 'ok';
    setTimeout(function () {
      if (mode === 'source-error') gl.fire('error', { sourceId: 'openmaptiles', error: new Error('TileJSON niet bereikbaar') });
      else if (mode === 'tile-errors') for (var i = 0; i < 8; i++) gl.fire('error', { tile: {}, error: new Error('tile mislukt') });
      else if (mode === 'few-tile-errors') { gl.fire('error', { tile: {}, error: new Error('tile mislukt') }); gl.fire('load'); }
      else if (mode === 'glyph-error') { gl.fire('error', { error: new Error('lettertype ontbreekt') }); gl.fire('load'); }
      else gl.fire('load');
    }, 0);
  };
  GlLayer.prototype.getMaplibreMap = function () { return this._gl; };
  GlLayer.prototype.getEvents = function () { return {}; };

  window.L = {
    map: function (id, options) { return new GameMap(id, options); },
    marker: function (latlng, options) { return new Marker(latlng, options); },
    circle: function (latlng, options) { var c = new Marker(latlng, options); c.isCircle = true; return c; },
    featureGroup: function () { return new FeatureGroup(); },
    tileLayer: function (url, options) { return new TileLayer(url, options); },
    maplibreGL: function (options) { return new GlLayer(options); },
    extend: function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i] || {};
        for (var key in source) target[key] = source[key];
      }
      return target;
    }
  };
  window.maplibregl = { Map: GlMap };
})();
