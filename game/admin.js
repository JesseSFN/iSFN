/*
 * iSFN - vragenbeheer.
 *
 * De site is statisch (GitHub Pages), er is dus geen server om vragen op te
 * slaan. Deze pagina bewerkt daarom een concept in de browser en maakt daarvan
 * een nieuwe game/locations.js, die je in de repository zet.
 *
 * Het bovenste deel (lib) heeft geen DOM nodig en wordt door tests/check.mjs
 * getest.
 */
(function () {
  'use strict';

  var KNOWN_FIELDS = ['name', 'hint', 'ans', 'media', 'lat', 'lng', 'radius'];
  var INDENT = '      '; // zelfde inspringing als het bestaande locations.js: kleine diff in git

  // ------------------------------------------------------------------ lib
  // Getal uit invoer; accepteert ook een komma als decimaalteken ("52,37").
  function parseNumber(text) {
    if (typeof text === 'number') return text;
    var cleaned = String(text === undefined || text === null ? '' : text).trim().replace(',', '.');
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function radiusComment(km) {
    return km < 1 ? 'ongeveer ' + Math.round(km * 1000) + ' meter' : 'ongeveer ' + km + ' km';
  }

  // Controleert één vraag. `list` is de huidige lijst, `editIndex` de plek van de
  // vraag die wordt bewerkt (-1 bij een nieuwe), zodat die niet met zichzelf botst.
  function validateQuestion(q, list, editIndex) {
    var errors = [];
    var name = (q.name || '').trim();

    if (!name) {
      errors.push('Vul een naam in.');
    } else {
      // De voortgang van de Welpen wordt per naam bewaard, dus namen moeten uniek zijn.
      var clash = list.some(function (other, i) {
        return i !== editIndex && String(other.name).trim().toLowerCase() === name.toLowerCase();
      });
      if (clash) errors.push('Er bestaat al een vraag met de naam "' + name + '".');
    }

    if (!(q.hint || '').trim() && !(q.media || '').trim()) {
      errors.push('Vul een hint in, of kies media (een vraag mag niet helemaal leeg zijn).');
    }
    if (!Number.isFinite(q.lat) || q.lat < -90 || q.lat > 90) {
      errors.push('De breedtegraad moet een getal tussen -90 en 90 zijn.');
    }
    if (!Number.isFinite(q.lng) || q.lng < -180 || q.lng > 180) {
      errors.push('De lengtegraad moet een getal tussen -180 en 180 zijn.');
    }
    if (!Number.isFinite(q.radius) || q.radius <= 0) {
      errors.push('De straal moet een getal groter dan 0 zijn (in km).');
    }
    if ((q.media || '').trim() && /^\s*(javascript|data):/i.test(q.media)) {
      errors.push('Dit mediapad is niet toegestaan.');
    }
    return errors;
  }

  // Schrijft de lijst als locations.js, in dezelfde opmaak als het bestaande bestand.
  // Waarden gaan door JSON.stringify, dus aanhalingstekens en nieuwe regels in
  // teksten kunnen het bestand niet breken. Onbekende extra velden blijven behouden.
  function serializeLocations(list) {
    var lines = ['const locations = ['];
    list.forEach(function (q, i) {
      var fields = [
        ['name', q.name], ['hint', q.hint], ['ans', q.ans === undefined ? '' : q.ans],
        ['media', q.media || ''], ['lat', q.lat], ['lng', q.lng]
      ];
      Object.keys(q).forEach(function (key) {
        if (KNOWN_FIELDS.indexOf(key) === -1) fields.push([key, q[key]]);
      });

      lines.push(INDENT + '{');
      fields.forEach(function (f) {
        lines.push(INDENT + '  ' + f[0] + ': ' + JSON.stringify(f[1]) + ',');
      });
      lines.push(INDENT + '  radius: ' + JSON.stringify(q.radius) + ' // ' + radiusComment(q.radius));
      lines.push(INDENT + '}' + (i < list.length - 1 ? ',' : ''));
    });
    lines.push('];', '');
    return lines.join('\n');
  }

  var lib = {
    parseNumber: parseNumber,
    validateQuestion: validateQuestion,
    serializeLocations: serializeLocations,
    radiusComment: radiusComment
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = lib;
    return;
  }
  window.iSFNAdminLib = lib;

  // ------------------------------------------------------------------ pagina
  var DRAFT_KEY = 'isfnAdminDraft';
  var DEFAULT_RADIUS_KM = 20; // zelfde standaard als het spel zelf gebruikt

  // Draait de pagina achter de Docker-server (server/server.js)? Dan kun je ingelogd
  // direct publiceren en media uploaden. Op GitHub Pages bestaat /api/session niet en
  // werkt de pagina zoals voorheen met een download.
  function detectServer() {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(null); }, 2500);
      fetch('/api/session', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (info) {
          clearTimeout(timer);
          if (info && info.server === true) {
            if (!info.authed) { location.replace('/admin/login'); return; }
            resolve(info);
          } else {
            resolve(null);
          }
        })
        .catch(function () { clearTimeout(timer); resolve(null); });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    detectServer().then(start);
  });

  function start(serverInfo) {
    var serverMode = Boolean(serverInfo);
    var published = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];
    var publishedJson = JSON.stringify(published);

    var $ = function (id) { return document.getElementById(id); };
    var el = {
      list: $('list'), count: $('count'), search: $('search'), formTitle: $('form-title'),
      form: $('form'), name: $('f-name'), hint: $('f-hint'), ans: $('f-ans'), media: $('f-media'),
      lat: $('f-lat'), lng: $('f-lng'), radius: $('f-radius'), preview: $('media-preview'),
      errors: $('errors'), save: $('save'), cancel: $('cancel'), del: $('delete'),
      dirty: $('dirty'), notice: $('notice'), publish: $('publish'), logout: $('logout'),
      mediaTools: $('media-tools'), mediaPick: $('media-pick'), mediaFile: $('media-file')
    };

    var items = clone(published);
    var editIndex = -1;
    var pin = null;
    var circle = null;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    // ---- concept bewaren (alleen in deze browser)
    function loadDraft() {
      try {
        var raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        var draft = JSON.parse(raw);
        return draft && Array.isArray(draft.items) ? draft : null;
      } catch (e) {
        return null;
      }
    }
    function saveDraft() {
      try {
        if (JSON.stringify(items) === publishedJson) localStorage.removeItem(DRAFT_KEY);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: publishedJson, items: items }));
      } catch (e) { /* zonder opslag werkt de pagina nog; het concept blijft dan alleen in dit tabblad */ }
    }
    function clearDraft() {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* niets te wissen */ }
    }

    function showNotice(text, kind, actions) {
      el.notice.replaceChildren();
      el.notice.className = 'notice' + (kind ? ' ' + kind : '');
      el.notice.appendChild(document.createTextNode(text));
      (actions || []).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = a.label; b.addEventListener('click', a.run);
        el.notice.appendChild(b);
      });
      el.notice.hidden = false;
    }
    function hideNotice() { el.notice.hidden = true; }

    var draft = loadDraft();
    if (draft) {
      if (draft.base === publishedJson) {
        items = draft.items;
        showNotice('Je concept van vorige keer is teruggezet.', 'ok');
      } else {
        showNotice('De gepubliceerde vragen zijn veranderd sinds je concept. Je ziet nu de gepubliceerde versie; je oude concept is niet gebruikt.', null, [
          { label: 'Oud concept toch laden', run: function () { items = draft.items; commit(); startNew(); hideNotice(); } },
          { label: 'Sluiten', run: function () { clearDraft(); hideNotice(); } }
        ]);
      }
    }

    // ---- kaart
    var map = iSFNMap.createGameMap('map', { worldCopyJump: true }).setView([20, 0], 2);

    function drawPreview() {
      if (pin) { map.removeLayer(pin); pin = null; }
      if (circle) { map.removeLayer(circle); circle = null; }
      var lat = iSFNAdminLib.parseNumber(el.lat.value);
      var lng = iSFNAdminLib.parseNumber(el.lng.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

      var km = iSFNAdminLib.parseNumber(el.radius.value);
      if (Number.isFinite(km) && km > 0) {
        circle = L.circle([lat, lng], { color: '#0b74de', fillColor: '#0b74de', fillOpacity: 0.15, radius: km * 1000 }).addTo(map);
      }
      pin = L.marker([lat, lng], { draggable: true, title: 'Sleep om te verplaatsen' }).addTo(map);
      pin.on('dragend', function () {
        var p = pin.getLatLng();
        setCoords(p.lat, p.lng);
      });
    }

    function roundCoord(n) { return Math.round(n * 1e6) / 1e6; }
    function setCoords(lat, lng) {
      // Leaflet geeft na verschuiven van de wereld lengtes buiten -180..180 terug.
      var wrapped = ((lng + 180) % 360 + 360) % 360 - 180;
      el.lat.value = String(roundCoord(lat));
      el.lng.value = String(roundCoord(wrapped));
      drawPreview();
    }

    map.on('click', function (e) { setCoords(e.latlng.lat, e.latlng.lng); });
    [el.lat, el.lng, el.radius].forEach(function (input) { input.addEventListener('input', drawPreview); });

    function focusOnQuestion(q) {
      if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng)) return;
      var zoom = q.radius >= 100 ? 5 : q.radius >= 10 ? 8 : q.radius >= 1 ? 11 : 14;
      map.setView([q.lat, q.lng], zoom);
    }

    // ---- media-voorbeeld
    var previewPath = null;
    function updateMediaPreview() {
      var path = el.media.value.trim();
      if (path === previewPath) return; // niets veranderd: voorkomt flikkeren
      previewPath = path;
      el.preview.replaceChildren();
      if (!path || /^\s*(javascript|data):/i.test(path)) return;
      el.preview.appendChild(iSFN.createMediaElement(path, el.name.value || 'media'));
    }
    // Pas bijwerken na even niet typen. Niet bij het verlaten van het veld: dan verandert de
    // hoogte van het voorbeeld precies tussen indrukken en loslaten van de muis, waardoor de
    // knop onder de cursor wegschuift en de klik op "Opslaan" verloren gaat.
    var previewTimer = null;
    el.media.addEventListener('input', function () {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updateMediaPreview, 300);
    });

    // ---- formulier
    function showErrors(messages) {
      el.errors.replaceChildren();
      if (!messages.length) { el.errors.hidden = true; return; }
      var ul = document.createElement('ul');
      messages.forEach(function (m) {
        var li = document.createElement('li'); li.textContent = m; ul.appendChild(li);
      });
      el.errors.appendChild(ul);
      el.errors.hidden = false;
    }

    function fillForm(q) {
      el.name.value = q.name || '';
      el.hint.value = q.hint || '';
      el.ans.value = q.ans || '';
      el.media.value = q.media || '';
      el.lat.value = Number.isFinite(q.lat) ? String(q.lat) : '';
      el.lng.value = Number.isFinite(q.lng) ? String(q.lng) : '';
      el.radius.value = Number.isFinite(q.radius) ? String(q.radius) : '';
      showErrors([]);
      updateMediaPreview();
      drawPreview();
    }

    function readForm() {
      return {
        name: el.name.value.trim(),
        hint: el.hint.value.trim(),
        ans: el.ans.value.trim(),
        media: el.media.value.trim(),
        lat: iSFNAdminLib.parseNumber(el.lat.value),
        lng: iSFNAdminLib.parseNumber(el.lng.value),
        radius: iSFNAdminLib.parseNumber(el.radius.value)
      };
    }

    function startNew() {
      editIndex = -1;
      el.formTitle.textContent = 'Nieuwe vraag';
      el.save.textContent = 'Toevoegen';
      el.del.hidden = true;
      fillForm({ radius: DEFAULT_RADIUS_KM });
      renderList();
    }

    function startEdit(i) {
      editIndex = i;
      el.formTitle.textContent = 'Vraag bewerken';
      el.save.textContent = 'Opslaan';
      el.del.hidden = false;
      fillForm(items[i]);
      focusOnQuestion(items[i]);
      renderList();
    }

    function remove(i) {
      var name = items[i].name;
      if (!window.confirm('Vraag "' + name + '" verwijderen?\n\nJe kunt dit terugdraaien met "Concept weggooien" zolang je het nog niet hebt gepubliceerd.')) return;
      items.splice(i, 1);
      commit();
      if (editIndex === i) startNew();
      else { if (editIndex > i) editIndex -= 1; renderList(); }
      showNotice('Verwijderd: ' + name, 'ok');
    }

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = readForm();
      var errors = iSFNAdminLib.validateQuestion(q, items, editIndex);
      showErrors(errors);
      if (errors.length) return;

      if (editIndex >= 0) {
        // Extra velden die dit formulier niet kent blijven behouden.
        items[editIndex] = Object.assign({}, items[editIndex], q);
        commit();
        showNotice('Opgeslagen: ' + q.name, 'ok');
        renderList();
      } else {
        items.push(q);
        commit();
        showNotice('Toegevoegd: ' + q.name, 'ok');
        startNew();
      }
    });
    el.cancel.addEventListener('click', startNew);
    el.del.addEventListener('click', function () { if (editIndex >= 0) remove(editIndex); });
    $('new').addEventListener('click', startNew);

    // ---- lijst
    function renderList() {
      var query = el.search.value.trim().toLowerCase();
      el.list.replaceChildren();
      var shown = 0;
      items.forEach(function (q, i) {
        if (query && String(q.name).toLowerCase().indexOf(query) === -1 &&
            String(q.hint || '').toLowerCase().indexOf(query) === -1) return;
        shown++;

        var li = document.createElement('li');
        if (i === editIndex) li.className = 'active';

        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = (i + 1) + '. ' + q.name;
        li.appendChild(name);

        if (q.media) {
          var tag = document.createElement('span');
          tag.className = 'tag'; tag.textContent = 'media'; tag.title = q.media;
          li.appendChild(tag);
        }

        var delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'danger'; delBtn.textContent = 'Verwijder';
        delBtn.addEventListener('click', function (e) { e.stopPropagation(); remove(i); });
        li.appendChild(delBtn);

        li.addEventListener('click', function () { startEdit(i); });
        el.list.appendChild(li);
      });
      el.count.textContent = query ? shown + ' van ' + items.length + ' vragen' : items.length + ' vragen';
    }
    el.search.addEventListener('input', renderList);

    // ---- opslaan van het concept en export
    function commit() {
      saveDraft();
      el.dirty.hidden = JSON.stringify(items) === publishedJson;
    }

    function exportText() { return iSFNAdminLib.serializeLocations(items); }

    $('download').addEventListener('click', function () {
      var blob = new Blob([exportText()], { type: 'text/javascript;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'locations.js';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showNotice(serverMode
        ? 'locations.js is gedownload (als back-up). Spelers zien alleen wat je met Publiceren hebt opgeslagen.'
        : 'locations.js is gedownload. Vervang game/locations.js in de repository door dit bestand en commit het.', 'ok');
    });

    $('copy').addEventListener('click', function () {
      var text = exportText();
      var done = function () { showNotice('Code gekopieerd. Plak hem in game/locations.js in de repository.', 'ok'); };
      var failed = function () { showNotice('Kopiëren is niet gelukt; gebruik "Download locations.js".'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, failed);
      } else {
        failed();
      }
    });

    $('discard').addEventListener('click', function () {
      if (JSON.stringify(items) === publishedJson) { showNotice('Er zijn geen wijzigingen om weg te gooien.', 'ok'); return; }
      if (!window.confirm('Alle wijzigingen sinds de gepubliceerde versie weggooien?')) return;
      items = clone(published);
      clearDraft();
      commit();
      startNew();
      showNotice('Concept weggegooid; de gepubliceerde vragen zijn teruggezet.', 'ok');
    });

    // ---- servermodus: publiceren, media uploaden, uitloggen
    var mediaMaxBytes = 0;

    function api(method, url, json, raw) {
      var headers = { 'X-Admin': '1' };
      var options = { method: method, headers: headers, credentials: 'same-origin' };
      if (raw) { headers['Content-Type'] = 'application/octet-stream'; options.body = raw; }
      else if (json !== undefined) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(json); }
      return fetch(url, options).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401) sessionExpired();
          if (!r.ok) {
            var err = new Error(data.error || 'Er ging iets mis (HTTP ' + r.status + ').');
            err.status = r.status;
            err.details = data.details || [];
            throw err;
          }
          return data;
        });
      });
    }

    function sessionExpired() {
      showNotice('Je sessie is verlopen. Log opnieuw in; je concept blijft bewaard.', null, [
        { label: 'Inloggen', run: function () { location.href = '/admin/login'; } }
      ]);
    }

    function publish() {
      if (JSON.stringify(items) === publishedJson) {
        showNotice('Er zijn geen wijzigingen om te publiceren.', 'ok');
        return;
      }
      el.publish.disabled = true;
      api('PUT', '/api/questions', { questions: items, base: publishedJson })
        .then(function (result) {
          published = clone(items);
          publishedJson = JSON.stringify(published);
          clearDraft();
          commit();
          showErrors([]);
          showNotice('Gepubliceerd (' + result.count + ' vragen). Spelers zien de wijziging zodra ze de pagina verversen.', 'ok');
        })
        .catch(function (err) {
          if (err.status === 401) return;
          if (err.status === 409) {
            showNotice(err.message, null, [{ label: 'Pagina herladen', run: function () { location.reload(); } }]);
            return;
          }
          var details = err.details && err.details.length ? err.details : [err.message];
          showErrors(details);
          showNotice('Niet gepubliceerd: ' + details[0]);
        })
        .then(function () { el.publish.disabled = false; });
    }

    // Bestandsnaam die de server accepteert: letters, cijfers, punt, streepje en underscore.
    function safeFileName(name) {
      var cleaned = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-');
      return cleaned.slice(-100).replace(/^[^A-Za-z0-9]+/, '');
    }

    function refreshMediaList() {
      return api('GET', '/api/media').then(function (data) {
        mediaMaxBytes = data.maxBytes || 0;
        el.mediaPick.replaceChildren();
        var first = document.createElement('option');
        first.value = ''; first.textContent = '— bestaand bestand kiezen —';
        el.mediaPick.appendChild(first);
        data.files.forEach(function (f) {
          var option = document.createElement('option');
          option.value = '../media-vragen/' + f.name;
          option.textContent = f.name + ' (' + Math.max(1, Math.round(f.size / 1024)) + ' kB)';
          el.mediaPick.appendChild(option);
        });
      }).catch(function () { /* de lijst is een gemak; uploaden en typen blijven werken */ });
    }

    function useMedia(path) {
      el.media.value = path;
      updateMediaPreview();
    }

    function uploadFile(file, overwrite) {
      var name = safeFileName(file.name);
      return api('POST', '/api/media?name=' + encodeURIComponent(name) + (overwrite ? '&overwrite=1' : ''), undefined, file);
    }

    function startUpload() {
      var file = el.mediaFile.files[0];
      if (!file) return;
      if (mediaMaxBytes && file.size > mediaMaxBytes) {
        showNotice('Dit bestand is te groot (maximaal ' + Math.round(mediaMaxBytes / 1048576) + ' MB).');
        el.mediaFile.value = '';
        return;
      }
      uploadFile(file, false)
        .catch(function (err) {
          if (err.status === 409 && window.confirm(err.message + '\n\nOverschrijven?')) return uploadFile(file, true);
          throw err;
        })
        .then(function (saved) {
          useMedia(saved.path);
          showNotice('Geüpload: ' + saved.name + '. Vergeet niet te publiceren.', 'ok');
          return refreshMediaList();
        })
        .catch(function (err) { if (err.status !== 401) showNotice('Uploaden mislukt: ' + err.message); })
        .then(function () { el.mediaFile.value = ''; });
    }

    if (serverMode) {
      el.publish.hidden = false;
      el.logout.hidden = false;
      el.mediaTools.hidden = false;
      $('server-help').hidden = false;
      $('static-help').hidden = true;
      $('download').classList.remove('primary');
      $('download').textContent = 'Download back-up';
      $('copy').hidden = true;

      el.publish.addEventListener('click', publish);
      el.mediaFile.addEventListener('change', startUpload);
      el.mediaPick.addEventListener('change', function () {
        if (el.mediaPick.value) useMedia(el.mediaPick.value);
        el.mediaPick.selectedIndex = 0;
      });
      el.logout.addEventListener('click', function () {
        var done = function () { location.href = '/admin/login'; };
        api('POST', '/api/logout').then(done, done);
      });
      refreshMediaList();
    }

    commit();
    startNew();
  }
})();
