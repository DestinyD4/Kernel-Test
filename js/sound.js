// Простые синтезированные звуки через WebAudio.
// Никаких внешних файлов — всё генерируется в браузере.

const SND = (() => {
  let ctx = null;
  let humOsc = null;
  let humGain = null;
  let started = false;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function startHum(freq = 55, vol = 0.05) {
    const c = ensure();
    if (!c) return;
    if (humOsc) return;
    humOsc = c.createOscillator();
    humGain = c.createGain();
    humOsc.type = 'sine';  // sine вместо sawtooth — мягче
    humOsc.frequency.value = freq;
    humGain.gain.value = vol * 0.3;  // тише сразу
    humOsc.connect(humGain).connect(c.destination);
    humOsc.start();
    
    // Через 3 секунды плавно затухает до почти неслышно
    humGain.gain.linearRampToValueAtTime(0.003, c.currentTime + 3);
  }

  function setHum(freq, vol) {
    if (!humOsc || !humGain) return;
    const c = ensure();
    humOsc.frequency.linearRampToValueAtTime(freq, c.currentTime + 1.5);
    humGain.gain.linearRampToValueAtTime(vol * 0.3, c.currentTime + 1.5);
  }

  function stopHum() {
    if (!humOsc) return;
    try { humOsc.stop(); } catch(e){}
    humOsc.disconnect();
    humGain.disconnect();
    humOsc = null;
    humGain = null;
  }

  function beep(freq = 1200, dur = 0.05, vol = 0.08, type = 'sine') {  // sine по умолчанию
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol * 0.25;  // тише в 4 раза
    o.connect(g).connect(c.destination);
    o.start();
    g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  }

  function click() {
    beep(120, 0.025, 0.08, 'sine');  // мягче, тише
  }

  function type() {
    beep(1800 + Math.random()*300, 0.008, 0.03, 'sine');  // тише, короче
  }

  function crtOn() {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 15000;
    g.gain.value = 0.0;
    o.connect(g).connect(c.destination);
    o.start();
    g.gain.linearRampToValueAtTime(0.01, c.currentTime + 0.05);  // тише
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
    o.frequency.linearRampToValueAtTime(8000, c.currentTime + 0.6);
    o.stop(c.currentTime + 0.7);
  }

  function glitch() {
    const c = ensure();
    if (!c) return;
    const bufSize = c.sampleRate * 0.4;
    const buffer = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (Math.random() > 0.85 ? 0.5 : 0.1);  // тише
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = 0.05;  // тише
    src.connect(g).connect(c.destination);
    src.start();
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);

    for (let i = 0; i < 4; i++) {
      setTimeout(() => beep(300 + Math.random()*1000, 0.03, 0.03, 'sine'), i*60);
    }
  }

  function crash() {
    glitch();
    setTimeout(() => {
      const c = ensure();
      if (!c) return;
      for (let i = 0; i < 3; i++) {
        setTimeout(() => beep(70 + Math.random()*30, 0.05, 0.08, 'sine'), i*150);
      }
    }, 200);
  }

  function init() {
    if (started) return;
    started = true;
    ensure();
  }

  return { init, startHum, stopHum, setHum, beep, click, type, crtOn, glitch, crash };
})();