document.addEventListener("DOMContentLoaded", () => {

  // ✅ Laad locaties
  const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];

  // ✅ Herstel score uit localStorage
  let score = iSFN.storage.getInt('exploScore', 0);
  let currentIndex = -1;
  const usedIndexes = new Set();

  // ✅ Maak de Leaflet-kaart aan (gedeelde OpenStreetMap-kaart, zie map.js)
  const map = iSFNMap.createGameMap('map', {
    worldCopyJump: true,
    zoomControl: true
  }).setView([20, 0], 2);

  let guessMarker = null;
  let selectedCoords = null;
  let answered = false; // voorkomt dubbel scoren tijdens de pauze na een goed antwoord

  // ✅ UI-referenties
  const placeNameEl = document.getElementById('place-name');
  const hintEl = document.getElementById('hint');
  const mediaArea = document.getElementById('media-area');
  const scoreEl = document.getElementById('score');
  const feedbackCenter = document.getElementById('feedbackCenter');

  function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    iSFN.storage.set('exploScore', score);
  }

  function showFeedbackCenter(text, good) {
    feedbackCenter.textContent = text;
    feedbackCenter.style.display = 'block';
    feedbackCenter.style.color = good ? '#28a745' : '#dc3545';
    setTimeout(() => feedbackCenter.style.display = 'none', 1000);
  }

  function pickRandomIndex() {
    if (LOCS.length === 0) return -1;

    // ✅ Als alle vragen gedaan zijn → melding tonen en opnieuw beginnen
    if (usedIndexes.size >= LOCS.length) {
      alert("Yo, je hebt alles gedaan, doei!");
      usedIndexes.clear();
    }

    let idx;
    do { idx = Math.floor(Math.random() * LOCS.length); }
    while (usedIndexes.has(idx));
    usedIndexes.add(idx);
    return idx;
  }

  function loadQuestion(idx) {
    if (idx < 0 || idx >= LOCS.length) return;
    currentIndex = idx;
    answered = false;
    const item = LOCS[idx];

    placeNameEl.textContent = item.name || '--';
    hintEl.textContent = item.hint || '';
    mediaArea.replaceChildren();

    if (item.media) {
      mediaArea.appendChild(iSFN.createMediaElement(item.media, item.name));
    }

    map.setView([20, 0], 2);
    if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null; }
    selectedCoords = null;
  }

  map.on('click', e => {
    selectedCoords = e.latlng;
    if (guessMarker) map.removeLayer(guessMarker);
    guessMarker = L.marker([e.latlng.lat, e.latlng.lng], { title: 'Jouw gok' }).addTo(map);
  });

  document.getElementById('confirmBtn').addEventListener('click', () => {
    if (!selectedCoords || currentIndex === -1 || answered) return;

    const { lat, lng } = selectedCoords;
    const item = LOCS[currentIndex];
    const dist = Math.round(iSFN.distanceMeters(lat, lng, item.lat, item.lng));
    const radius = (item.radius ? item.radius * 1000 : 20000);

    if (dist <= radius) {
      answered = true;
      score++;
      updateScore();
      showFeedbackCenter('GOED', true);
      iSFN.playSound('../Sounds/Correct.mp3');
      setTimeout(() => loadQuestion(pickRandomIndex()), 1000);
    } else {
      showFeedbackCenter('FOUT', false);
      iSFN.playSound('../Sounds/Incorrect.mp3');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    score = 0;
    iSFN.storage.remove('exploScore');
    updateScore();
    usedIndexes.clear();
    loadQuestion(pickRandomIndex());
  });

  // ✅ Start
  updateScore();
  if (LOCS.length > 0) loadQuestion(pickRandomIndex());
});
