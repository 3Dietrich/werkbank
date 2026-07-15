/**
 * werkbank.js – baut die Demo-Seite auf.
 *
 * Bewusst dünn: die Werkbank ist eine SAMMLUNG zum Rüberkopieren, kein eigenes Produkt.
 * Alles Interessante steckt in lib/ (unverändert aus teslacoil). Diese Datei stellt die
 * Bausteine nur hin und hängt sie an den MiniState – sie ist selbst NICHT zum Kopieren
 * gedacht und darf deshalb kurz und schlicht bleiben.
 */
import { Knob } from './lib/Knob.js';
import { KnobMetaEditor } from './lib/KnobMetaEditor.js';
import { ElementSettings } from './lib/ElementSettings.js';
import { StepSeqUI } from './lib/StepSeqUI.js';
import { MiniState } from './lib/MiniState.js';
import { targetKind, globalKeyOk, arrowKeyOk } from './lib/keyRoute.js';

const state = new MiniState({
    ampSeqLen: 8,
    ampSeqSteps: [1, 0, 0.6, 0, 1, 0.3, 0, 0.8],
    seqStyles: { amp: { w: 270, h: 64, bg: '#0e1116', col: 'rgba(255,159,90,1)' } },
});

const metaEditor = new KnobMetaEditor(state);
const elemSettings = new ElementSettings(state);

// ── Knobs / Fader ──────────────────────────────────────────────────────────────
// Absichtlich EINE Definition pro Gestalt aus derselben Klasse – das ist die Aussage
// des Bausteins: Knob und Fader sind nicht zwei Dinge.
const DEMO_KNOBS = [
    { key: 'cutoff', label: 'Cutoff', min: 20, max: 18000, curve: 'log', unit: 'Hz', decimals: 0, value: 800 },
    { key: 'reso', label: 'Reso', min: 0.1, max: 20, curve: 'log', unit: 'Q', decimals: 1, value: 2 },
    { key: 'level', label: 'Level', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2, value: 0.7,
      shape: 'faderVert', faderLen: 110 },
    { key: 'mix', label: 'Dry/Wet', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2, value: 0.35,
      shape: 'faderHoriz', faderLen: 140 },
];

const knobRow = document.querySelector('#knobs');
for (const def of DEMO_KNOBS) {
    // Gespeicherte Optik gewinnt über die Demo-Vorgabe → Änderungen überleben den Reload.
    const saved = (state.get('knobMeta') || {})[def.key] || {};
    const knob = new Knob({
        id: 'knob_' + def.key,
        ...def,
        ...saved,
        onChange: (v) => state.set('val_' + def.key, v),
    });
    knob._defaultMeta = knob.getMeta();
    knob.element.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation(); metaEditor.open(knob);
    });
    knobRow.appendChild(knob.element);
}
// Meta-Änderungen sichern (der Editor meldet sie über onApply).
metaEditor.onApply = (k, meta) => {
    const all = { ...(state.get('knobMeta') || {}) };
    all[k.id.replace(/^knob_/, '')] = meta;
    state.set('knobMeta', all);
};

// ── Select / Toggle / Readout ──────────────────────────────────────────────────
const ctrlRow = document.querySelector('#ctrls');

/** Ein Control als style-bar registrieren – wie in teslacoils app.js (registerCtrlStyle). */
function wireSettings(id, type, el, applyStyle, defLabel) {
    const saved = (state.get('ctrlStyles') || {})[id];
    if (saved) applyStyle(saved);
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        elemSettings.open({ id, type, el, defLabel, applyStyle });
    });
}
elemSettings.onApply = (id, style) => {
    const cur = { ...(state.get('ctrlStyles') || {}) };
    if (style && Object.keys(style).length) cur[id] = style; else delete cur[id];
    state.set('ctrlStyles', cur);
};

{   // Select
    const wrap = document.createElement('label'); wrap.className = 'select-field';
    const span = document.createElement('span'); span.textContent = 'Filter-Typ';
    const sel = document.createElement('select');
    ['LP', 'HP', 'BP', 'Ladder-org'].forEach((o) => {
        const opt = document.createElement('option'); opt.value = opt.textContent = o; sel.appendChild(opt);
    });
    wrap.append(span, sel); ctrlRow.appendChild(wrap);
    wireSettings('s:filterType', 'select', wrap, (s) => {
        span.textContent = s.label || 'Filter-Typ';
        span.style.display = s.labelOn === false ? 'none' : '';
        sel.style.background = s.bg || '';
        sel.style.color = s.fg || '';
        sel.style.fontSize = s.size ? s.size + 'px' : '';
        sel.style.width = s.boxSize ? s.boxSize + 'px' : '';
    }, 'Filter-Typ');
}
{   // Toggle
    const wrap = document.createElement('label'); wrap.className = 'select-field toggle-field';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = true;
    const span = document.createElement('span'); span.textContent = 'aktiv';
    wrap.append(chk, span); ctrlRow.appendChild(wrap);
    wireSettings('t:active', 'toggle', wrap, (s) => {
        span.textContent = s.label || 'aktiv';
        wrap.classList.remove('tgl-label-top', 'tgl-label-bottom', 'tgl-label-left', 'tgl-label-right');
        if (s.labelPos) wrap.classList.add('tgl-label-' + s.labelPos);
    }, 'aktiv');
}
{   // Readout
    const out = document.createElement('div'); out.className = 'base-readout';
    ctrlRow.appendChild(out);
    let hz = 110;
    setInterval(() => { hz = 100 + Math.round(Math.sin(Date.now() / 900) * 40); out.textContent = hz + ' Hz'; }, 80);
    wireSettings('u:readout', 'readout', out, (s) => {
        out.style.fontSize = s.fontSize ? s.fontSize + 'px' : '';
        out.style.width = s.boxSize ? s.boxSize + 'px' : '';
        out.style.color = s.fg || '';
    }, 'Readout');
}

// ── Step-Sequenzer ─────────────────────────────────────────────────────────────
// StepSeqUI braucht eine Engine, die ihm sagt, wo der Abspielkopf steht:
// { running, seqPos(which), resetSeq(which) }. Das ist seine einzige Nahtstelle nach
// unten – in teslacoil ist das die TeslaEngine, hier eine Attrappe mit laufendem Kopf.
// Genau diese Naht soll die Werkbank zeigen: wer den Baustein kopiert, muss NUR diese
// drei Dinge liefern, nicht die halbe Engine.
const fakeEngine = {
    running: true,
    _t0: performance.now(),
    seqPos(which) {
        const len = Math.max(1, state.get(which + 'SeqLen') | 0);
        return Math.floor((performance.now() - this._t0) / 250) % len;   // ~4 Steps/s
    },
    resetSeq() { this._t0 = performance.now(); },
};
const seqUI = new StepSeqUI(state, fakeEngine, 'amp');
document.querySelector('#seq').appendChild(seqUI.element);
// Der Abspielkopf zeichnet sich nicht von allein – in teslacoil tickt ihn der Render-Loop.
(function tick() { seqUI.tick(); requestAnimationFrame(tick); })();

// ── Tasten-Regel: live zeigen, wem die Taste gehört ────────────────────────────
// Der Baustein selbst entscheidet nichts über die Tasten – er BEANTWORTET nur die Frage.
// Genau das macht die Sonde hier sichtbar, statt es zu behaupten.
const verdict = document.querySelector('#verdict');
window.addEventListener('keydown', (e) => {
    const keys = { ' ': 'Space', 'e': "'e'", 'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→' };
    const name = keys[e.key];
    if (!name) return;
    const kind = targetKind(e.target);
    const arrow = name.length === 1;
    const mine = arrow ? arrowKeyOk(e.target) : globalKeyOk(e.target);
    const tag = (e.target.tagName || 'BODY').toLowerCase() + (e.target.type ? `[${e.target.type}]` : '');
    verdict.innerHTML = `${name} auf &lt;${tag}&gt; = '${kind}'<br>→ <span class="${mine ? 'wb-global' : 'wb-local'}">`
        + `${mine ? 'GLOBAL (Shortcut greift)' : 'LOKAL (Element behält sie)'}</span>`;
});

document.querySelector('#reset').addEventListener('click', () => {
    MiniState.reset(); location.reload();
});
