// timer.js
export function startMotivatieTimer(intervalMs = 3600000) {
  // beschikbare geluiden
  const sounds = [
    '../Sounds/OPSCHIETEN.wav',
    '../Sounds/schietnouisop.wav',
    '../Sounds/opschieten2.wav'
  ];

  // localStorage kan ontbreken (privémodus); dan telt de score als 0.
  function readScore() {
    try {
      return parseInt(localStorage.getItem('exploScore'), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  let lastScore = readScore();

  function playRandomAudio() {
    const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
    const audio = new Audio(randomSound);
    audio.volume = 1;
    audio.play().catch(e => console.warn('Autoplay geblokkeerd:', e));
  }

  function checkScoreAndPlay() {
    const currentScore = readScore();

    if (currentScore <= lastScore) {
      // score is niet gestegen → speel willekeurig geluid
      playRandomAudio();
    } else {
      console.log('Score is gestegen, geen geluid dit uur.');
    }

    lastScore = currentScore;
  }

  // Elk uur controleren. (Eerder liep hier óók een setTimeout met dezelfde
  // controle na een uur; dat gaf op het eerste uur twee controles vlak na
  // elkaar, met dubbel geluid als gevolg.)
  setInterval(checkScoreAndPlay, intervalMs);
}

// automatisch starten bij import
startMotivatieTimer();
