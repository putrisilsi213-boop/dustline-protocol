// Every sound is synthesized with WebAudio: no audio files, no network. A shot is a
// filtered noise burst with a low thump; each weapon gets its own filter and decay.
export function createAudio() {
  let context = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst(duration, filterFreq, filterType, gain, decay) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = context.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + decay);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t);
    source.stop(t + duration);
  }

  function tone(freq, duration, gain, type, slideTo) {
    if (!ensure() || !enabled) return;
    const t = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  const SHOTS = {
    p9: () => { burst(0.09, 1400, 'lowpass', 0.5, 0.09); tone(140, 0.08, 0.3, 'sine', 60); },
    vulture: () => { burst(0.12, 1100, 'lowpass', 0.65, 0.11); tone(110, 0.1, 0.4, 'sine', 50); },
    hornet: () => { burst(0.08, 1800, 'bandpass', 0.45, 0.07); tone(160, 0.06, 0.25, 'sine', 70); },
    falcon: () => { burst(0.25, 800, 'lowpass', 0.9, 0.22); tone(90, 0.2, 0.55, 'sine', 40); },
  };

  return {
    unlock() { ensure(); },
    setEnabled(value) { enabled = value; },
    shot(id, distance) {
      const play = SHOTS[id] || SHOTS.vulture;
      if (distance !== undefined && distance > 8) {
        // Distant shots arrive duller and quieter.
        burst(0.12, 600, 'lowpass', Math.max(0.08, 0.5 - distance * 0.012), 0.12);
        return;
      }
      play();
    },
    dryClick() { tone(1800, 0.03, 0.2, 'square'); },
    reload() {
      tone(900, 0.05, 0.2, 'square');
      setTimeout(() => tone(700, 0.05, 0.2, 'square'), 350);
      setTimeout(() => tone(1200, 0.05, 0.25, 'square'), 700);
    },
    step() { burst(0.05, 500, 'lowpass', 0.12, 0.05); },
    hit() { tone(2200, 0.06, 0.25, 'square', 1400); },
    kill() { tone(520, 0.12, 0.3, 'sine', 780); },
    hurt() { burst(0.15, 300, 'lowpass', 0.5, 0.15); },
    plantBeep() { tone(880, 0.09, 0.3, 'square'); },
    bombBeep() { tone(1200, 0.07, 0.35, 'square'); },
    explosion() {
      burst(0.7, 400, 'lowpass', 1.0, 0.65);
      tone(60, 0.6, 0.7, 'sine', 30);
    },
    horn() {
      tone(220, 0.4, 0.3, 'sawtooth', 330);
      setTimeout(() => tone(330, 0.4, 0.3, 'sawtooth', 440), 380);
    },
    roundWin() {
      tone(523, 0.15, 0.3, 'sine');
      setTimeout(() => tone(659, 0.15, 0.3, 'sine'), 150);
      setTimeout(() => tone(784, 0.3, 0.3, 'sine'), 300);
    },
    roundLose() {
      tone(392, 0.2, 0.3, 'sine', 311);
      setTimeout(() => tone(311, 0.35, 0.3, 'sine', 262), 200);
    },
  };
}
