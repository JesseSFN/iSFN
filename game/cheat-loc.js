document.addEventListener("DOMContentLoaded", () => {

const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];
const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 19,
attribution: '© OpenStreetMap contributors'
}).addTo(map);

const featureGroup = L.featureGroup().addTo(map);

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
}


});

if (LOCS.length > 0) map.fitBounds(featureGroup.getBounds().pad(0.2));

});
