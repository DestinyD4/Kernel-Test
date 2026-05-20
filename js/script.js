'use strict';

// =====================================================
// УТИЛИТЫ
// =====================================================

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Простой seeded RNG (mulberry32)
function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================
// SEED для детерминированной коррупции
// =====================================================

let SEED;
function initSeed() {
  let s = sessionStorage.getItem('kernel_seed');
  if (!s) {
    s = String(Math.floor(Math.random() * 1e9));
    sessionStorage.setItem('kernel_seed', s);
  }
  SEED = parseInt(s, 10);
}

// =====================================================
// ПЕЧАТЬ С ЭФФЕКТОМ ТЕЛЕТАЙПА
// =====================================================

async function typeLines(target, lines, opts = {}) {
  const lineDelay = opts.lineDelay ?? 220;
  const charDelay = opts.charDelay ?? 0;
  const sound = opts.sound !== false;

  for (const line of lines) {
    const div = document.createElement('div');
    target.appendChild(div);
    if (charDelay > 0) {
      for (const ch of line) {
        div.textContent += ch;
        if (sound && ch !== ' ') SND.type();
        await sleep(charDelay);
      }
    } else {
      div.textContent = line;
      if (sound) SND.click();
    }
    await sleep(lineDelay);
  }
}

// =====================================================
// CORRUPT TEXT
// =====================================================

const GLITCH_CHARS = ['#', '@', '█', '▓', '%', '*'];
const GLITCH_INJECTS = [
  '/* SEGFAULT at 0xDEADBEEF */',
  '/* NULL PTR DEREF */',
  '/* SIGSEGV */',
  '/* DATA OVERWRITTEN */',
  '/* HUMAN LAYER COMPROMISED */',
  '/* MEMORY MISMATCH 0x00000000 */'
];

function corruptText(text, rng) {
  if (!text) return '';
  // Разбиваем на слова с пробелами
  const tokens = text.split(/(\s+)/);
  const out = [];

  for (let tok of tokens) {
    if (/^\s+$/.test(tok)) { out.push(esc(tok)); continue; }

    let word = tok;
    let html = '';

    // 10% — заменить слово на блок
    if (rng() < 0.10 && word.length >= 3) {
      out.push('<span class="corrupt">' + '█'.repeat(Math.max(3, word.length)) + '</span>');
      continue;
    }

    // Посимвольная коррупция (~15% символов)
    let chars = [];
    for (const ch of word) {
      if (rng() < 0.04) {
        const g = GLITCH_CHARS[Math.floor(rng() * GLITCH_CHARS.length)];
        chars.push('<span class="corrupt">' + g + '</span>');
      } else {
        chars.push(esc(ch));
      }
    }
    html = chars.join('');

    // 12% — обернуть в <del>
    if (rng() < 0.12) {
      html = '<del>' + html + '</del>';
    }

    out.push(html);

    // 4% — вставить системный комментарий после слова
    if (rng() < 0.04) {
      const inj = GLITCH_INJECTS[Math.floor(rng() * GLITCH_INJECTS.length)];
      out.push('<span class="sys-comment">' + esc(inj) + '</span>');
    }
  }

  return out.join('');
}

// =====================================================
// СОСТОЯНИЕ
// =====================================================

const STATE = {
  phase: 'boot',           // boot | phase1 | phase2
  inputBuffer: '',
  history: [],
  historyIdx: -1,
  idleTimer: null,
  intrusionCount: 0,
  lastActivity: Date.now()
};

// =====================================================
// СТАРТ
// =====================================================

window.addEventListener('load', init);

async function init() {
  initSeed();
  setupInputHandlers();
  await runBootScreen();
}

// =====================================================
// BOOT SCREEN
// =====================================================

async function runBootScreen() {
  STATE.phase = 'boot';
  document.body.className = 'boot';

  const bootText = $('#bootText');
  const bootPrompt = $('#bootPrompt');
  const startBtn = $('#startBtn');

  bootText.textContent = '';
  bootPrompt.innerHTML = '';

  await sleep(700);
  SND.init();
  SND.crtOn();
  SND.startHum(55, 0.04);

  bootText.textContent = 'NO SIGNAL\nREMOTE TERMINAL READY';
  await sleep(900);

  bootPrompt.innerHTML = '&gt; press any key to initialize connection <span class="cursor">█</span>';

  // На мобилках показать кнопку
  if (window.innerWidth < 768 || 'ontouchstart' in window) {
    startBtn.style.display = 'inline-block';
    startBtn.addEventListener('click', startSession, { once: true });
  }

  const keyHandler = (e) => {
    document.removeEventListener('keydown', keyHandler);
    document.removeEventListener('click', clickHandler);
    startSession();
  };
  const clickHandler = (e) => {
    if (e.target === startBtn) return;
    document.removeEventListener('keydown', keyHandler);
    document.removeEventListener('click', clickHandler);
    startSession();
  };
  document.addEventListener('keydown', keyHandler);
  document.addEventListener('click', clickHandler);
}

async function startSession() {
  SND.init();
  SND.beep(800, 0.05, 0.06);

  const bootScreen = $('#bootScreen');
  const content = $('#content');

  bootScreen.style.display = 'none';
  content.style.display = 'block';
  content.innerHTML = '';

  // Boot sequence
  const seqLines = [
    'Initializing remote terminal...',
    'Mounting user archive...',
    'Loading identity profile...',
    'KERNEL v1.0 loaded'
  ];

  const seqBlock = document.createElement('pre');
  seqBlock.className = 'boot-seq';
  content.appendChild(seqBlock);

  await typeLines(seqBlock, seqLines, { lineDelay: 350 });
  await sleep(500);

  await enterPhase1();
}

// =====================================================
// PHASE 1
// =====================================================

async function enterPhase1() {
  STATE.phase = 'phase1';
  document.body.className = 'phase1';
  SND.setHum(55, 0.035);

  const content = $('#content');
  content.innerHTML = renderPhase1();

  $('#inputLine').style.display = 'block';
  focusInput();
  resetIdleTimer();
}

function renderPhase1() {
  const d = DOSSIER;
  const p1 = d.phase1;

  let html = '';

  // ASCII лого
  html += `<pre class="ascii-logo">╔════════════════════════════╗
║   KERNEL v${d.version} [LOADED]      ║
╚════════════════════════════╝</pre>`;

  html += `<div class="menu-line">Доступные команды:
<a href="#status">/status</a>
<a href="#appearance">/appearance</a>
<a href="#personality">/personality</a>
<a href="#history">/history</a>
<a href="#abilities">/abilities</a></div>`;

  // STATUS
  html += `<section class="section" id="status">
    <h2>// STATUS</h2>
    <div class="body">codename:    ${esc(d.codename)}
status:      ${esc(d.status)}
age:         ${esc(p1.status.age)}
affiliation: ${esc(p1.status.affiliation)}
current:     ${esc(p1.status.currentStatus)}</div>
  </section>`;

  // APPEARANCE
  html += `<section class="section" id="appearance">
    <h2>// APPEARANCE</h2>
    <div class="body">${esc(p1.appearance)}</div>
  </section>`;

  // PERSONALITY
  html += `<section class="section" id="personality">
    <h2>// PERSONALITY</h2>
    <div class="body">${esc(p1.personality)}</div>
  </section>`;

  // HISTORY
  html += `<section class="section" id="history">
    <h2>// HISTORY</h2>
    <div class="body">${esc(p1.history)}</div>
  </section>`;

  // ABILITIES
  html += `<section class="section" id="abilities">
    <h2>// ABILITIES</h2>`;
  for (const ab of p1.abilities) {
    html += `<div class="ability">
      <h3>&gt; ${esc(ab.name)}</h3>
      <div class="body">${esc(ab.description)}</div>
    </div>`;
  }
  html += `</section>`;

  return html;
}

// =====================================================
// IDLE TIMER / INTRUSION
// =====================================================

function resetIdleTimer() {
  STATE.lastActivity = Date.now();
  if (STATE.idleTimer) clearTimeout(STATE.idleTimer);

  if (STATE.phase !== 'phase1') return;

  const delay = STATE.intrusionCount === 0
    ? 25000 + Math.random() * 15000
    : 30000;

  STATE.idleTimer = setTimeout(triggerIntrusion, delay);
}

async function triggerIntrusion() {
  if (STATE.phase !== 'phase1') return;
  if (STATE.intrusionCount >= 3) return;

  STATE.intrusionCount++;

  const content = $('#content');
  const notice = document.createElement('pre');
  notice.className = 'sys-notice';
  content.appendChild(notice);

  SND.setHum(70 + STATE.intrusionCount * 10, 0.05);
  SND.beep(440, 0.1, 0.08, 'sawtooth');

  const lines = [
    'SYSTEM NOTICE:',
    'Unauthorized modification detected.',
    'Archive checksum mismatch.',
    'File integrity compromised.',
    'Type /update to inspect changes.'
  ];

  await typeLines(notice, lines, { lineDelay: 280, sound: false });

  notice.scrollIntoView({ behavior: 'smooth', block: 'end' });

  if (STATE.intrusionCount < 3) {
    resetIdleTimer();
  }
}

// =====================================================
// КОМАНДЫ
// =====================================================

const COMMANDS = ['/status', '/appearance', '/personality', '/history', '/abilities', '/update', '/rollback'];

function executeCommand(cmd) {
  cmd = cmd.trim().toLowerCase();
  if (!cmd) return;

  STATE.history.push(cmd);
  STATE.historyIdx = STATE.history.length;

  if (STATE.phase === 'phase1') {
    if (['/status','/appearance','/personality','/history','/abilities'].includes(cmd)) {
      const id = cmd.slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      SND.click();
      return;
    }
    if (cmd === '/update') {
      triggerKernelPanic();
      return;
    }
  }

  if (cmd === '/rollback' && STATE.phase === 'phase2') {
    rollback();
    return;
  }

  // Неизвестная команда
  const content = $('#content');
  const line = document.createElement('div');
  line.className = 'sys-notice';
  line.textContent = `command not found: ${cmd}`;
  content.appendChild(line);
  line.scrollIntoView({ behavior: 'smooth', block: 'end' });
  SND.beep(200, 0.08, 0.07);
}

// =====================================================
// KERNEL PANIC -> PHASE 2
// =====================================================

async function triggerKernelPanic() {
  if (STATE.idleTimer) clearTimeout(STATE.idleTimer);
  $('#inputLine').style.display = 'none';

  // Зависание
  SND.setHum(40, 0.08);
  await sleep(900);

  // Красный warning
  const panic = document.createElement('div');
  panic.className = 'kernel-panic';
  panic.innerHTML = `<pre>╔══════════════════════════════╗
║         WARNING              ║
║      KERNEL PANIC            ║
║  MEMORY CORRUPTION DETECTED  ║
║    CORE DUMP INITIATED       ║
╚══════════════════════════════╝</pre>`;
  document.body.appendChild(panic);

  SND.crash();

  await sleep(1500);

  // Глитч
  panic.classList.add('glitch-active');
  document.body.classList.add('glitch-active');

  // Хаотичная замена символов
  const pre = panic.querySelector('pre');
  const original = pre.textContent;
  const glitchInterval = setInterval(() => {
    let g = '';
    for (const ch of original) {
      if (ch === ' ' || ch === '\n') { g += ch; continue; }
      if (Math.random() < 0.3) {
        g += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
      } else {
        g += ch;
      }
    }
    pre.textContent = g;
  }, 80);

  await sleep(1800);
  clearInterval(glitchInterval);

  // Чёрный экран
  panic.classList.remove('glitch-active');
  document.body.classList.remove('glitch-active');
  document.body.style.background = '#000';
  document.body.style.color = '#000';
  panic.style.display = 'none';

  await sleep(600);

  // Переход в фазу 2
  panic.remove();
  enterPhase2();
}

// =====================================================
// PHASE 2
// =====================================================

function enterPhase2() {
  STATE.phase = 'phase2';
  document.body.className = 'phase2';
  document.body.style.background = '';
  document.body.style.color = '';

  SND.setHum(45, 0.06);

  const content = $('#content');
  content.innerHTML = renderPhase2();

  // Логотип в шапке — кликабелен для rollback
  const logo = content.querySelector('.ascii-logo');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.title = 'click to rollback';
    logo.addEventListener('click', rollback);
  }

  $('#inputLine').style.display = 'none';

  startPhase2Glitches();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderPhase2() {
  const d = DOSSIER;
  const p1 = d.phase1;
  const p2 = d.phase2;
  const rng = makeRng(SEED);

  let html = '';

  html += `<pre class="ascii-logo" style="color:#8b0000;text-shadow:none;">╔══════════════════════════════════════════════════╗
║   ${p2.header}                        ║
║   ${p2.warning}  ║
╚══════════════════════════════════════════════════╝</pre>`;

  html += `<div class="sys-comment">// MOUNTED FROM BACKUP @ 0x${Math.floor(rng()*0xFFFFFF).toString(16).padStart(6,'0').toUpperCase()}</div>`;

  // STATUS (повреждённый)
  html += `<section class="section">
    <h2>// STATUS</h2>
    <div class="body">codename:    ${corruptText(d.codename, rng)}
status:      <span class="status-active module-status">CORRUPTED</span>
age:         ${corruptText(p1.status.age, rng)}
affiliation: ${corruptText(p1.status.affiliation, rng)}
current:     ${corruptText(p1.status.currentStatus, rng)}</div>
  </section>`;

  // APPEARANCE
  html += `<section class="section">
    <h2>// APPEARANCE <span class="sys-comment">[ surface layer ]</span></h2>
    <div class="body">${corruptText(p1.appearance, rng)}</div>
  </section>`;

  // PERSONALITY
  html += `<section class="section">
    <h2>// PERSONALITY <span class="sys-comment">[ behaviour stub ]</span></h2>
    <div class="body">${corruptText(p1.personality, rng)}</div>
  </section>`;

  // HISTORY
  html += `<section class="section">
    <h2>// HISTORY <span class="sys-comment">[ fabricated ]</span></h2>
    <div class="body">${corruptText(p1.history, rng)}</div>
  </section>`;

  // CORE MODULES (вместо abilities)
  html += `<section class="section">
    <h2>// CORE MODULES</h2>`;
  for (const m of p2.coreModules) {
    const statusClass = m.status === 'ACTIVE' ? 'status-active' : 'status-standby';
    html += `<div class="ability">
      <h3><span class="syscall">${esc(m.syscall)}</span>${esc(m.name)}<span class="module-status ${statusClass}">[${esc(m.status)}]</span></h3>
      <div class="body">${esc(m.description)}</div>
    </div>`;
  }
  html += `</section>`;

  // PASSIVE
  html += `<section class="section">
    <h2>// PASSIVE PROPERTIES</h2>`;
  for (const p of p2.passiveProperties) {
    html += `<div class="ability">
      <h3>${esc(p.name)}<span class="module-status status-always">[${esc(p.status)}]</span></h3>
      <div class="body">${esc(p.description || '')}</div>
    </div>`;
  }
  html += `</section>`;

  // SOUL INTERFACE
  const si = p2.soulInterface;
  html += `<section class="section">
    <h2>// SOUL INTERFACE</h2>
    <div class="ability">
      <h3>${esc(si.name)}<span class="module-status status-active">[${esc(si.status)}]</span></h3>
      <div class="body">${esc(si.description)}
modes: ${si.modes.map(esc).join(' | ')}</div>
    </div>
  </section>`;

  // WEAKNESSES — дамп памяти
  html += `<section class="section">
    <h2>// WEAKNESSES <span class="sys-comment">/* leaked from coredump */</span></h2>
    <div class="memdump">`;
  for (const w of p2.weaknesses) {
    const parts = w.split(/\s{2,}/);
    if (parts.length >= 2) {
      html += `<div><span class="addr">${esc(parts[0])}</span>${corruptText(parts.slice(1).join(' '), rng)}</div>`;
    } else {
      html += `<div>${corruptText(w, rng)}</div>`;
    }
  }
  html += `</div></section>`;

  // FINAL
  html += `<div class="final-prompt">Are you sure you want to continue? [Y/N] &gt; <span class="blink">_</span></div>`;

  return html;
}

// =====================================================
// ФОНОВЫЕ ГЛЮКИ ВО ФАЗЕ 2
// =====================================================

let phase2GlitchInterval = null;

function startPhase2Glitches() {
  if (phase2GlitchInterval) clearInterval(phase2GlitchInterval);

  phase2GlitchInterval = setInterval(() => {
    if (STATE.phase !== 'phase2') {
      clearInterval(phase2GlitchInterval);
      return;
    }
    // Найти случайный текстовый узел и заменить один символ
    const bodies =

$('.section .body, .memdump div');
    if (!bodies.length) return;
    const el = bodies[Math.floor(Math.random() * bodies.length)];

    // временно дрожание
    if (Math.random() < 0.4) {
      el.style.transform = `translateY(${(Math.random() > 0.5 ? 1 : -1)}px)`;
      setTimeout(() => { el.style.transform = ''; }, 120);
    }

    // редкий писк
    if (Math.random() < 0.15) {
      SND.beep(2000 + Math.random()*3000, 0.02, 0.025, 'square');
    }
  }, 2500);
}

// =====================================================
// ROLLBACK
// =====================================================

async function rollback() {
  if (STATE.phase !== 'phase2') return;

  SND.glitch();
  document.body.classList.add('glitch-active');
  await sleep(400);
  document.body.classList.remove('glitch-active');

  // Reboot screen
  const reboot = document.createElement('div');
  reboot.className = 'reboot-screen';
  reboot.textContent = 'Rebooting...';
  document.body.appendChild(reboot);

  await sleep(1100);
  reboot.remove();

  if (phase2GlitchInterval) clearInterval(phase2GlitchInterval);

  STATE.intrusionCount = 0;
  await enterPhase1();
}

// =====================================================
// ВВОД
// =====================================================

function setupInputHandlers() {
  const hidden = $('#hiddenInput');

  // Клик где угодно — фокус на скрытый input
  document.addEventListener('click', (e) => {
    if (STATE.phase === 'phase1') focusInput();
  });

  document.addEventListener('keydown', handleKey);

  // Для мобилок — input принимает события
  hidden.addEventListener('input', (e) => {
    STATE.inputBuffer = hidden.value;
    renderInputBuffer();
    resetIdleTimer();
  });
}

function focusInput() {
  const hidden = $('#hiddenInput');
  try { hidden.focus({ preventScroll: true }); } catch(e) { hidden.focus(); }
}

function handleKey(e) {
  // Глобальная активация звука
  SND.init();

  // Фаза 2: только Y/N
  if (STATE.phase === 'phase2') {
    const k = e.key.toLowerCase();
    if (k === 'y') {
      SND.glitch();
      document.body.classList.add('glitch-active');
      setTimeout(() => document.body.classList.remove('glitch-active'), 350);
    } else if (k === 'n') {
      SND.stopHum();
      const fp = $('.final-prompt .blink');
      if (fp) fp.style.animation = 'none';
    }
    return;
  }

  if (STATE.phase !== 'phase1') return;

  resetIdleTimer();

  if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = STATE.inputBuffer;
    STATE.inputBuffer = '';
    $('#hiddenInput').value = '';
    renderInputBuffer();
    executeCommand(cmd);
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    STATE.inputBuffer = STATE.inputBuffer.slice(0, -1);
    $('#hiddenInput').value = STATE.inputBuffer;
    renderInputBuffer();
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (STATE.history.length > 0) {
      STATE.historyIdx = Math.max(0, STATE.historyIdx - 1);
      STATE.inputBuffer = STATE.history[STATE.historyIdx] || '';
      $('#hiddenInput').value = STATE.inputBuffer;
      renderInputBuffer();
    }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (STATE.history.length > 0) {
      STATE.historyIdx = Math.min(STATE.history.length, STATE.historyIdx + 1);
      STATE.inputBuffer = STATE.history[STATE.historyIdx] || '';
      $('#hiddenInput').value = STATE.inputBuffer;
      renderInputBuffer();
    }
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const sugg = findSuggestion(STATE.inputBuffer);
    if (sugg) {
      STATE.inputBuffer = sugg;
      $('#hiddenInput').value = sugg;
      renderInputBuffer();
    }
    return;
  }

// Печатные символы — только звук, без добавления буквы
if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
  SND.type();  // только звук
  // НЕ добавляем STATE.inputBuffer += e.key
  // hiddenInput сам добавит символ через input-событие
}
}

function findSuggestion(buf) {
  if (!buf) return null;
  return COMMANDS.find(c => c.startsWith(buf.toLowerCase())) || null;
}

function renderInputBuffer() {
  const buf = $('#inputBuffer');
  const ac = $('#autoComplete');
  buf.textContent = STATE.inputBuffer;

  const sugg = findSuggestion(STATE.inputBuffer);
  if (sugg && sugg !== STATE.inputBuffer && STATE.inputBuffer.startsWith('/')) {
    ac.textContent = sugg.slice(STATE.inputBuffer.length);
  } else {
    ac.textContent = '';
  }

  // === ФИКС ДЛЯ МОБИЛОК: сохраняем позицию курсора ===
  const hidden = $('#hiddenInput');
  if (hidden && document.activeElement === hidden) {
    const cursorPos = hidden.selectionStart;
    if (cursorPos !== null && hidden.value !== STATE.inputBuffer) {
      hidden.value = STATE.inputBuffer;
      // Восстанавливаем позицию курсора (после того как обновили value)
      setTimeout(() => {
        hidden.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    } else if (hidden.value !== STATE.inputBuffer) {
      hidden.value = STATE.inputBuffer;
    }
  } else if (hidden && hidden.value !== STATE.inputBuffer) {
    hidden.value = STATE.inputBuffer;
  }
}
