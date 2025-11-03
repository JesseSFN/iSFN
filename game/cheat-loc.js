document.addEventListener("DOMContentLoaded", () => {

// ✅ Laad locaties
const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];

// ✅ Map-initialisatie
const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '© OpenStreetMap contributors'
}).addTo(map);

// ✅ Voeg alle locaties toe als markers
LOCS.forEach(item => {
if (item.lat !== undefined && item.lng !== undefined) {
const marker = L.marker([item.lat, item.lng]).addTo(map);
let popupContent = `<strong>${item.name}</strong>`;
if (item.media) {
const ext = item.media.split('.').pop().toLowerCase();
if (['mp4', 'webm', 'ogg'].includes(ext)) {
popupContent += `<br><video src="${item.media}" controls playsinline style="max-width:200px;"></video>`;
} else if (['mp3', 'wav', 'ogg'].includes(ext)) {
popupContent += `<br><audio src="${item.media}" controls></audio>`;
} else {
popupContent += `<br><img src="${item.media}" alt="${item.name}" style="max-width:200px;">`;
}
}
marker.bindPopup(popupContent);
}
});

// ✅ Optioneel: zoom zodat alle markers zichtbaar zijn
const group = new L.featureGroup(LOCS.map(item => L.marker([item.lat, item.lng])));
if (LOCS.length > 0) map.fitBounds(group.getBounds().pad(0.2));

});
