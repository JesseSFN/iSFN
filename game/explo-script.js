document.addEventListener("DOMContentLoaded", () => {

  // ✅ Laad locaties
  const LOCS = (typeof locations !== 'undefined' && Array.isArray(locations)) ? locations : [];

  // ✅ Herstel score, huidige vraag, en gebruikte vragen uit localStorage.
  // Alleen geldige vraagnummers tellen mee, zodat een aangepaste vragenlijst
  // het spel niet laat vastlopen op een oude opgeslagen waarde.
  const isValidIndex = i => Number.isInteger(i) && i >= 0 && i < LOCS.length;

  let score = iSFN.storage.getInt('exploScore', 0);
  let currentIndex = iSFN.storage.getInt('currentIndex', -1);
  if (!isValidIndex(currentIndex)) currentIndex = -1;

  const usedIndexes = new Set(iSFN.storage.getArray('usedIndexes').filter(isValidIndex));

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

  // ✅ Maak einde-popup element (eenmalig)
  const endPopup = document.createElement('div');
  endPopup.id = 'endPopup';
  endPopup.innerHTML = `
  <div id="endPopupContent">
    <h2> Goed Gedaan!</h2>
    <p>Je hebt een score van:</p>
    <p id="finalScore"></p>
    <p>Roep een Leiding om hier een foto van te maken!</p>
    <button id="restartBtn">Reset</button>
  </div>
`;
  document.body.appendChild(endPopup);

  // ✅ Popup-elementen
  const finalScoreEl = endPopup.querySelector('#finalScore');
  const restartBtn = endPopup.querySelector('#restartBtn');

  function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    iSFN.storage.set('exploScore', score);
  }

  function saveProgress() {
    iSFN.storage.set('usedIndexes', Array.from(usedIndexes));
    iSFN.storage.set('currentIndex', currentIndex);
  }

  function showFeedbackCenter(text, good) {
    feedbackCenter.textContent = text;
    feedbackCenter.style.display = 'block';
    feedbackCenter.style.color = good ? '#28a745' : '#dc3545';
    setTimeout(() => feedbackCenter.style.display = 'none', 1000);
  }

  function showEndPopup() {
    finalScoreEl.textContent = `${score}`;
    endPopup.style.display = 'flex';
  }

  function hideEndPopup() {
    endPopup.style.display = 'none';
  }

  function resetAll() {
    score = 0;
    updateScore();
    usedIndexes.clear();
    currentIndex = -1;
    iSFN.storage.remove('exploScore');
    iSFN.storage.remove('usedIndexes');
    iSFN.storage.remove('currentIndex');
    hideEndPopup();
    loadQuestion(pickRandomIndex());
  }

  restartBtn.addEventListener('click', resetAll);

  function pickRandomIndex() {
    if (LOCS.length === 0) return -1;

    // ✅ Alle vragen gedaan → popup tonen en stoppen
    if (usedIndexes.size >= LOCS.length) {
      showEndPopup();
      return -1;
    }

    let idx;
    do { idx = Math.floor(Math.random() * LOCS.length); }
    while (usedIndexes.has(idx));

    usedIndexes.add(idx);
    saveProgress();
    return idx;
  }

  function loadQuestion(idx) {
    if (!isValidIndex(idx)) return;
    currentIndex = idx;
    answered = false;
    saveProgress();

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

      setTimeout(() => {
        const newIdx = pickRandomIndex();
        if (newIdx !== -1) loadQuestion(newIdx);
      }, 1000);
    } else {
      showFeedbackCenter('FOUT', false);
      iSFN.playSound('../Sounds/Incorrect.mp3');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', resetAll);

  // ✅ Start
  updateScore();

  if (LOCS.length > 0) {
    // 🔹 Controle: als alle vragen al beantwoord zijn, toon meteen het eindscherm
    if (score >= LOCS.length) {
      showEndPopup();
    } else if (currentIndex !== -1) {
      loadQuestion(currentIndex);
    } else {
      loadQuestion(pickRandomIndex());
    }
  }
});
