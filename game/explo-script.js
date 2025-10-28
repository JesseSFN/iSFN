function LOCS() {
  return (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];
}

let score = 0;
let currentIndex = -1;
let usedIndexes = new Set();

const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let guessMarker = null;
let selectedCoords = null;

const placeNameEl = document.getElementById('place-name');
const hintEl = document.getElementById('hint');
const mediaArea = document.getElementById('media-area');
const scoreEl = document.getElementById('score');
const feedbackCenter = document.getElementById('feedbackCenter');

function updateScore() {
  scoreEl.textContent = `Score: ${score}`;
}

function showFeedbackCenter(text, good) {
  feedbackCenter.textContent = text;
  feedbackCenter.style.display = 'block';
  feedbackCenter.style.color = good ? '#28a745' : '#dc3545';
  setTimeout(() => feedbackCenter.style.display = 'none', 1000);
}

function pickNextIndex() {
  let idx = currentIndex + 1;
  if (idx >= LOCS.length) idx = 0;
  return idx;
}

function pickRandomIndex() {
  if (LOCS.length === 0) return -1;

  // Als alle locaties al gebruikt zijn, reset de set
  if (usedIndexes.size >= LOCS.length) usedIndexes.clear();

  let idx;
  do {
    idx = Math.floor(Math.random() * LOCS.length);
  } while (usedIndexes.has(idx));

  usedIndexes.add(idx);
  return idx;
}


function loadQuestion(idx) {
  currentIndex = idx;
  const item = LOCS[idx];
  placeNameEl.textContent = item.name || '--';
  hintEl.textContent = item.hint || '';

  mediaArea.innerHTML = '';
  if (item.media) {
    const mediaURL = item.media;
    const ext = mediaURL.split('.').pop().toLowerCase();

    if (['mp4', 'webm', 'ogg'].includes(ext)) {
      const v = document.createElement('video');
      v.src = mediaURL;
      v.controls = true;
      v.setAttribute('playsinline', '');
      mediaArea.appendChild(v);
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
      const a = document.createElement('audio');
      a.src = mediaURL;
      a.controls = true;
      mediaArea.appendChild(a);
    } else {
      const img = document.createElement('img');
      img.src = mediaURL;
      img.alt = item.name;
      mediaArea.appendChild(img);
    }
  }

  map.setView([20, 0], 2);
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
  selectedCoords = null;
}

function deg2rad(deg) {
  return deg * Math.PI / 180;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

map.on('click', function(e) {
  selectedCoords = e.latlng;
  if (guessMarker) map.removeLayer(guessMarker);
  guessMarker = L.marker([e.latlng.lat, e.latlng.lng], { title: 'Jouw gok' }).addTo(map);
});

document.getElementById('confirmBtn').addEventListener('click', () => {
  if (!selectedCoords || currentIndex === -1) return;
  const { lat, lng } = selectedCoords;
  const item = LOCS[currentIndex];
  const dist = Math.round(haversine(lat, lng, item.lat, item.lng));
  const radius = (item.radius ? item.radius * 1000 : 20000);

  const correctSound = new Audio('../Sounds/Correct.mp3'); 
  const wrongSound = new Audio('../Sounds/Incorrect.mp3');

if (dist <= radius) {
    score++;
    updateScore();
    showFeedbackCenter('GOED', true);

    // Play correct sound
    correctSound.play();

    setTimeout(() => loadQuestion(pickRandomIndex()), 1000);
} else {
    showFeedbackCenter('FOUT', false);

    // Play wrong sound
    wrongSound.play();
}
});

document.getElementById('resetBtn').addEventListener('click', () => {
  score = 0;
  updateScore();
  usedIndexes.clear(); // zet alles op nul
  loadQuestion(pickRandomIndex());
});

// Initialize
updateScore();
if (LOCS.length > 0) loadQuestion(pickRandomIndex());

