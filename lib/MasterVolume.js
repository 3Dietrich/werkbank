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
import { ensureAudio, setMasterDb, setLimiterOn, setLimiterAttack, setLimiterRelease } from './audioBus.js';
import { hint } from './i18n.js';

export const masterVolumeDefaults = {
    masterDb: 0,
    limiterOn: true,
    limiterAttackMs: 0.5,
    limiterReleaseMs: 250,
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

    // Attack/Release-Popover (klein, eigenständig — kein generisches Settings-Feld dafür).
    let pop = null;
    const closePop = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', onOut, true); } };
    const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== limBtn) closePop(); };
    limBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (pop) { closePop(); return; }
        pop = document.createElement('div'); pop.className = 'mv-lim-pop';
        pop.innerHTML = `
          <div class="mv-lim-sec">Limiter</div>
          <div class="mv-lim-row"><label>Attack</label><input type="number" class="mv-lim-a" min="0" max="50" step="0.1" /><span>ms</span></div>
          <div class="mv-lim-row"><label>Release</label><input type="number" class="mv-lim-r" min="0" max="2000" step="1" /><span>ms</span></div>
          <div class="mv-lim-sec">Optik</div>
          <div class="mv-lim-row"><label>BGoff</label><input type="color" class="mv-lim-bg" /></div>
          <div class="mv-lim-row"><label>BGon</label><input type="color" class="mv-lim-bgon" /></div>
          <div class="mv-lim-row"><label>VG</label><input type="color" class="mv-lim-fg" /></div>
          <div class="mv-lim-row"><label>Schrift</label><input type="number" class="mv-lim-size" min="6" max="1000000" step="1" /><span>px</span></div>
        `;
        const aIn = pop.querySelector('.mv-lim-a'), rIn = pop.querySelector('.mv-lim-r');
        aIn.value = state.get('limiterAttackMs') ?? 0.5;
        rIn.value = state.get('limiterReleaseMs') ?? 250;
        aIn.addEventListener('input', () => { const v = parseFloat(aIn.value); if (Number.isFinite(v)) { state.set('limiterAttackMs', v); setLimiterAttack(v); } });
        rIn.addEventListener('input', () => { const v = parseFloat(rIn.value); if (Number.isFinite(v)) { state.set('limiterReleaseMs', v); setLimiterRelease(v); } });

        // Optik: dieselben vier Felder wie jeder GroupHost-Button (bg/bgOn/fg/size), hier
        // von Hand persistiert unter masterState.limStyle (kein ctrlStyles-Eintrag, s.o.).
        // Die Farb-Inputs zeigen beim Öffnen einen neutralen Startwert (Schwarz/Weiß), OHNE
        // dass das schon eine Übernahme wäre — erst ein echtes Ändern (input-Event) schreibt
        // in limStyle, exakt wie „kein bg gesetzt" = leerer String in paintLim().
        const st = state.get('limStyle') || {};
        const bgIn = pop.querySelector('.mv-lim-bg'), bgOnIn = pop.querySelector('.mv-lim-bgon'),
              fgIn = pop.querySelector('.mv-lim-fg'), sizeIn = pop.querySelector('.mv-lim-size');
        bgIn.value = st.bg || '#000000'; bgOnIn.value = st.bgOn || '#000000'; fgIn.value = st.fg || '#ffffff';
        sizeIn.value = st.size || '';
        const setStyle = (patch) => { state.set('limStyle', { ...(state.get('limStyle') || {}), ...patch }); paintLim(); };
        bgIn.addEventListener('input', () => setStyle({ bg: bgIn.value }));
        bgOnIn.addEventListener('input', () => setStyle({ bgOn: bgOnIn.value }));
        fgIn.addEventListener('input', () => setStyle({ fg: fgIn.value }));
        sizeIn.addEventListener('input', () => { const v = parseInt(sizeIn.value, 10); setStyle({ size: (Number.isFinite(v) && v > 0) ? v : undefined }); });

        [aIn, rIn, sizeIn].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
        document.body.appendChild(pop);
        const r = limBtn.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (r.bottom + 4) + 'px';
        setTimeout(() => document.addEventListener('mousedown', onOut, true), 0);
    });

    // Audio früh anlegen (kein Nutzer-Geste-Zwang beim reinen Erzeugen) — sonst würden
    // Lautstärke/Limiter erst beim ersten Ton eines Instruments mit HART VERDRAHTETEN
    // Defaults entstehen, statt mit den hier gespeicherten Werten.
    ensureAudio();
    setMasterDb(knob.value);
    setLimiterOn(state.get('limiterOn') !== false);
    setLimiterAttack(state.get('limiterAttackMs') ?? 0.5);
    setLimiterRelease(state.get('limiterReleaseMs') ?? 250);

    return { element: wrap, knob };
}
