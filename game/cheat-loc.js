document.addEventListener("DOMContentLoaded", () => {

const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];

// Gedeelde OpenStreetMap-kaart (zie map.js)
const map = iSFNMap.createGameMap('map', { worldCopyJump: true }).setView([20, 0], 2);

const featureGroup = L.featureGroup().addTo(map);
const markers = []; // om later te zoeken en popup te openen

// Bouwt de popup met DOM-elementen, zodat aanhalingstekens of < > in een
// vraagnaam de weergave niet kunnen breken.
function buildPopup(item) {
  const popup = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = item.name;
  popup.appendChild(title);

  if (item.media) {
    popup.appendChild(document.createElement('br'));
    const media = iSFN.createMediaElement(item.media, item.name);
    if (media.tagName !== 'AUDIO') media.style.maxWidth = '200px';
    popup.appendChild(media);
  }

  if (item.radius !== undefined) {
    popup.appendChild(document.createElement('br'));
    popup.appendChild(document.createTextNode(`Radius: ${item.radius} km`));
  }

  return popup;
}

LOCS.forEach(item => {
  if (item.lat === undefined || item.lng === undefined) return;

  const latlng = [item.lat, item.lng];
  const marker = L.marker(latlng);

  if (item.radius !== undefined) {
    featureGroup.addLayer(L.circle(latlng, {
      color: 'blue',
      fillColor: 'rgba(0,0,255,0.1)',
      fillOpacity: 0.2,
      radius: item.radius * 1000
    }));
  }

  marker.bindPopup(buildPopup(item));
  featureGroup.addLayer(marker);
  markers.push({ marker, name: item.name });
});

if (markers.length > 0) map.fitBounds(featureGroup.getBounds().pad(0.2));

// ✅ Zoekbalk toevoegen in panel
const panel = document.querySelector('.panel');
const searchInput = document.createElement('input');
searchInput.type = 'text';
searchInput.placeholder = 'Zoek locatie…';
searchInput.id = 'search-locations';
searchInput.style.width = '100%';
searchInput.style.marginBottom = '5px';
panel.prepend(searchInput);

const suggestionBox = document.createElement('div');
suggestionBox.id = 'suggestions';
suggestionBox.style.position = 'absolute';
suggestionBox.style.backgroundColor = 'white';
suggestionBox.style.color = 'black'; // ✅ zwarte tekst
suggestionBox.style.border = '1px solid #ccc';
suggestionBox.style.width = 'calc(100% - 10px)';
suggestionBox.style.maxHeight = '150px';
suggestionBox.style.overflowY = 'auto';
suggestionBox.style.zIndex = '1000';
panel.appendChild(suggestionBox);

// ✅ Functie voor voorspellen
searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase();
  suggestionBox.replaceChildren();
  if (!query) return;

  markers
    .filter(m => m.name.toLowerCase().includes(query))
    .forEach(m => {
      const div = document.createElement('div');
      div.textContent = m.name;
      div.style.padding = '3px 5px';
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        map.setView(m.marker.getLatLng(), 15);
        m.marker.openPopup();
        suggestionBox.replaceChildren();
        searchInput.value = m.name;
      });
      suggestionBox.appendChild(div);
    });
});

// Klik buiten om suggesties te sluiten
document.addEventListener('click', (e) => {
  if (!panel.contains(e.target)) {
    suggestionBox.replaceChildren();
  }
});

});
