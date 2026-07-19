/**
 * colorPick.js – Eigener kompakter Farbwähler + die Frage „steht gerade ein
 * Farbwähler dieses Panels offen?".
 *
 * WARUM ein eigener Wähler (@dpa 20260719_120425, image-4): der native Chrome-Picker
 * ist nicht stylebar — sein Mischfeld ist zu hoch („kann 2/3 kleiner"), die
 * Regenbogen-Leiste zu fett („so hoch wie der runde Farbpunkt daneben"), er startet
 * mit RGB statt Hex, und es fehlt ein Copy-Knopf für den Wert. Deshalb übernimmt
 * `upgradeColorInputs(panel)` alle `<input type="color">` eines Panels: der Klick
 * öffnet unser Popover statt des Browser-Fensters; jede Farbwahl schreibt
 * `input.value` und feuert ein `input`-Event — die bestehenden Listener der Panels
 * merken keinen Unterschied.
 *
 * Layout des Popovers (kompakt):
 *   [ SV-Mischfeld, volle Breite, ~56px hoch ]
 *   [ ● Farbpunkt ][ Hue-Regenbogen ]
 *   [ Pipette ][ HEX/RGB/HSL ][ Wert-Eingabe ][ ⧉ Copy ]
 * Der Wert wird im gewählten Format gezeigt/kopiert (Hex ist Default); der native
 * `<input type=color>` bleibt intern immer Hex. Pipette nutzt die EyeDropper-API
 * (nur Chromium; sonst ausgeblendet). Klick ins Wertfeld markiert alles.
 */

/* ── HSV ↔ RGB/Hex ── */
function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255));
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max ? d / max : 0, max];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
}
/** Farbwert aus beliebigem Format (Hex · rgb() · hsl()) → [r,g,b] oder null. */
function parseAnyColor(str) {
  str = String(str).trim();
  let m;
  if ((m = /^#?([0-9a-f]{6})$/i.exec(str))) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(str))) {
    return [+m[1], +m[2], +m[3]].map((x) => Math.max(0, Math.min(255, x)));
  }
  if ((m = /^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/i.exec(str))) {
    return hslToRgb(+m[1], +m[2], +m[3]);
  }
  return null;
}

let _openPop = null;   // es ist immer höchstens EIN Farb-Popover offen

function closePicker() {
  if (_openPop) { _openPop.el.remove(); _openPop = null; }
}

function openPicker(input) {
  closePicker();
  const rgb = hexToRgb(input.value) || [90, 209, 255];
  let [h, s, v] = rgbToHsv(...rgb);

  const pop = document.createElement('div'); pop.className = 'cp-pop';
  const EYE = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 2.3a1.9 1.9 0 0 1 2.6 2.6l-1 1 .9.9-1.3 1.3-.9-.9-4.9 4.9a1 1 0 0 1-.5.28l-2.5.6.6-2.5a1 1 0 0 1 .28-.5l4.9-4.9-.9-.9L9 3.3l.9.9z"/></svg>';
  pop.innerHTML = `
    <canvas class="cp-sv" width="200" height="56" title="Farbton mischen (Sättigung ↔ · Helligkeit ↕)"></canvas>
    <div class="cp-hue-row">
      <span class="cp-dot" title="Aktuelle Farbe"></span>
      <canvas class="cp-hue" width="176" height="16" title="Grundfarbe wählen"></canvas>
    </div>
    <div class="cp-hex-row">
      <button type="button" class="cp-eye" title="Pipette – Farbe vom Bildschirm aufnehmen">${EYE}</button>
      <button type="button" class="cp-fmt" title="Farbformat umschalten (Hex · RGB · HSL)">HEX</button>
      <input type="text" class="cp-hex" spellcheck="false" title="Farbwert – editierbar, Klick markiert alles" />
      <button type="button" class="cp-copy" title="Wert kopieren">⧉</button>
    </div>
  `;
  const sv = pop.querySelector('.cp-sv'), hue = pop.querySelector('.cp-hue');
  const dot = pop.querySelector('.cp-dot'), hexIn = pop.querySelector('.cp-hex');
  const fmtBtn = pop.querySelector('.cp-fmt'), eyeBtn = pop.querySelector('.cp-eye');
  let fmt = 'hex';
  const FMTS = ['hex', 'rgb', 'hsl'];
  const valStr = () => {
    const [r, g, b] = hsvToRgb(h, s, v);
    if (fmt === 'rgb') return `rgb(${r}, ${g}, ${b})`;
    if (fmt === 'hsl') {
      const [H, S, L] = rgbToHsl(r, g, b);
      return `hsl(${Math.round(H)}, ${Math.round(S)}%, ${Math.round(L)}%)`;
    }
    return rgbToHex(r, g, b);
  };
  if (!window.EyeDropper) eyeBtn.style.display = 'none';

  const drawHue = () => {
    const ctx = hue.getContext('2d'), w = hue.width, hh = hue.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, hh);
    const x = (h / 360) * w;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, 0.5, 4, hh - 1);
  };
  const drawSv = () => {
    const ctx = sv.getContext('2d'), w = sv.width, hh = sv.height;
    ctx.fillStyle = `hsl(${h},100%,50%)`; ctx.fillRect(0, 0, w, hh);
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)'); white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.fillRect(0, 0, w, hh);
    const black = ctx.createLinearGradient(0, 0, 0, hh);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black; ctx.fillRect(0, 0, w, hh);
    const x = s * w, y = (1 - v) * hh;
    ctx.strokeStyle = v > 0.6 ? '#000' : '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
  };
  const hexNow = () => rgbToHex(...hsvToRgb(h, s, v));
  const push = (updateField = true) => {
    const hex = hexNow();
    dot.style.background = hex;
    if (updateField) hexIn.value = valStr();
    input.value = hex;                 // nativer <input type=color> bleibt intern Hex
    input.dispatchEvent(new Event('input', { bubbles: true }));
    drawSv(); drawHue();
  };

  const dragOn = (canvas, setter) => {
    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      setter(
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      );
      push();
    };
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault(); move(e);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  };
  dragOn(sv, (x, y) => { s = x; v = 1 - y; });
  dragOn(hue, (x) => { h = x * 360; });

  hexIn.addEventListener('input', () => {
    const p = parseAnyColor(hexIn.value);
    if (p) { [h, s, v] = rgbToHsv(...p); push(false); }
  });
  hexIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') closePicker(); });
  // Klick ins Wertfeld markiert immer den gesamten Inhalt (Music-weit, s. Memory).
  hexIn.addEventListener('focus', () => hexIn.select());
  hexIn.addEventListener('mouseup', (e) => e.preventDefault());
  // Format durchschalten: Hex (Default) → RGB → HSL; Label + Feld folgen.
  fmtBtn.addEventListener('click', () => {
    fmt = FMTS[(FMTS.indexOf(fmt) + 1) % FMTS.length];
    fmtBtn.textContent = fmt.toUpperCase();
    hexIn.value = valStr();
  });
  // Pipette – Bildschirmfarbe aufnehmen (Chromium EyeDropper-API).
  eyeBtn.addEventListener('click', async () => {
    try {
      const res = await new window.EyeDropper().open();
      const p = hexToRgb(res.sRGBHex);
      if (p) { [h, s, v] = rgbToHsv(...p); push(); }
    } catch (_) { /* Nutzer hat abgebrochen */ }
  });
  pop.querySelector('.cp-copy').addEventListener('click', () => {
    const val = valStr();                 // kopiert im aktuell gewählten Format
    if (navigator.clipboard) navigator.clipboard.writeText(val).catch(() => {});
    else { hexIn.select(); document.execCommand('copy'); }
  });

  document.body.appendChild(pop);
  const r = input.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  _openPop = { el: pop, input };
  hexIn.value = valStr(); dot.style.background = hexNow();
  drawSv(); drawHue();

  setTimeout(() => document.addEventListener('mousedown', function outside(e) {
    if (_openPop && !_openPop.el.contains(e.target) && e.target !== input) {
      document.removeEventListener('mousedown', outside, true);
      closePicker();
    }
  }, true), 0);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && _openPop) { e.stopPropagation(); closePicker(); document.removeEventListener('keydown', esc, true); }
  }, true);
}

/** Alle `<input type="color">` eines Panels auf unseren Wähler umleiten. */
export function upgradeColorInputs(panel) {
  panel.querySelectorAll('input[type="color"]').forEach((input) => {
    if (input._cpUpgraded) return;
    input._cpUpgraded = true;
    input.addEventListener('click', (e) => { e.preventDefault(); openPicker(input); });
  });
}

/**
 * „Steht gerade ein Farbwähler dieses Panels offen?" — Ausnahme für die
 * Außenklick-Handler der Settings-Panels (Geschichte s. Git: der native Picker lebte
 * außerhalb des DOM und riss beim Schließen das Panel mit weg). Deckt beides ab:
 * den nativen `<input type="color">`-Fokus UND unser eigenes Popover.
 */
export function colorPickerBusy(panel) {
  if (_openPop && panel.contains(_openPop.input)) return true;
  const a = document.activeElement;
  return !!(a && a.tagName === 'INPUT' && a.type === 'color' && panel.contains(a));
}
