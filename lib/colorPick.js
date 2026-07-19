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
 *   [ ● Farbpunkt ][ Hue-Regenbogen, gleiche Höhe ]
 *   [ ⧉ Copy ][ #Hex-Eingabe ]
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

let _openPop = null;   // es ist immer höchstens EIN Farb-Popover offen

function closePicker() {
  if (_openPop) { _openPop.el.remove(); _openPop = null; }
}

function openPicker(input) {
  closePicker();
  const rgb = hexToRgb(input.value) || [90, 209, 255];
  let [h, s, v] = rgbToHsv(...rgb);

  const pop = document.createElement('div'); pop.className = 'cp-pop';
  pop.innerHTML = `
    <canvas class="cp-sv" width="200" height="56" title="Farbton mischen (Sättigung ↔ · Helligkeit ↕)"></canvas>
    <div class="cp-hue-row">
      <span class="cp-dot" title="Aktuelle Farbe"></span>
      <canvas class="cp-hue" width="176" height="16" title="Grundfarbe wählen"></canvas>
    </div>
    <div class="cp-hex-row">
      <button type="button" class="cp-copy" title="Hex-Wert kopieren">⧉</button>
      <input type="text" class="cp-hex" maxlength="7" spellcheck="false" title="Hex-Wert (#rrggbb) — direkt editierbar" />
    </div>
  `;
  const sv = pop.querySelector('.cp-sv'), hue = pop.querySelector('.cp-hue');
  const dot = pop.querySelector('.cp-dot'), hexIn = pop.querySelector('.cp-hex');

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
  const push = (updateHexField = true) => {
    const hex = hexNow();
    dot.style.background = hex;
    if (updateHexField) hexIn.value = hex;
    input.value = hex;
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
    const p = hexToRgb(hexIn.value);
    if (p) { [h, s, v] = rgbToHsv(...p); push(false); }
  });
  hexIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') closePicker(); });
  pop.querySelector('.cp-copy').addEventListener('click', () => {
    const hex = hexNow();
    if (navigator.clipboard) navigator.clipboard.writeText(hex).catch(() => {});
    else { hexIn.select(); document.execCommand('copy'); }
  });

  document.body.appendChild(pop);
  const r = input.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  _openPop = { el: pop, input };
  hexIn.value = hexNow(); dot.style.background = hexNow();
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
