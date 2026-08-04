/**
 * lib/groupPresetFactory.js — Kombo/Snapshot-Factory (@dpa 20260804, dritter offener Faden
 * aus dem `>chat`-Handoff: "vorgefertigte Combos/Snapshots, die bei Erstbesuch schon in
 * groupCombos/groupSnaps stehen, analog zu defaultConfig.js aber nur für diesen Ausschnitt").
 *
 * Generischer Mechanismus — JEDER groupKind kann Presets bekommen, nicht nur ADSR — mit
 * demselben Update-Verhalten wie lib/defaultConfig.js: EINMALIG befüllen, nie überschreiben.
 * "Einmalig" heißt hier bewusst mehr als "Liste gerade leer?": ein Marker in
 * `groupPresetSeeded[kind]` merkt sich pro groupKind, dass schon gesät wurde — löscht @dpa
 * einen vorgefertigten Eintrag später selbst wieder, kommt er beim nächsten Laden NICHT
 * zurück (sonst wäre Löschen witzlos).
 *
 * Nur SNAPSHOTS (Sound-/Wertepresets), bewusst KEINE Combos (Optik): ein Combo-Eintrag
 * entsteht in GroupHost.js aus der LIVE-DOM (`_comboPayloadOf` liest ctrlStyles/knobMeta/
 * ctrlPos von echten, gemounteten Controls) — von außen, vor dem ersten Mount, ließe sich
 * das nur mit händisch nachgebauten Style-Objekten fälschen: fragil, wenig Nutzen gegenüber
 * einem echten Sound-Startpunkt. Snapshots dagegen sind reine Key→Wert-Paare (s.
 * `_snapValuesOf`/`_applySnap` in GroupHost.js) — die lassen sich sauber von außen bauen.
 *
 * Sound-Disziplin (CLAUDE.md "Klang ist @dpas Ohr"): hier wird KEIN neuer Sound erfunden —
 * der Aufrufer liefert die `values`, typischerweise 1:1 bestehende, bereits gehörte Defaults
 * (z.B. ADSR_DEFAULTS aus lib/adsrPanel.js) unter einem Namen wie "Standard". Neue, tatsächlich
 * andersklingende Presets (z.B. "Pluck"/"Pad") bitte separat mit @dpas Ohr abstimmen, dann
 * hier als weiterer Eintrag ergänzen.
 *
 * Verwendung (einmal pro State, möglichst früh nach dem MiniState-Konstruktor):
 *   seedGroupSnapshots(adsrOscState, { ADSR: [{ name: 'Standard', values: ADSR_DEFAULTS }] });
 */
export function seedGroupSnapshots(state, seeds) {
    const seeded = { ...(state.get('groupPresetSeeded') || {}) };
    const all = { ...(state.get('groupSnaps') || {}) };
    let changed = false;
    for (const [kind, entries] of Object.entries(seeds)) {
        if (seeded[kind]) continue;   // schon einmal gesät — auch nach manuellem Löschen nie wieder
        const list = (all[kind] || []).slice();
        for (const { name, values } of entries) {
            if (list.some((e) => e.name === name)) continue;
            list.push({ name, ts: Date.now(), ...values });
        }
        all[kind] = list;
        seeded[kind] = true;
        changed = true;
    }
    if (changed) { state.set('groupSnaps', all); state.set('groupPresetSeeded', seeded); }
}
