/**
 * EnsembleStore.js — Header-weite Snapshots über mehrere Instrumente hinweg (@dpa 20260724,
 * ddw.md: "header Ensemble Snapshots"). Vierte und äußerste Ebene des Combo-/Snapshot-
 * Speichers (s. lib/group/GroupHost.js für Gruppen-Combo/-Snapshot, lib/InstrumentSettings.js
 * für ISM-Snapshot).
 *
 * Bewusst GENERISCH: kennt keine konkreten ISM-Namen (Taktmetro/Poly-Synth/Sequenzer/Rec) —
 * der Aufrufer (werkbank.js) entscheidet, welche Instrumente mitgenommen werden. @dpa
 * (20260724, Antwort auf Rückfrage 3): "Nein, Master Fader bleibt extra" — der Aufrufer lässt
 * Master-Volume/LevelMeter darum einfach aus der `instruments`-Liste weg, kein Sonderfall hier.
 *
 * Jeder Eintrag `{ lsKey, state, allSoundValues }` liefert seine Werte über
 * `allSoundValues()` (GroupHost.js — literal, ISM-eigene Keys, s. dortiger Kopfkommentar).
 * Kein Klon-Pool-Konzept: ein Ensemble-Snapshot ist ein einziger, benannter Zustand über
 * alle beteiligten Instrumente, nicht pro-Instrument geteilt.
 *
 * Optionale ISM-weite Naht (@dpa 20260725), analog zu InstrumentSettings.js: `snapExtra()`
 * liefert Keys, die zu KEINER Gruppe gehören (Stepseq: `sqCount`) und die allSoundValues()
 * darum nicht erfasst; `onRecalled()` läuft NACH dem Zurücksetzen aller Werte dieses ISM,
 * fürs Angleichen der Struktur (Stepseq: multiSq.reconcile() baut Sq-Gruppen nach/ab).
 */
import { renameIn } from './soundKeys.js';

/**
 * @param {import('./MiniState.js').MiniState} ensembleState  eigener MiniState (werkbank_ensemble)
 * @param {{lsKey:string, state:object, allSoundValues:()=>object,
 *          snapExtra?:()=>object, onRecalled?:()=>void}[]} instruments
 */
export function createEnsembleStore(ensembleState, instruments) {
    function list() { return ensembleState.get('ensembleSnaps') || []; }
    function _payload() {
        const ls = {};
        for (const instr of instruments) ls[instr.lsKey] = { ...instr.allSoundValues(), ...(instr.snapExtra ? instr.snapExtra() : {}) };
        return ls;
    }
    function save(name) {
        const all = list().slice();
        const entry = { name, ts: Date.now(), ls: _payload() };
        const at = all.findIndex((it) => it.name === name);
        if (at >= 0) all[at] = entry; else all.push(entry);
        ensembleState.set('ensembleSnaps', all);
        ensembleState.set('ensembleSnapSel', name);
        return all;
    }
    function update(index) {
        const all = list().slice();
        if (!all[index]) return false;
        all[index] = { ...all[index], ts: Date.now(), ls: _payload() };
        ensembleState.set('ensembleSnaps', all);
        return true;
    }
    function rename(index, newName) {
        const all = list().slice();
        const err = renameIn(all, index, newName);
        if (!err) ensembleState.set('ensembleSnaps', all);
        return err;
    }
    function del(index) {
        const all = list().slice();
        all.splice(index, 1);
        ensembleState.set('ensembleSnaps', all);
        return all;
    }
    function recall(index) {
        const entry = list()[index];
        if (!entry || !entry.ls) return false;
        for (const instr of instruments) {
            const values = entry.ls[instr.lsKey];
            if (!values) continue;
            for (const [k, v] of Object.entries(values)) instr.state.set(k, v);
            // NACH allen Werten dieses ISM: Struktur an den geladenen State angleichen
            // (Stepseq: die im Snapshot verlangten Sq-Gruppen neu-/abbauen).
            if (instr.onRecalled) instr.onRecalled();
        }
        ensembleState.set('ensembleSnapSel', entry.name);
        return true;
    }
    return { list, save, update, rename, del, recall };
}
