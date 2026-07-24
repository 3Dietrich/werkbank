/**
 * soundKeys.js — reine, DOM-arme Helfer für den Combo-/Snapshot-Speicher (GroupHost.js).
 *
 * @dpa 20260724 (ddw.md „Combo/Snapshot"): Gruppen brauchen einen Combo-Speicher (Optik)
 * UND einen Snapshot-Speicher (Werte), ISM mindestens Snapshot, Header Ensemble-Snapshots.
 * Zentrale Anforderung (@dpa, wörtlich): „die Gruppen haben jeder die 2 Speicher, aber alle
 * 'Clone' haben gemeinsam den Pool an Speichern" — z.B. teilen sich alle vom Sequenzer-
 * Manager (lib/stepseq/multiSq.js) erzeugten Sq-Gruppen EINEN Combo- und EINEN Snapshot-Pool,
 * unabhängig vom literalen Anzeigenamen ("Sequenzer 2"/"Sequenzer 3"). Der Pool speichert
 * darum KANONISCHE (suffix-freie) Keys/IDs; stripSuffix/addSuffix übersetzen zwischen
 * kanonisch und der konkreten Instanz. Bei statischen (Nicht-Klon-)Gruppen ist suffix=''
 * und beide Funktionen sind reine Identität — kein Mehraufwand für den Normalfall.
 *
 * KONVENTION für künftige Klon-Bausteine: JEDER State-Key und JEDE Control-ID (data-ctrl)
 * eines Klons MUSS denselben Suffix tragen (wie multiSq.js es mit '_' + i vormacht) — sonst
 * matcht stripSuffix/addSuffix falsch oder gar nicht.
 */

/** Name ist der Schlüssel: Upsert bei Gleichheit, Ablehnung bei Kollision (1:1 aus
 *  teslacoils PresetManager.renameIn übernommen, s. lib/PresetManager.js).
 *  @returns {string} '' = umbenannt, sonst die Meldung für den Menschen. */
export function renameIn(list, index, name) {
    const nm = String(name == null ? '' : name).trim();
    if (!list[index]) return 'Diesen Eintrag gibt es nicht mehr.';
    if (!nm) return 'Der Name darf nicht leer sein.';
    if (nm === list[index].name) return '';
    if (list.some((it, i) => i !== index && it.name === nm)) return 'Es gibt schon einen Eintrag „' + nm + '".';
    list[index] = { ...list[index], name: nm };
    return '';
}

/** Klon-Suffix von einem State-Key/einer Control-ID entfernen (kanonisieren). */
export function stripSuffix(key, suffix) {
    if (!suffix) return key;
    return key.endsWith(suffix) ? key.slice(0, -suffix.length) : key;
}

/** Kanonischen Key/ID wieder auf eine konkrete Instanz anwenden (Gegenstück zu stripSuffix). */
export function addSuffix(key, suffix) {
    return suffix ? key + suffix : key;
}

/** Alle Wert-Keys EINER KONKRETEN Gruppen-Instanz (literal, noch NICHT kanonisiert) — aus dem
 *  DOM abgeleitet (genau das Muster, das GroupHost.removeGroup() für seine Aufräum-Filter
 *  schon nutzt: `id.slice(id.indexOf(':')+1)` = State-Key), PLUS die vom Aufrufer deklarierten
 *  extraCanonicalKeys (für Werte ohne data-ctrl-Entsprechung, z.B. das Sq-Step-Pattern-Array
 *  oder ChordMemory-Slot-Inhalte — s. Kopfkommentar von multiSq.js/polysynth/defs.js).
 *  @param {HTMLElement} groupRootEl  der `.group`-Wurzelknoten DIESER Instanz (groupEls.get(name).g)
 *  @param {string[]} extraCanonicalKeys  kanonische (suffix-freie) Zusatz-Keys
 *  @param {string} suffix  Instanz-Suffix ('' bei statischen Gruppen)
 *  @returns {Set<string>} literale State-Keys dieser Instanz */
export function groupValueKeys(groupRootEl, extraCanonicalKeys, suffix) {
    const keys = new Set();
    if (groupRootEl) {
        groupRootEl.querySelectorAll('[data-ctrl]').forEach((el) => {
            const id = el.dataset.ctrl;
            const key = id.slice(id.indexOf(':') + 1);
            if (key) keys.add(key);
        });
    }
    for (const k of (extraCanonicalKeys || [])) keys.add(addSuffix(k, suffix));
    return keys;
}
