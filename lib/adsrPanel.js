/**
 * adsrPanel.js — gemeinsame ADSR-Panel-Bausteine für GroupHost-basierte ISMs (@dpa 20260803).
 *
 * EINE Quelle für alles, was eine ADSR-artige Gruppe braucht: Panel-Knobs/-Buttons,
 * Settings (Rechtsklick-Panel: aktiv/Kurven/Skew/Nullpunkt), Defaults. Vorher lebten diese
 * Bausteine dupliziert in lib/polysynth/defs.js (ADSR_KNOBS/…) UND als Kopie im
 * overcord/werkbank.js-Settings-Hook (_groupKindSettings.ADSR) — jedes neue ISM mit eigener
 * ADSR (z.B. lib/adsrOsc/) musste sie sich neu zusammenkopieren. Genau DAS ist beim Bau von
 * ADSR+OSZ passiert (eine fremde KI hat die Werte-Knobs übernommen, aber die
 * Settings/groupKind/Hook-Kopplung vergessen bzw. dupliziert — s. docs/CONTROLS.md „Rezept:
 * Klang-Baustein bauen"). Jetzt: EIN Import für Panel-Defs + EIN generischer Settings-Hook.
 *
 * GroupHost ruft groupKindSettings-Hooks mit `sfx` als LAUFZEIT-Argument auf (GroupHost.js:
 * `_hook(name, pop, st, row, groupSuffixOf.get(name) || '')`, gespeist aus dem
 * `instanceSuffix` der Gruppe) — ein einziger Hook bedient darum 1..N Envelope-Instanzen,
 * ganz ohne Copy-Paste pro Instanz.
 *
 * Verwendung für EIN festes ADSR (kein +/-, z.B. Amp-Env eines schlanken ISM):
 *   GROUPS: [ adsrGroupDef('Amp-ADSR', '') ]
 *   DEFAULTS: { ...adsrDefaultsFor('') }
 *   BUTTONS: { ...adsrButtons(onAction) }   // Keys ohne sfx, GroupHost hängt sfx selbst an
 *   groupKindSettings: (kind) => kind === 'ADSR' ? createAdsrSettingsHook(state) : undefined
 *
 * Für MEHRERE feste Envelopes (z.B. Amp+Pitch wie lib/adsrOsc/) denselben Aufbau pro
 * Envelope mit eigenem sfx wiederholen — s. lib/adsrOsc/defs.js als Beispiel.
 *
 * Für eine VERVIELFÄLTIGBARE Reihe (User klickt +/-, 1..N Instanzen zur Laufzeit) NICHT
 * diese Datei direkt für die Instanzverwaltung nutzen — dafür ist createEnvManager() in
 * lib/polysynth/multiEnv.js gebaut (Routing-Registrierung, Output-PickMenu, +/--Buttons).
 * multiEnv.js bezieht seine Panel-/Settings-Konstanten seinerseits aus DIESER Datei.
 */
import { hint } from './i18n.js';

/** Panel-Knobs (Werte-Regler). Keys OHNE sfx — Aufrufer hängt sfx selbst an (s. adsrGroupDef). */
export function adsrKnobs() {
    return {
        adsrA:       { label: 'A', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Attack-Zeit (s). 0 = senkrechter Einsatz.' },
        adsrD:       { label: 'D', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Decay-Zeit (s) vom Peak zum Sustain-Pegel.' },
        adsrS:       { label: 'S', min: 0, max: 1, curve: 'linear', unit: '', decimals: 2,
                       title: 'Sustain-Pegel — Anteil vom Peak.' },
        adsrR:       { label: 'R', min: 0, max: 1000000, curve: 'linear', unit: ' s', decimals: 3,
                       title: 'Release-Zeit (s) nach Gate-Ende.' },
        // Kein Deckel bei 1 (@dpa 20260727_135331: "Peak ist noch gelimitiert ... DAS IST
        // FALSCH! Und soll so nicht mehr verbaut werden!!") — großzügiger Maximalwert statt
        // striktem Limit. curve:'log' verteilt den Dreh-Weg gleichmäßiger über
        // Größenordnungen (dd.md 20260802, "Mittenstellung ist 500k?"), OHNE die Obergrenze
        // (1000000) zu senken.
        adsrPeak:    { label: 'Peak', min: 0.01, max: 1000000, curve: 'log', unit: '', decimals: 2,
                       title: 'Maximaler Env-Wert (0.01–1 üblich, nach oben absichtlich offen).' },
        // Len als ZWEI getrennte Knobs (@dpa 20260726: „zwei Controls für die Zeitlänge, beat
        // und time") — EIN Konzept für Trig-Ende UND (bei Gate+fest) Auto-Close (@dpa
        // 20260727-Korrektur, s. adsrLenFest unten).
        adsrLenMs:   { label: 'Len', min: 0, max: 1000000, curve: 'linear', unit: ' ms', decimals: 0,
                       title: 'Länge in Millisekunden (0 = 1 Sample) — Trig-Ende, oder bei Gate+fest die Auto-Close-Zeit.' },
        adsrLenBeat: { label: 'Len', min: 0, max: 1000000, curve: 'linear', unit: ' beat', decimals: 2, step: 0.25,
                       title: 'Länge in Beats (0 = 1 Sample) — Trig-Ende, oder bei Gate+fest die Auto-Close-Zeit.' },
    };
}

/** Panel-Buttons (Gate + Fest-Umschalter). Keys OHNE sfx. `onAction(key, phase)` bekommt den
 *  ECHTEN, indizierten Key ('adsrGate_p', 'adsrGate_0', …) von GroupHost übergeben. */
export function adsrButtons(onAction) {
    return {
        adsrGate: { label: '⏵', mode: 'trigger',
                    title: 'Env manuell auslösen (Trig) bzw. Gate an/aus (Gate-Modus).',
                    onClick: (key, phase) => onAction(key, phase) },
        // Len: fest/offen (@dpa ddw.md 20260726/20260727) — nur bei Modus=Gate sichtbar/
        // wirksam (Trig ist per Definition immer 'fest'). AN = Len-Knob schließt automatisch
        // nach fester Zeit. AUS = Gate bleibt live an, bis ein echtes Gate-Off eintrifft.
        adsrLenFest: { label: 'Fest', mode: 'toggle',
                       title: 'Nur bei Modus=Gate: AN = schließt automatisch nach Len (ms/Beat). AUS (offen) = bleibt an, bis ein echtes Gate-Off kommt.',
                       onClick: (key) => onAction(key) },
    };
}

// Settings (Rechtsklick-Gruppen-Panel via groupKindSettings-Hook, KEINE Panel-Controls).
// Die Engine liest die Werte direkt aus dem State — Keys ohne sfx, s. createAdsrSettingsHook.
export const ADSR_SETTINGS_TOGGLES = {
    adsrAOn:     { label: 'A aktiv', title: 'Attack aktiv.' },
    adsrDOn:     { label: 'D aktiv', title: 'Decay aktiv.' },
    adsrSOn:     { label: 'S aktiv', title: 'Sustain aktiv.' },
    adsrROn:     { label: 'R aktiv', title: 'Release aktiv.' },
    adsrInv:     { label: 'Inv', title: 'Invertiert — Env läuft negativ (0-basiert, Ende immer 0).' },
    adsrVerlauf: { label: 'Verlauf', title: 'AN: letzter Wert wird übernommen, Attack darauf angesetzt. AUS: Trigger startet von vorne mit Outin-Fade.' },
};

export const ADSR_SETTINGS_SELECTS = {
    adsrACurve:  { label: 'A-Kurve', options: ['lin', 'log'] },
    adsrDCurve:  { label: 'D-Kurve', options: ['lin', 'log'] },
    adsrRCurve:  { label: 'R-Kurve', options: ['lin', 'log'] },
    adsrTrigMode: { label: 'Modus', options: ['trig', 'gate'] },
    adsrLenUnit: { label: 'Len-Einheit', options: ['ms', 'beats'] },
};

// Skew-Knobs (im Rechtsklick-Panel als Zahlenfelder, nicht als Panel-Knobs). Max großzügig
// statt strikt bei 100 gedeckelt (@dpa 20260727_135331, dieselbe "keine Reflex-Limits"-Regel
// wie bei Peak — s. lib/polysynth/envCore.js segmentCurve()-Kommentar).
export const ADSR_SETTINGS_SKEWS = {
    adsrASkew:   { label: 'A-Skew', min: 0.01, max: 1000000, default: 1 },
    adsrDSkew:   { label: 'D-Skew', min: 0.01, max: 1000000, default: 1 },
    adsrRSkew:   { label: 'R-Skew', min: 0.01, max: 1000000, default: 1 },
};

// Nullpunktversatz (@dpa ddw.md 20260727, „Bug2"): die Env kreist immer um IHREN eigenen
// Nullpunkt (Ende der Kurve = 0). Ein Ziel, das um einen ANDEREN Wert herum arbeitet (z.B.
// Frequenz-Multiplikator, Ruhepunkt = 1) braucht einen einstellbaren Basis-Versatz AN DER
// ENV SELBST. Bewusst ein `Setting`, kein Panel-Knob (@dpa: „was man später vielleicht auf
// das Panel schalten kann, siehe todos").
export const ADSR_SETTINGS_NUMS = {
    adsrNullpunkt: { label: 'Nullpunktversatz', min: -1000000, max: 1000000, default: 0 },
};

export const ADSR_DEFAULTS = {
    adsrA: 0.01, adsrD: 0.15, adsrS: 0.7, adsrR: 0.3,
    adsrPeak: 1,
    adsrAOn: true, adsrDOn: true, adsrSOn: true, adsrROn: true,
    adsrInv: false, adsrVerlauf: false,
    adsrACurve: 'lin', adsrDCurve: 'log', adsrRCurve: 'log',
    adsrASkew: 1, adsrDSkew: 1, adsrRSkew: 1,
    adsrTrigMode: 'trig', adsrLenMs: 100, adsrLenBeat: 0, adsrLenUnit: 'ms',
    adsrLenFest: true,
    adsrNullpunkt: 0,
    adsrOutput: '',
};

/** GroupHost-Gruppenobjekt für EINE ADSR-Instanz (fest oder vervielfältigt) — Knobs/Buttons
 *  schon mit `sfx` versehen, `groupKind:'ADSR'` + `instanceSuffix` gesetzt. GroupHost ruft
 *  darüber automatisch den passenden Settings-Hook mit dem richtigen sfx auf (s. Dateikopf). */
export function adsrGroupDef(name, sfx = '') {
    return {
        name,
        groupKind: 'ADSR',
        instanceSuffix: sfx,
        knobs: Object.keys(adsrKnobs()).map((k) => k + sfx),
        buttons: ['adsrGate', 'adsrLenFest'].map((k) => k + sfx),
    };
}

/** DEFAULTS für eine Instanz, Keys mit `sfx` versehen — zum Spreaden in defs.DEFAULTS. */
export function adsrDefaultsFor(sfx = '') {
    const out = {};
    for (const [k, v] of Object.entries(ADSR_DEFAULTS)) out[k + sfx] = v;
    return out;
}

/**
 * Generischer Settings-Hook fürs Gruppen-Rechtsklick-Panel (groupKindSettings-Hook, s.
 * GroupHost.js). EIN Hook bedient beliebig viele Instanzen — GroupHost liefert `sfx` pro
 * Aufruf selbst (s. Dateikopf), keine Instanz-spezifische Kopie nötig.
 *
 * `opts.onCopy`/`opts.onDelete` (optional, je `(sfx) => void`): NUR für ECHTE
 * vervielfältigbare Reihen (z.B. Multi-ADSR in multiEnv.js) — rendert dann zusätzlich
 * +➚/🚮-Buttons. Ein festes Einzel- oder Mehrfach-ADSR (z.B. lib/adsrOsc/: Amp+Pitch fest,
 * kein +/-) lässt beide weg — die Buttons erscheinen dann gar nicht erst (s.
 * lib/polysynth/multiEnv.js buildEnv() vs. lib/adsrOsc/defs.js für den Unterschied).
 */
export function createAdsrSettingsHook(state, opts = {}) {
    const { onCopy, onDelete } = opts;
    return (name, pop, st, row, sfx) => {
        const get = (k) => state.get(k + sfx);
        const set = (k, v) => state.set(k + sfx, v);

        const sep = document.createElement('div'); sep.className = 'gs-sep'; pop.appendChild(sep);

        // ── Compact-Grid: 2 Spalten (Toggles links, Selects rechts) ──────────
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; margin:8px 0;';

        const toggleCol = document.createElement('div');
        for (const [key, cfg] of Object.entries(ADSR_SETTINGS_TOGGLES)) {
            const r = document.createElement('label');
            r.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;';
            const cb = document.createElement('input'); cb.type = 'checkbox';
            cb.checked = get(key) ?? ADSR_DEFAULTS[key];
            cb.addEventListener('change', () => set(key, cb.checked));
            r.appendChild(cb);
            r.appendChild(document.createTextNode(cfg.label));
            toggleCol.appendChild(r);
        }
        grid.appendChild(toggleCol);

        const selectCol = document.createElement('div');
        for (const [key, cfg] of Object.entries(ADSR_SETTINGS_SELECTS)) {
            const r = document.createElement('label');
            r.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;';
            const sel = document.createElement('select');
            sel.style.cssText = 'font-size:11px; padding:1px 4px;';
            for (const o of cfg.options) {
                const opt = document.createElement('option'); opt.value = o; opt.textContent = o;
                sel.appendChild(opt);
            }
            sel.value = get(key) ?? ADSR_DEFAULTS[key];
            sel.addEventListener('change', () => set(key, sel.value));
            r.appendChild(sel);
            r.appendChild(document.createTextNode(cfg.label));
            selectCol.appendChild(r);
        }
        grid.appendChild(selectCol);
        pop.appendChild(grid);

        // ── Skew-Zeile: A/D/R-Skew als kompakte Zahlenfelder ──────────────────
        const skewRow = document.createElement('div');
        skewRow.style.cssText = 'display:flex; gap:8px; align-items:center; font-size:11px; margin:4px 0;';
        const skewLabel = document.createElement('span'); skewLabel.textContent = 'Skew:'; skewRow.appendChild(skewLabel);
        for (const [key, cfg] of Object.entries(ADSR_SETTINGS_SKEWS)) {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:2px;';
            const num = document.createElement('input'); num.type = 'number';
            num.min = cfg.min; num.max = cfg.max; num.step = 0.1;
            num.value = get(key) ?? cfg.default;
            num.style.cssText = 'width:40px; font-size:11px; padding:1px 2px;';
            num.addEventListener('input', () => {
                const v = Math.max(cfg.min, Math.min(cfg.max, parseFloat(num.value) || cfg.default));
                set(key, v);
            });
            l.appendChild(num);
            l.appendChild(document.createTextNode(cfg.label.replace('-Skew', '')));
            skewRow.appendChild(l);
        }
        pop.appendChild(skewRow);

        // ── Nullpunktversatz-Zeile ─────────────────────────────────────────
        const numRow = document.createElement('div');
        numRow.style.cssText = 'display:flex; gap:8px; align-items:center; font-size:11px; margin:4px 0;';
        for (const [key, cfg] of Object.entries(ADSR_SETTINGS_NUMS)) {
            const l = document.createElement('label');
            l.style.cssText = 'display:flex; align-items:center; gap:4px;';
            const num = document.createElement('input'); num.type = 'number';
            num.min = cfg.min; num.max = cfg.max; num.step = 0.01;
            num.value = get(key) ?? cfg.default;
            num.style.cssText = 'width:56px; font-size:11px; padding:1px 2px;';
            hint(l, 'Ruhepunkt der Env verschieben (0 = wie bisher; 1 = z.B. für Frequenz-Ziele, die um 1 statt 0 herum arbeiten).');
            num.addEventListener('input', () => {
                const v = Math.max(cfg.min, Math.min(cfg.max, parseFloat(num.value) || cfg.default));
                set(key, v);
            });
            l.appendChild(document.createTextNode(cfg.label));
            l.appendChild(num);
            numRow.appendChild(l);
        }
        pop.appendChild(numRow);

        // ── Buttons: +➚ (Kopie) und 🚮 (löschen) — NUR wenn der Aufrufer eine echte
        // vervielfältigbare Reihe verwaltet (multiEnv.js). Ein festes ADSR bleibt ohne.
        if (onCopy || onDelete) {
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
            if (onCopy) {
                const copyBtn = document.createElement('button'); copyBtn.className = 'wb-help-btn'; copyBtn.textContent = '+➚';
                hint(copyBtn, 'Kopie dieser ADSR anlegen');
                copyBtn.addEventListener('click', () => onCopy(sfx));
                btnRow.appendChild(copyBtn);
            }
            if (onDelete) {
                const delBtn = document.createElement('button'); delBtn.className = 'wb-help-btn'; delBtn.textContent = '🚮';
                hint(delBtn, 'Diese ADSR löschen (nach Bestätigung)');
                delBtn.addEventListener('click', () => { if (confirm('ADSR wirklich löschen?')) onDelete(sfx); });
                btnRow.appendChild(delBtn);
            }
            pop.appendChild(btnRow);
        }
    };
}
