/**
 * portGen.js — dezentrale Brücke Knob/Button-defs → Registry-Ports (Punkt 3b, ddw.md
 * 20260724: „ALLE Buttons, Knobs, Speicher-Abrufe, Keyboards als Ziele hinzufügen").
 *
 * @dpas Prinzip bleibt gewahrt: „Ziele deklarieren sich SELBST, dezentral" (kein zentraler
 * Modul-Katalog) — jedes Modul importiert diese Helfer EINMAL in seiner eigenen defs.js/
 * werkbank.js-Verdrahtung. Ohne diese Brücke müsste jeder der ~30 Knobs im Repo sein
 * {min,max,stepSize} ein zweites Mal von Hand eintragen, obwohl es in KNOBS[key] schon
 * steht — reine Ableitung, keine neue Quelle der Wahrheit.
 *
 * Knob-Werte laufen über den neuen Port-Typ 'Value' (types.js) — 'Gate' würde negative Werte
 * (z.B. kbMidiOffset min −4) auf 0 klemmen. Buttons bleiben 'Gate' (0/>0 „Puls").
 */

/** GROUPS-defs → Nachschlagewerk „Control-Key → Gruppenname" (@dpa 20260725: Sq-Output-
 *  Menü soll „ISM / Gruppe → Control" zeigen statt nur „ISM → Control"). Rein abgeleitet
 *  aus denselben GROUPS, die auch mountGroups() liest — keine neue Quelle der Wahrheit.
 *  Keys ohne Gruppen-Nennung (freie Controls, Banner-Extras) tauchen einfach nicht auf —
 *  der Name fällt dann weg (Anzeige bleibt „ISM → Control"). */
export function groupOfControl(GROUPS) {
    const map = {};
    for (const g of GROUPS || []) {
        for (const field of ['selects', 'segments', 'toggles', 'knobs', 'inlineKnobs', 'buttons', 'wechsel', 'texts', 'notes']) {
            for (const k of g[field] || []) map[k] = g.name;
        }
    }
    return map;
}

/** KNOBS-defs → Ports. `keys` optional einschränken (Default: alle). */
export function knobsToPorts(KNOBS, keys = Object.keys(KNOBS), groupOf) {
    return keys.filter((k) => KNOBS[k]).map((k) => {
        const d = KNOBS[k];
        return { id: k, label: d.label || k, type: 'Value', min: d.min, max: d.max, stepSize: d.step || 0, offAllowed: false, group: groupOf && groupOf[k] };
    });
}

/** BUTTONS-defs → Ports (Puls: 0=nichts, >0=auslösen). `keys` optional einschränken. */
export function buttonsToPorts(BUTTONS, keys = Object.keys(BUTTONS), groupOf) {
    return keys.filter((k) => BUTTONS[k]).map((k) => {
        const d = BUTTONS[k];
        return { id: k, label: d.label || k, type: 'Gate', min: 0, max: 1, stepSize: 1, offAllowed: true, group: groupOf && groupOf[k] };
    });
}

/** write()-Bindings für Knob-Ports: schreibt direkt in den Instrument-State (klemmt sicherheits-
 *  halber nochmal auf min..max — ein aus einem ALTEN Ziel gespeicherter Step-Wert könnte
 *  außerhalb liegen, s. StepSeqGrid.setTargetDefaults). Die Optik folgt automatisch über
 *  state.subscribe → ctrlBindings (GroupHost) — kein Extra-Draht nötig. */
export function knobWrites(state, KNOBS, keys = Object.keys(KNOBS)) {
    const out = {};
    for (const k of keys) {
        const d = KNOBS[k]; if (!d) continue;
        const min = d.min, max = d.max;
        out[k] = { write: (v) => state.set(k, Math.max(min, Math.min(max, v))) };
    }
    return out;
}

/** write()-Bindings für Button-Ports: nur bei v>0 auslösen (Step „aus"/0 = nichts tun) — ruft
 *  keyMidi.remoteActivate(), damit Flash/ON-Toggle/etc. GENAU wie bei Klick/MIDI mitlaufen. */
export function buttonWrites(keyMidi, keys) {
    const out = {};
    for (const k of keys) out[k] = { write: (v) => { if (v > 0) keyMidi.remoteActivate('b:' + k); } };
    return out;
}
