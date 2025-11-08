// ----------------- INIT MAP -----------------
let currentLocation = null;
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

const locationsList = document.getElementById('locations-list').getElementsByTagName('ul')[0];
const correctLocations = JSON.parse(localStorage.getItem('correctLocations')) || [];
let score = correctLocations.length;
document.getElementById('score').innerText = "Score: " + score;

// ----------------- LOCATIONS LIST -----------------

// Shuffle function
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Shuffle the locations so the list order is random
const shuffledLocations = shuffleArray([...locations]);

shuffledLocations.forEach((location, index) => {
  const li = document.createElement('li');
  li.classList.add('location-item');
  li.innerHTML = `${index + 1}. ${location.name}`;

  if (correctLocations.includes(location.name)) {
    li.classList.add('correct');
    li.innerHTML += ' <span class="checkmark">✔</span>';
  }

  const hint = document.createElement('div');
  hint.classList.add('hint-text');
  hint.innerText = location.hint;
  li.appendChild(hint);

  li.addEventListener('click', () => {
    if (li.classList.contains('correct')) return;
    if (li.classList.contains('selected')) return;

    document.querySelectorAll('.location-item').forEach(item => item.classList.remove('selected'));
    document.querySelectorAll('.hint-text').forEach(h => h.classList.remove('show'));

    li.classList.add('selected');
    hint.classList.add('show');
    currentLocation = location;
  });

  locationsList.appendChild(li);
});


// ----------------- MAP CLICK -----------------
map.on('click', e => {
  if (!currentLocation) return;

  const distance = getDistanceFromLatLonInKm(
    currentLocation.lat,
    currentLocation.lng,
    e.latlng.lat,
    e.latlng.lng
  );

  if (distance <= currentLocation.radius) {
    alert("Goed! Binnen het gebied!");
    const item = Array.from(document.querySelectorAll('.location-item'))
      .find(el => el.innerText.includes(currentLocation.name));
    item.classList.add('correct');
    item.innerHTML += ' <span class="checkmark">✔</span>';
    correctLocations.push(currentLocation.name);
    localStorage.setItem('correctLocations', JSON.stringify(correctLocations));
    score = correctLocations.length;
    document.getElementById('score').innerText = "Score: " + score;
    nextRound();
  } else {
    alert("Fout! Probeer het nog eens.");
  }
});

// ----------------- HELPER FUNCTIONS -----------------
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function nextRound() {
  currentLocation = null;
  map.setView([20, 0], 2);
  if (score === locations.length) {
    const sound = document.getElementById('congratulations-sound');
    const image = document.getElementById('congratulations-image');
    if (sound) sound.play();
    if (image) {
      image.style.display = 'block';
      setTimeout(() => image.style.display = 'none', 5000);
    }
  }
}

// ----------------- RESET -----------------
document.getElementById('reset-button').addEventListener('click', () => {
  localStorage.removeItem('correctLocations');
  correctLocations.length = 0;
  score = 0;
  document.getElementById('score').innerText = "Score: 0";
  document.querySelectorAll('.location-item').forEach(item => {
    item.classList.remove('correct', 'selected');
    const check = item.querySelector('.checkmark');
    if (check) check.remove();
  });
  map.setView([20, 0], 2);
});

document.getElementById('back-button').addEventListener('click', () => {
  window.location.href = '../keuze-menu.html';
});
