/**
 * MasterVolume.js – der Master-Fader im Header (@dpa 20260722, ddw.md: „wir brauchen einen
 * Master Volume ... Fader soll waagerecht im Header sein").
 *
 * Kein GroupHost-Control (der Header ist keine Gruppe) — trotzdem derselbe echte `Knob`
 * (waagerechte Fader-Gestalt) wie überall sonst, mit einer eigenen, kleinen KnobMetaEditor-
 * Instanz für die Rechtsklick-Settings (genau das Muster aus GroupHost.js `makeKnob`, hier
 * von Hand nachgebaut, weil kein `mountGroups()` drumherum existiert). Damit sind „Default
 * (Doppelklick)", „dB-Bereich (min/max)", „Fader-Länge", „Farben", „Value sichtbar" und
 * „Größe" bereits die STANDARD-Knob-Settings — kein eigener Code nötig.
 *
 * Nur der Limiter (IO + Attack + Release) ist DSP-spezifisch und kein Knob-Feld: ein
 * eigener kleiner Toggle-Button daneben, dessen Rechtsklick-Popover Attack/Release zeigt.
 */
import { Knob } from './Knob.js';
import { KnobMetaEditor } from './KnobMetaEditor.js';
import { ensureAudio, setMasterDb, setLimiterOn, setLimiterAttack, setLimiterRelease, setWaveshaperOn } from './audioBus.js';
import { hint } from './i18n.js';

export const masterVolumeDefaults = {
    masterDb: 0,
    limiterOn: true,
    limiterAttackMs: 0.5,
    limiterReleaseMs: 250,
    // WaveShaper-Soft-Clip (@dpa ddw.md 20260802) – Sicherheitsnetz NACH dem Limiter, Default
    // AUS (Feature ändert bestehenden Klang nicht, bis @dpa es bewusst einschaltet).
    waveshaperOn: false,
    // Optik des Lim-Buttons (ddw.md 20260802: „BGoff, BGon … VG/schrift") — dasselbe
    // Feldschema wie jeder GroupHost-Button (bg/bgOn/fg/size, s. ElementSettings.js
    // _fieldsFor('button')), hier aber von Hand angewendet: der Lim-Button hängt an
    // keiner GroupHost-Instanz (Header-Element, kein Gruppen-Control), darum kein
    // automatisches registerCtrlStyle.
    limStyle: {},
    knobMeta: {},
};

export function createMasterVolume(state) {
    const wrap = document.createElement('div'); wrap.className = 'mv-wrap';

    const saved = (state.get('knobMeta') || {}).vol || {};
    const knob = new Knob({
        id: 'knob_vol',
        label: 'Vol', min: -60, max: 6, step: 0.1, curve: 'linear',
        unit: ' dB', decimals: 1,
        shape: 'faderHoriz', faderLen: 120,
        defaultValue: 0,   // Doppelklick → Unity (@dpa: „Default (doppelclick)")
        value: state.get('masterDb') ?? 0,
        onChange: (db) => { state.set('masterDb', db); setMasterDb(db); },
        ...saved,          // gespeicherte Optik gewinnt (Bereich/Länge/Farben/Größe/Value)
    });
    knob.element.dataset.ctrl = 'k:masterVol';
    hint(knob.element, 'Master-Lautstärke (dB) — Ziehen ändert, Doppelklick setzt auf 0dB zurück. Rechtsklick = Settings.');
    wrap.appendChild(knob.element);

    const metaEditor = new KnobMetaEditor(state);
    metaEditor.onApply = (k) => {
        const all = { ...(state.get('knobMeta') || {}) };
        all.vol = k.getMeta();
        state.set('knobMeta', all);
    };
    knob.element.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        metaEditor.open(knob);
    });

    // Limiter: eigener Toggle-Button (IO), Attack/Release + Optik (BGoff/BGon/VG/Schrift)
    // in seinem Rechtsklick-Popover (@dpa: „Limiter mit IO Schalter, Attack ... und
    // release ..."; ddw.md 20260802: „den Lim Button neben Attack und Release [...]:
    // BGoff, BGon [...] auch VG/schrift" — Optik greift genau wie bei jedem anderen
    // Button: bg/fg im AUS-Zustand, bgOn im AN-Zustand).
    const limBtn = document.createElement('button');
    limBtn.type = 'button'; limBtn.className = 'pb-btn ctrl-btn mv-lim';
    const paintLim = () => {
        const on = !!state.get('limiterOn');
        const st = state.get('limStyle') || {};
        limBtn.classList.toggle('ctrl-on', on);
        limBtn.style.background = on ? (st.bgOn || '') : (st.bg || '');
        limBtn.style.color = st.fg || '';
        limBtn.style.fontSize = st.size ? st.size + 'px' : '';
    };
    limBtn.textContent = 'Lim';
    hint(limBtn, 'Limiter — begrenzt den Ausgang hart bei 0dB, verhindert Übersteuern. Rechtsklick: Attack/Release/Optik.');
    limBtn.addEventListener('click', () => {
        const on = !state.get('limiterOn');
        state.set('limiterOn', on); setLimiterOn(on); paintLim();
    });
    wrap.appendChild(limBtn);
    paintLim();

    // WaveShaper-Soft-Clip: einfacher Toggle-Button neben dem Lim-Button (@dpa ddw.md
    // 20260802: „WaveShaperNode. Klingt interessant, bau es gerne ein mit ein/aus-Schalter").
    // Optik-Popover ergänzt (@dpa ddw.md 20260802 Punkt 7: „alle header Buttons sollen Button
    // Settings ... haben") — dieselben vier Felder wie beim Lim-Button, s. paintWs/wsStyle.
    const wsBtn = document.createElement('button');
    wsBtn.type = 'button'; wsBtn.className = 'pb-btn ctrl-btn mv-ws';
    const paintWs = () => {
        const on = !!state.get('waveshaperOn');
        const st = state.get('wsStyle') || {};
        wsBtn.classList.toggle('ctrl-on', on);
        wsBtn.style.background = on ? (st.bgOn || '') : (st.bg || '');
        wsBtn.style.color = st.fg || '';
        wsBtn.style.fontSize = st.size ? st.size + 'px' : '';
    };
    wsBtn.textContent = 'WS';
    hint(wsBtn, 'WaveShaper-Soft-Clip — zusätzliches, weiches Sicherheitsnetz NACH dem Limiter (tanh-Sättigung statt harter Begrenzung). Rechtsklick: Optik.');
    wsBtn.addEventListener('click', () => {
        const on = !state.get('waveshaperOn');
        state.set('waveshaperOn', on); setWaveshaperOn(on); paintWs();
    });
    wrap.appendChild(wsBtn);
    paintWs();

    // Generisches Optik-Popover (bg/bgOn/fg/size) für einen Header-Button OHNE GroupHost-
    // Anbindung (@dpa ddw.md 20260802 Punkt 7) — Lim und WS teilen sich dieselben vier
    // Felder, `extraHtml`/`wireExtra` lassen Lim zusätzlich seine Attack/Release-Zeilen VOR
    // der Optik einhängen, ohne dass WS sie mitbekommt. Persistiert unter `state[styleKey]`
    // (kein ctrlStyles-Eintrag — dieselbe Begründung wie vorher: kein GroupHost drumherum).
    function makeOptikPopover(btn, styleKey, repaint, { extraHtml = '', wireExtra = () => {} } = {}) {
        let pop = null;
        const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', onOut, true); } };
        const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) closePop(); };
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (pop) { closePop(); return; }
            pop = document.createElement('div'); pop.className = 'mv-lim-pop';
            pop.innerHTML = extraHtml + `
              <div class="mv-lim-sec">Optik</div>
              <div class="mv-lim-row"><label>BGoff</label><input type="color" class="mv-lim-bg" /></div>
              <div class="mv-lim-row"><label>BGon</label><input type="color" class="mv-lim-bgon" /></div>
              <div class="mv-lim-row"><label>VG</label><input type="color" class="mv-lim-fg" /></div>
              <div class="mv-lim-row"><label>Schrift</label><input type="number" class="mv-lim-size" min="0" max="1000000" step="1" /><span>px</span></div>
            `;
            // Die Farb-Inputs zeigen beim Öffnen einen neutralen Startwert (Schwarz/Weiß),
            // OHNE dass das schon eine Übernahme wäre — erst ein echtes Ändern (input-Event)
            // schreibt in den Style, exakt wie „kein bg gesetzt" = leerer String in paint().
            const st = state.get(styleKey) || {};
            const bgIn = pop.querySelector('.mv-lim-bg'), bgOnIn = pop.querySelector('.mv-lim-bgon'),
                  fgIn = pop.querySelector('.mv-lim-fg'), sizeIn = pop.querySelector('.mv-lim-size');
            bgIn.value = st.bg || '#000000'; bgOnIn.value = st.bgOn || '#000000'; fgIn.value = st.fg || '#ffffff';
            sizeIn.value = st.size || '';
            const setStyle = (patch) => { state.set(styleKey, { ...(state.get(styleKey) || {}), ...patch }); repaint(); };
            bgIn.addEventListener('input', () => setStyle({ bg: bgIn.value }));
            bgOnIn.addEventListener('input', () => setStyle({ bgOn: bgOnIn.value }));
            fgIn.addEventListener('input', () => setStyle({ fg: fgIn.value }));
            // size:0 ist ein legitimer Wert (limits ≠ default) — nicht nur bei size>0 schreiben.
            sizeIn.addEventListener('input', () => { const v = parseInt(sizeIn.value, 10); setStyle({ size: Number.isFinite(v) ? v : undefined }); });
            wireExtra(pop);
            pop.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
            document.body.appendChild(pop);
            const r = btn.getBoundingClientRect();
            pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
            pop.style.top = (r.bottom + 4) + 'px';
            setTimeout(() => document.addEventListener('mousedown', onOut, true), 0);
        });
    }
    makeOptikPopover(limBtn, 'limStyle', paintLim, {
        extraHtml: '<div class="mv-lim-sec">Limiter</div>'
            + '<div class="mv-lim-row"><label>Attack</label><input type="number" class="mv-lim-a" min="0" max="50" step="0.1" /><span>ms</span></div>'
            + '<div class="mv-lim-row"><label>Release</label><input type="number" class="mv-lim-r" min="0" max="2000" step="1" /><span>ms</span></div>',
        wireExtra: (pop) => {
            const aIn = pop.querySelector('.mv-lim-a'), rIn = pop.querySelector('.mv-lim-r');
            aIn.value = state.get('limiterAttackMs') ?? 0.5;
            rIn.value = state.get('limiterReleaseMs') ?? 250;
            aIn.addEventListener('input', () => { const v = parseFloat(aIn.value); if (Number.isFinite(v)) { state.set('limiterAttackMs', v); setLimiterAttack(v); } });
            rIn.addEventListener('input', () => { const v = parseFloat(rIn.value); if (Number.isFinite(v)) { state.set('limiterReleaseMs', v); setLimiterRelease(v); } });
        },
    });
    makeOptikPopover(wsBtn, 'wsStyle', paintWs);

    // Audio früh anlegen (kein Nutzer-Geste-Zwang beim reinen Erzeugen) — sonst würden
    // Lautstärke/Limiter erst beim ersten Ton eines Instruments mit HART VERDRAHTETEN
    // Defaults entstehen, statt mit den hier gespeicherten Werten.
    ensureAudio();
    setMasterDb(knob.value);
    setLimiterOn(state.get('limiterOn') !== false);
    setLimiterAttack(state.get('limiterAttackMs') ?? 0.5);
    setLimiterRelease(state.get('limiterReleaseMs') ?? 250);
    setWaveshaperOn(!!state.get('waveshaperOn'));

    // limBtn/wsBtn mit herausgereicht (@dpa ddw.md 20260802 Punkt 7): Key-/MIDI-Learn braucht
    // das jeweilige Ensemble-KeyMidi (existiert erst NACH createMasterVolume(), s. werkbank.js/
    // werkbank-leer.js) — die Registrierung passiert darum dort, nicht hier.
    return { element: wrap, knob, limBtn, wsBtn };
}
