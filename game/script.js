// ----------------- INIT MAP -----------------
const map = iSFNMap.createGameMap('map').setView([20, 0], 2);

let currentLocation = null; // de geselecteerde vraag
let currentItem = null;     // het bijbehorende element in de lijst

const locationsList = document.getElementById('locations-list').getElementsByTagName('ul')[0];
const scoreEl = document.getElementById('score');

// Alleen opgeslagen antwoorden van vragen die nog bestaan tellen mee; zo klopt
// de score ook nadat er vragen zijn aangepast of verwijderd.
const knownNames = new Set(locations.map(location => location.name));
const correctLocations = iSFN.storage.getArray('correctLocations').filter(name => knownNames.has(name));
let score = correctLocations.length;

function updateScore() {
  scoreEl.textContent = "Score: " + score;
}
updateScore();

// ----------------- LOCATIONS LIST -----------------

// Shuffle function
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Markeert een lijstitem als goed beantwoord (vinkje komt vóór de hint).
function markCorrect(li) {
  li.classList.add('correct');
  const check = document.createElement('span');
  check.classList.add('checkmark');
  check.textContent = ' ✔';
  li.insertBefore(check, li.querySelector('.hint-text'));
}

// Shuffle the locations so the list order is random
const shuffledLocations = shuffleArray([...locations]);

shuffledLocations.forEach((location, index) => {
  const li = document.createElement('li');
  li.classList.add('location-item');
  li.appendChild(document.createTextNode(`${index + 1}. ${location.name}`));

  const hint = document.createElement('div');
  hint.classList.add('hint-text');
  hint.innerText = location.hint;
  li.appendChild(hint);

  if (correctLocations.includes(location.name)) {
    markCorrect(li);
  }

  li.addEventListener('click', () => {
    if (li.classList.contains('correct')) return;
    if (li.classList.contains('selected')) return;

    document.querySelectorAll('.location-item').forEach(item => item.classList.remove('selected'));
    document.querySelectorAll('.hint-text').forEach(h => h.classList.remove('show'));

    li.classList.add('selected');
    hint.classList.add('show');
    currentLocation = location;
    currentItem = li;
  });

  locationsList.appendChild(li);
});


// ----------------- MAP CLICK -----------------
map.on('click', e => {
  if (!currentLocation) return;

  const distanceKm = iSFN.distanceMeters(
    currentLocation.lat,
    currentLocation.lng,
    e.latlng.lat,
    e.latlng.lng
  ) / 1000;

  if (distanceKm <= currentLocation.radius) {
    alert("Goed! Binnen het gebied!");
    markCorrect(currentItem);
    correctLocations.push(currentLocation.name);
    iSFN.storage.set('correctLocations', correctLocations);
    score = correctLocations.length;
    updateScore();
    nextRound();
  } else {
    alert("Fout! Probeer het nog eens.");
  }
});

// ----------------- HELPER FUNCTIONS -----------------
function nextRound() {
  currentLocation = null;
  currentItem = null;
  map.setView([20, 0], 2);
  if (score >= locations.length) {
    const sound = document.getElementById('congratulations-sound');
    const image = document.getElementById('congratulations-image');
    if (sound) sound.play().catch(err => console.warn('[iSFN] Geluid kon niet worden afgespeeld:', err));
    if (image) {
      image.style.display = 'block';
      setTimeout(() => image.style.display = 'none', 5000);
    }
  }
}

// ----------------- RESET -----------------
document.getElementById('reset-button').addEventListener('click', () => {
  iSFN.storage.remove('correctLocations');
  correctLocations.length = 0;
  score = 0;
  updateScore();
  currentLocation = null;
  currentItem = null;
  document.querySelectorAll('.location-item').forEach(item => {
    item.classList.remove('correct', 'selected');
    const check = item.querySelector('.checkmark');
    if (check) check.remove();
  });
  document.querySelectorAll('.hint-text').forEach(h => h.classList.remove('show'));
  map.setView([20, 0], 2);
});

document.getElementById('back-button').addEventListener('click', () => {
  window.location.href = '../keuze-menu.html';
});
