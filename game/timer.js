// timer.js
export function startMotivatieTimer(intervalMs = 5000) {
  // beschikbare geluiden
  const sounds = [
    '../Sounds/OPSCHIETEN.wav',
    '../Sounds/schietnouisop.wav',
    '../Sounds/opschieten2.wav'
  ];

  let lastScore = parseInt(localStorage.getItem('exploScore')) || 0;

  function playRandomAudio() {
    const randomSound = sounds[Math.floor(Math.random() * sounds.length)];
    const audio = new Audio(randomSound);
    audio.volume = 1;
    audio.play().catch(e => console.warn('Autoplay geblokkeerd:', e));
  }

  async function checkScoreAndPlay() {
    const currentScore = parseInt(localStorage.getItem('exploScore')) || 0;

    if (currentScore <= lastScore) {
      // score is niet gestegen → speel willekeurig geluid
      playRandomAudio();
    } else {
      console.log('Score is gestegen, geen geluid dit uur.');
    }

    lastScore = currentScore;
  }

  // elke uur checken
  setInterval(checkScoreAndPlay, intervalMs);

  // start eerste check na één uur
  setTimeout(checkScoreAndPlay, intervalMs);
}

// automatisch starten bij import
startMotivatieTimer();
