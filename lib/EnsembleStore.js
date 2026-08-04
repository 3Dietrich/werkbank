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
 * liefert einen STRUKTURIERTEN Blob NEBEN den Sound-Werten (Stepseq: `{sqCount, sqViews}` =
 * Anzahl + volle Ansicht der Sqs), den allSoundValues() nicht erfasst; `onRecalled(extra)`
 * läuft NACH dem Zurücksetzen aller Werte dieses ISM und gleicht Struktur+Ansicht an
 * (Stepseq: multiSq.recallSnapshot() baut Sq-Gruppen nach/ab und stellt ihre Optik her).
 */
import { renameIn } from './soundKeys.js';
import { PickMenu } from './PickMenu.js';

/**
 * @param {import('./MiniState.js').MiniState} ensembleState  eigener MiniState (werkbank_ensemble)
 * @param {{lsKey:string, state:object, allSoundValues:()=>object,
 *          snapExtra?:()=>object, onRecalled?:(extra:object, values:object)=>void}[]} instruments
 */
export function createEnsembleStore(ensembleState, instruments) {
    function list() { return ensembleState.get('ensembleSnaps') || []; }
    function _payload() {
        const ls = {}, extra = {};
        for (const instr of instruments) {
            ls[instr.lsKey] = instr.allSoundValues();
            if (instr.snapExtra) extra[instr.lsKey] = instr.snapExtra();
        }
        return { ls, extra };
    }
    function save(name) {
        const all = list().slice();
        const entry = { name, ts: Date.now(), ..._payload() };
        const at = all.findIndex((it) => it.name === name);
        if (at >= 0) all[at] = entry; else all.push(entry);
        ensembleState.set('ensembleSnaps', all);
        ensembleState.set('ensembleSnapSel', name);
        return all;
    }
    function update(index) {
        const all = list().slice();
        if (!all[index]) return false;
        all[index] = { ...all[index], ts: Date.now(), ..._payload() };
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
            if (values) for (const [k, v] of Object.entries(values)) instr.state.set(k, v);
            // NACH allen Werten dieses ISM: Struktur+Ansicht an den geladenen State angleichen
            // (Stepseq: die im Snapshot verlangten Sq-Gruppen neu-/abbauen und Optik herstellen).
            // `values` MIT übergeben (@dpa dd.md 20260802: "Space > Play"/"Demo 2" luden die
            // Sequenzer nicht mehr richtig) — Altbestand-Ensemble-Snapshots ohne extra.sqCount
            // (von vor dem sqCount-Umbau) sollen die Sq-Anzahl trotzdem aus den Werte-Keys
            // ableiten können, s. multiSq.js recallSnapshot().
            if (instr.onRecalled) instr.onRecalled(entry.extra ? entry.extra[instr.lsKey] : undefined, values);
        }
        ensembleState.set('ensembleSnapSel', entry.name);
        return true;
    }
    return { list, save, update, rename, del, recall };
}

/**
 * Header-Menü fürs Ensemble-Snapshot-Picking (@dpa 20260724, Feinschliff 20260724_114012) —
 * bis auf Kommentare byte-identisch dreifach dupliziert in overcord/werkbank.js,
 * werkbank-leer/werkbank-leer.js und pitchosc/pitchosc.js gewesen (@dpa 20260804, gleicher
 * Fund wie ADSR/Scope/mountBenchHelp/headerBtn/configIO — s. lib/adsrPanel.js-Kommentar).
 * Anders als `createEnsembleStore` (schon immer generisch, s. Dateikopf) war dieser Teil
 * reine UI-Verdrahtung: PickMenu + Rechtsklick-Optik über ElementSettings, direkt als
 * Geschwister-Element neben der „Werkbank"-Headline eingehängt — gehört genau wie
 * Tasten/MIDI/Hints/Config zur Kategorie „kommt genau EINMAL pro Ensemble vor" (anders als
 * ADSR/Scope, die vervielfältigbar sind), darum unproblematisch als einzelner Hook.
 *
 * Rückgabe `{ menu }` — `menu.element` wird vom Aufrufer selbst platziert (Einstiegspunkte
 * hängen es unterschiedlich exakt neben der eigenen Headline ein).
 */
export function mountEnsembleMenu({ ensembleStore, ensembleState, hdrElemSettings, state }) {
    const ensembleMenu = new PickMenu({
        label: '',
        empty: '⭐ Ensemble',
        // Rechtsklick-Hinweis (ddw.md 20260802_234615 Punkt 4: "Farb setting für Ensemble BG"
        // — die Farbe (ctrlStyles['hdr:ensemble'].bg0) gab es technisch schon über
        // ElementSettings/Rechtsklick, war aber nirgends als Weg dorthin erwähnt).
        title: 'Zustand mehrerer Instrumente zusammen speichern/laden (Master-Fader bleibt außen vor) · Rechtsklick = Einstellungen (Farbe/Größe)',
        noContextOpen: true,
        list: () => ensembleStore.list(),
        current: () => ensembleState.get('ensembleSnapSel') || '',
        onPick: (i) => ensembleStore.recall(i),
        onUpdate: (i) => ensembleStore.update(i),
        onRename: (i, item, newName) => ensembleStore.rename(i, newName),
        onDelete: (i) => ensembleStore.del(i),
        foot: [['plus', '+ Neu', 'Aktuellen Zustand als neuen Ensemble-Snapshot speichern', () => {
            const nm = prompt('Name für den neuen Ensemble-Snapshot?', 'Snapshot ' + (ensembleStore.list().length + 1));
            if (nm && nm.trim()) ensembleStore.save(nm.trim());
        }]],
    });
    ensembleMenu.element.dataset.ctrl = 'hdr:ensemble';
    const applyEnsembleStyle = (s) => {
        const btn = ensembleMenu.element.querySelector('.pm-btn');
        if (btn) {
            btn.style.background = s.bg0 || '';
            btn.style.color = s.fg || '';
            btn.style.fontSize = s.size ? s.size + 'px' : '';
            btn.style.padding = s.pad != null ? s.pad + 'px' : '';
            btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
        }
    };
    ensembleMenu.element.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        hdrElemSettings.open({ id: 'hdr:ensemble', type: 'select', el: ensembleMenu.element, defLabel: 'Ensemble', applyStyle: applyEnsembleStyle });
    });
    applyEnsembleStyle((state.get('ctrlStyles') || {})['hdr:ensemble'] || {});
    return ensembleMenu;
}
