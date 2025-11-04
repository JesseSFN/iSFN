document.addEventListener("DOMContentLoaded", () => {

const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];
const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '© OpenStreetMap contributors'
}).addTo(map);

const featureGroup = L.featureGroup().addTo(map);
const markers = []; // om later te zoeken en popup te openen

LOCS.forEach(item => {
if (item.lat !== undefined && item.lng !== undefined) {
const latlng = [item.lat, item.lng];
const marker = L.marker(latlng);

  let popupContent = `<strong>${item.name}</strong>`;
  if (item.media) {
    const ext = item.media.split('.').pop().toLowerCase();
    if (['mp4','webm','ogg'].includes(ext)) {
      popupContent += `<br /><video src="${item.media}" controls playsinline style="max-width:200px;"></video>`;
    } else if (['mp3','wav','ogg'].includes(ext)) {
      popupContent += `<br /><audio src="${item.media}" controls></audio>`;
    } else {
      popupContent += `<br /><img src="${item.media}" alt="${item.name}" style="max-width:200px;" />`;
    }
  }

  if (item.radius !== undefined) {
    const radiusMeters = item.radius * 1000;
    const circle = L.circle(latlng, {
      color: 'blue',
      fillColor: 'rgba(0,0,255,0.1)',
      fillOpacity: 0.2,
      radius: radiusMeters
    });
    featureGroup.addLayer(circle);
    popupContent += `<br />Radius: ${item.radius} km`;
  }

  marker.bindPopup(popupContent);
  featureGroup.addLayer(marker);
  markers.push({ marker, name: item.name });
}

});

if (LOCS.length > 0) map.fitBounds(featureGroup.getBounds().pad(0.2));

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
suggestionBox.style.border = '1px solid #000000ff';
suggestionBox.style.width = 'calc(100% - 10px)';
suggestionBox.style.maxHeight = '150px';
suggestionBox.style.overflowY = 'auto';
suggestionBox.style.zIndex = '1000';
panel.appendChild(suggestionBox);

// ✅ Functie voor voorspellen
searchInput.addEventListener('input', () => {
const query = searchInput.value.toLowerCase();
suggestionBox.innerHTML = '';
if (!query) return;

const matches = markers.filter(m => m.name.toLowerCase().includes(query));
matches.forEach(m => {
  const div = document.createElement('div');
  div.textContent = m.name;
  div.style.padding = '3px 5px';
  div.style.cursor = 'pointer';
  div.addEventListener('click', () => {
    map.setView(m.marker.getLatLng(), 15);
    m.marker.openPopup();
    suggestionBox.innerHTML = '';
    searchInput.value = m.name;
  });
  suggestionBox.appendChild(div);
});

});

// Klik buiten om suggesties te sluiten
document.addEventListener('click', (e) => {
if (!panel.contains(e.target)) {
suggestionBox.innerHTML = '';
}
});

});
