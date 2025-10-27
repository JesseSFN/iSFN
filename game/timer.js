// timer.js
export function startMotivatieTimer(intervalMs = 3600000) {
  const audio = new Audio('../Sounds/OPSCHIETEN.wav'); // je mp3
  audio.volume = 1; // max volume
  audio.preload = 'auto';

  function playAudio() {
    audio.currentTime = 0;
    audio.play().catch(e => console.warn('Autoplay geblokkeerd:', e));
  }

  // eerste keer na interval
  setTimeout(() => {
    playAudio();
    setInterval(playAudio, intervalMs);
  }, intervalMs);
}

// automatisch starten bij import
startMotivatieTimer(); 
