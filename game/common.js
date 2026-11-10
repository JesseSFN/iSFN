/*
 * iSFN - hulpfuncties die door meerdere spelvarianten worden gebruikt.
 */
(function () {
  'use strict';

  var VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv'];
  var AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];

  function fileExtension(url) {
    return String(url).split(/[?#]/)[0].split('.').pop().toLowerCase();
  }

  // Maakt het juiste element (video, audio of afbeelding) voor een mediabestand.
  function createMediaElement(url, altText) {
    var extension = fileExtension(url);
    var element;

    if (VIDEO_EXTENSIONS.indexOf(extension) !== -1) {
      element = document.createElement('video');
      element.controls = true;
      element.setAttribute('playsinline', '');
    } else if (AUDIO_EXTENSIONS.indexOf(extension) !== -1) {
      element = document.createElement('audio');
      element.controls = true;
    } else {
      element = document.createElement('img');
      element.alt = altText || '';
    }

    element.src = url;
    return element;
  }

  // Afstand in meters tussen twee coordinaten (haversine).
  function distanceMeters(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = function (deg) { return deg * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Speelt een geluid af. Geblokkeerde autoplay of een ontbrekend bestand mag
  // het spel nooit laten vastlopen.
  function playSound(url) {
    try {
      var playing = new Audio(url).play();
      if (playing && typeof playing.catch === 'function') {
        playing.catch(function (err) { console.warn('[iSFN] Geluid kon niet worden afgespeeld:', err); });
      }
    } catch (err) {
      console.warn('[iSFN] Geluid kon niet worden afgespeeld:', err);
    }
  }

  // localStorage kan ontbreken (privemodus), vol zijn of kapotte data bevatten.
  // Deze helpers laten het spel dan gewoon met een lege voortgang starten.
  // Opslagformaat is gelijk aan het oude: getallen als tekst, lijsten als JSON.
  var storage = {
    getInt: function (key, fallback) {
      try {
        var value = parseInt(localStorage.getItem(key), 10);
        return isNaN(value) ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    getArray: function (key) {
      try {
        var value = JSON.parse(localStorage.getItem(key));
        return Array.isArray(value) ? value : [];
      } catch (e) {
        return [];
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      } catch (e) {
        console.warn('[iSFN] Voortgang kon niet worden opgeslagen:', e);
      }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* niets te doen */ }
    }
  };

  var api = {
    createMediaElement: createMediaElement,
    distanceMeters: distanceMeters,
    playSound: playSound,
    storage: storage
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // voor de controles in tests/check.mjs
  } else {
    window.iSFN = api;
  }
})();
