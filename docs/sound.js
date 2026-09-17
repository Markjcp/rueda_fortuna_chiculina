// A short synthesized ratchet click: no audio downloads or external services.
export function createWheelSound(button, segments) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context;
  let volume;
  let enabled = false;
  let frame;
  let lastTick = -Infinity;
  const voices = new Set();

  function render() {
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Desactivar sonido' : 'Activar sonido';
    button.querySelector('.sound-label').textContent = enabled ? 'Sonido activado' : 'Activar sonido';
  }

  async function unlock() {
    if (!enabled) return;
    try {
      context ??= new AudioContext();
      if (!volume) {
        volume = context.createGain();
        volume.connect(context.destination);
      }
      volume.gain.value = enabled ? 0.16 : 0;
      await context.resume();
    } catch {
      enabled = false;
      if (volume) volume.gain.value = 0;
      render();
    }
  }

  button.addEventListener('click', () => {
    enabled = !enabled;
    if (volume) volume.gain.value = enabled ? 0.16 : 0;
    render();
    if (enabled) void unlock();
  });
  if (!AudioContext) {
    button.disabled = true;
    button.title = 'Sonido no disponible en este navegador';
    button.querySelector('.sound-label').textContent = 'Sonido no disponible';
  }

  function tick() {
    if (!enabled || !context || context.state !== 'running' || document.hidden) return;
    const now = context.currentTime;
    // Limit dense early clicks to avoid harsh overlapping audio.
    if (now - lastTick < 0.032) return;
    lastTick = now;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1800, now);
    oscillator.frequency.exponentialRampToValueAtTime(450, now + 0.025);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.8, now + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    oscillator.connect(envelope);
    envelope.connect(volume);
    voices.add(oscillator);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.035);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = undefined;
    for (const voice of voices) {
      try { voice.stop(); } catch { /* Already stopped. */ }
    }
    voices.clear();
  }

  function start(animation, degrees) {
    stop();
    lastTick = -Infinity;
    let previousSegment = -1;
    function followWheel() {
      if (animation.playState === 'finished' || animation.playState === 'idle') return;
      const progress = animation.effect.getComputedTiming().progress;
      if (progress !== null) {
        const segment = Math.floor(progress * degrees / 360 * segments);
        if (segment !== previousSegment) {
          previousSegment = segment;
          tick();
        }
      }
      frame = requestAnimationFrame(followWheel);
    }
    frame = requestAnimationFrame(followWheel);
  }

  window.addEventListener('pagehide', stop);
  return { unlock, start, stop };
}
