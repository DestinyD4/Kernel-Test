// Простые синтезированные звуки через WebAudio.
// Улучшенная версия: фильтры, джиттер, экспоненциальное затухание.

const SND = (() => {
  let ctx = null;
  let humOsc = null;
  let humGain = null;
  let humFilter = null;
  let humInterval = null;
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

    humFilter = c.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 400;
    humFilter.Q.value = 1.5;

    humOsc = c.createOscillator();
    humGain = c.createGain();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = freq;
    humGain.gain.value = vol * 0.2;
    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(c.destination);
    humOsc.start();

    // Плавное затухание за 4 секунды до очень тихого уровня
    const now = c.currentTime;
    humGain.gain.exponentialRampToValueAtTime(0.002, now + 4);

    // Лёгкий джиттер частоты для реализма
    let lastFreq = freq;
    humInterval = setInterval(() => {
      if (!humOsc) return;
      const newFreq = lastFreq * (0.98 + Math.random() * 0.04);
      humOsc.frequency.linearRampToValueAtTime(newFreq, c.currentTime + 0.5);
      lastFreq = newFreq;
    }, 800);
  }

  function setHum(freq, vol) {
    if (!humOsc || !humGain) return;
    const c = ensure();
    humOsc.frequency.linearRampToValueAtTime(freq, c.currentTime + 1.5);
    humGain.gain.linearRampToValueAtTime(vol * 0.2, c.currentTime + 1.5);
  }

  function stopHum() {
    if (humInterval) clearInterval(humInterval);
    if (!humOsc) return;
    try { humOsc.stop(); } catch(e){}
    humOsc.disconnect();
    humFilter.disconnect();
    humGain.disconnect();
    humOsc = null;
    humFilter = null;
    humGain = null;
  }

  // Вспомогательная: экспоненциальное затухание
  function expRamp(gainNode, target, duration) {
    const c = ensure();
    if (!c) return;
    try {
      gainNode.gain.exponentialRampToValueAtTime(target, c.currentTime + duration);
    } catch(e) {
      // Если target 0, exponential ругается — используем линейный
      gainNode.gain.linearRampToValueAtTime(target, c.currentTime + duration);
    }
  }

  function beep(freq = 1200, dur = 0.05, vol = 0.08, type = 'sine') {
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol * 0.2;
    o.connect(g).connect(c.destination);
    o.start();
    expRamp(g, 0.0001, dur);
    o.stop(c.currentTime + dur);
  }

  function click() {
    // Короткий щелчок с фильтром
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 800;
    o.type = 'triangle';
    o.frequency.value = 200;
    g.gain.value = 0.08;
    o.connect(f);
    f.connect(g);
    g.connect(c.destination);
    o.start();
    expRamp(g, 0.0001, 0.03);
    o.stop(c.currentTime + 0.03);
  }

  function type() {
    // Разные высоты тона для разных символов (симуляция механической клавиатуры)
    const varFreq = 1600 + Math.random() * 500;
    beep(varFreq, 0.015, 0.025, 'sine');
  }

  function crtOn() {
    const c = ensure();
    if (!c) return;
    // Высокочастотный свип + щелчок включения
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(18000, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(8000, c.currentTime + 0.4);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.03, c.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.55);

    // Щелчок реле
    const clickOsc = c.createOscillator();
    const clickGain = c.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.value = 80;
    clickGain.gain.setValueAtTime(0.04, c.currentTime + 0.05);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
    clickOsc.connect(clickGain).connect(c.destination);
    clickOsc.start(c.currentTime + 0.05);
    clickOsc.stop(c.currentTime + 0.15);
  }

  function glitch() {
    const c = ensure();
    if (!c) return;
    // Шумовой взрыв с битовыми искажениями
    const bufSize = c.sampleRate * 0.5;
    const buffer = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      // Имитация битовой ошибки: ступенчатый шум
      const step = Math.floor(Math.random() * 8) / 8;
      data[i] = (Math.random() - 0.5) * step * 1.2;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = 0.07;
    src.connect(g).connect(c.destination);
    src.start();
    expRamp(g, 0.0001, 0.5);

    // Короткие тона-«искры»
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        beep(400 + Math.random() * 1800, 0.02, 0.04, 'square');
      }, i * 40 + Math.random() * 30);
    }
  }

  function crash() {
    const c = ensure();
    if (!c) return;
    // Главный удар — низкочастотный бум
    const boom = c.createOscillator();
    const boomGain = c.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, c.currentTime);
    boom.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.3);
    boomGain.gain.setValueAtTime(0.2, c.currentTime);
    boomGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    boom.connect(boomGain).connect(c.destination);
    boom.start();
    boom.stop(c.currentTime + 0.5);

    // Шум рассыпающегося стекла
    const bufSize = c.sampleRate * 0.8;
    const buffer = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() - 0.5) * (i < 2000 ? 1 : 0.3);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = 0.1;
    src.connect(g).connect(c.destination);
    src.start();
    expRamp(g, 0.0001, 0.7);

    // Мелкие осколки — высокие тона
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        beep(1200 + Math.random() * 2000, 0.01, 0.02, 'triangle');
      }, i * 30);
    }
  }

  function init() {
    if (started) return;
    started = true;
    ensure();
  }

  return { init, startHum, stopHum, setHum, beep, click, type, crtOn, glitch, crash };
})();