/**
 * colorPick.js – Eigener Farbwähler + die Frage „steht gerade ein Farbwähler dieses
 * Panels offen?".
 *
 * WARUM ein eigener Wähler (@dpa 20260719_120425, image-4): der native Chrome-Picker
 * ist nicht stylebar. `upgradeColorInputs(panel)` übernimmt alle `<input type="color">`
 * eines Panels: der Klick öffnet unser Popover statt des Browser-Fensters; jede Farbwahl
 * schreibt `input.value` und feuert ein `input`-Event — die bestehenden Listener der
 * Panels merken keinen Unterschied.
 *
 * Layout-Umbau (@dpa 20260722_042020, ddw.md): das alte SV-Quadrat + separate Hue-Leiste
 * ist raus, ersetzt durch EIN fließendes Feld (Vorbild: das mitgeschickte „Spektrum"-
 * Screenshot des System-Farbwählers) — X = Helligkeit (weiß…Farbe…schwarz), Y = Farbton
 * (Regenbogen). Sättigung ist die einzige Dimension, die das Feld nicht abdeckt, deshalb
 * ein eigener, breiter Regler rechts daneben („diesen Bereich breiter machen"). Darunter:
 * ein Farb-Swatch (@dpa: „Anzeige der tatsächlichen Farbe fehlt noch"), dann H/S/L als
 * DREI EINZELNE, draggable Zahlenfelder (senkrechtes Ziehen = Wert ändern, wie ein
 * Mini-Regler auf der Zahl selbst) — unabhängig vom Hex/RGB/HSL-Textfeld darunter, das
 * unverändert bleibt (Copy + Pipette „sollen auf jeden Fall bleiben").
 * Intern jetzt HSL statt HSV, weil das neue Feld direkt in H/L rechnet.
 */

/* ── HSL ↔ RGB/Hex ── */
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

/** Senkrechtes Ziehen auf einer Zahl ändert ihren Wert (@dpa 20260722_042020: „die Zahlen
 *  darin vielleicht sogar dragbar") — 1 Einheit je 2px, Shift = fein (0.25 Einheiten je 2px).
 *  Klick ohne Drag bleibt fürs Markieren/Tippen frei (contenteditable-Feld). */
function scrubNumber(el, get, set, { min, max } = {}) {
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startY = e.clientY, startV = get();
    let moved = false;
    const move = (ev) => {
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 2) moved = true;
      if (!moved) return;
      const step = ev.shiftKey ? 0.25 : 1;
      let v = startV + dy * step;
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      set(Math.round(v));
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      if (!moved) { el.focus(); document.execCommand && window.getSelection().selectAllChildren(el); }
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  });
  el.style.cursor = 'ns-resize';
}

function openPicker(input) {
  closePicker();
  const rgb = hexToRgb(input.value) || [90, 209, 255];
  let [h, s, l] = rgbToHsl(...rgb);

  const pop = document.createElement('div'); pop.className = 'cp-pop';
  const EYE = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 2.3a1.9 1.9 0 0 1 2.6 2.6l-1 1 .9.9-1.3 1.3-.9-.9-4.9 4.9a1 1 0 0 1-.5.28l-2.5.6.6-2.5a1 1 0 0 1 .28-.5l4.9-4.9-.9-.9L9 3.3l.9.9z"/></svg>';
  pop.innerHTML = `
    <div class="cp-field-row">
      <canvas class="cp-field" width="200" height="200" title="Farbe wählen (waagerecht = Helligkeit, senkrecht = Farbton)"></canvas>
      <canvas class="cp-sat" width="28" height="200" title="Sättigung (senkrecht ziehen)"></canvas>
    </div>
    <div class="cp-swatch-row">
      <span class="cp-swatch" title="Aktuelle Farbe"></span>
      <div class="cp-hsl-nums">
        <div class="cp-num-field"><span class="cp-num cp-num-h" contenteditable="true" spellcheck="false"></span><label>H</label></div>
        <div class="cp-num-field"><span class="cp-num cp-num-s" contenteditable="true" spellcheck="false"></span><label>S</label></div>
        <div class="cp-num-field"><span class="cp-num cp-num-l" contenteditable="true" spellcheck="false"></span><label>L</label></div>
      </div>
    </div>
    <div class="cp-hex-row">
      <button type="button" class="cp-eye" title="Pipette – Farbe vom Bildschirm aufnehmen">${EYE}</button>
      <button type="button" class="cp-fmt" title="Farbformat umschalten (Hex · RGB · HSL)">HEX</button>
      <input type="text" class="cp-hex" spellcheck="false" title="Farbwert – editierbar, Klick markiert alles" />
      <button type="button" class="cp-copy" title="Wert kopieren">⧉</button>
    </div>
  `;
  const field = pop.querySelector('.cp-field'), satBar = pop.querySelector('.cp-sat');
  const swatch = pop.querySelector('.cp-swatch'), hexIn = pop.querySelector('.cp-hex');
  const fmtBtn = pop.querySelector('.cp-fmt'), eyeBtn = pop.querySelector('.cp-eye');
  const numH = pop.querySelector('.cp-num-h'), numS = pop.querySelector('.cp-num-s'), numL = pop.querySelector('.cp-num-l');
  let fmt = 'hex';
  const FMTS = ['hex', 'rgb', 'hsl'];
  const valStr = () => {
    const [r, g, b] = hslToRgb(h, s, l);
    if (fmt === 'rgb') return `rgb(${r}, ${g}, ${b})`;
    if (fmt === 'hsl') return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
    return rgbToHex(r, g, b);
  };
  if (!window.EyeDropper) eyeBtn.style.display = 'none';

  // Fließendes Feld (@dpa: „die fließende Farbwahl auf diesem Bild gefällt mir"): pro
  // Zeile (= ein Farbton) ein waagerechter Verlauf weiß→Farbton(100% Sättigung, 50%
  // Helligkeit)→schwarz. So codiert eine einzige Fläche Farbton UND Helligkeit zugleich.
  const drawField = () => {
    const ctx = field.getContext('2d'), w = field.width, hh = field.height;
    for (let y = 0; y < hh; y++) {
      const hue = (y / hh) * 360;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.5, `hsl(${hue},100%,50%)`);
      grad.addColorStop(1, '#000');
      ctx.fillStyle = grad; ctx.fillRect(0, y, w, 1);
    }
    const x = (1 - l / 100) * w, y = (h / 360) * hh;
    ctx.strokeStyle = l > 55 ? '#000' : '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
  };
  // Sättigungsregler (@dpa: „rechts die Helligkeit... mach diesen Bereich breiter" — das
  // Feld deckt Farbton+Helligkeit schon ab, hier bleibt als einzige fehlende Dimension die
  // Sättigung): oben = voll gesättigt, unten = grau, bei der aktuellen Helligkeit gezeigt.
  const drawSat = () => {
    const ctx = satBar.getContext('2d'), w = satBar.width, hh = satBar.height;
    const grad = ctx.createLinearGradient(0, 0, 0, hh);
    grad.addColorStop(0, `hsl(${h},100%,${l}%)`);
    grad.addColorStop(1, `hsl(${h},0%,${l}%)`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, hh);
    const y = (1 - s / 100) * hh;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(0.5, y - 2, w - 1, 4);
  };
  const push = (updateField = true) => {
    const [r, g, b] = hslToRgb(h, s, l);
    const hex = rgbToHex(r, g, b);
    swatch.style.background = hex;
    if (updateField) hexIn.value = valStr();
    numH.textContent = Math.round(h); numS.textContent = Math.round(s); numL.textContent = Math.round(l);
    input.value = hex;                 // nativer <input type=color> bleibt intern Hex
    input.dispatchEvent(new Event('input', { bubbles: true }));
    drawField(); drawSat();
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
  dragOn(field, (x, y) => { l = (1 - x) * 100; h = y * 360; });
  dragOn(satBar, (_x, y) => { s = (1 - y) * 100; });

  // H/S/L einzeln draggable (senkrecht ziehen) UND direkt editierbar (contenteditable).
  scrubNumber(numH, () => h, (v) => { h = ((v % 360) + 360) % 360; push(); }, {});
  scrubNumber(numS, () => s, (v) => { s = Math.max(0, Math.min(100, v)); push(); }, { min: 0, max: 100 });
  scrubNumber(numL, () => l, (v) => { l = Math.max(0, Math.min(100, v)); push(); }, { min: 0, max: 100 });
  const editNum = (el, apply) => {
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
    el.addEventListener('blur', () => {
      const v = parseFloat(el.textContent);
      if (Number.isFinite(v)) apply(v); else push(false);
    });
  };
  editNum(numH, (v) => { h = ((v % 360) + 360) % 360; push(); });
  editNum(numS, (v) => { s = Math.max(0, Math.min(100, v)); push(); });
  editNum(numL, (v) => { l = Math.max(0, Math.min(100, v)); push(); });

  hexIn.addEventListener('input', () => {
    const p = parseAnyColor(hexIn.value);
    if (p) { [h, s, l] = rgbToHsl(...p); push(false); }
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
      if (p) { [h, s, l] = rgbToHsl(...p); push(); }
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
  push();

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
