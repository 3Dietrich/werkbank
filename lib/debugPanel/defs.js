/**
 * defs.js — Debug als eigenes Instrument (@dpa ddw.md 20260802, Vorbild lib/recInstrument/:
 * eigener State, eigene .wb-bench-Sektion, eigene InstrumentSettings-Instanz — genau wie
 * Rec „nicht in Poly drin, sondern als Extra Instrument").
 *
 * Deklariert NUR das, was über die generischen GroupHost-Fabriken entsteht (Buttons + die
 * Kopf-Notiz). `debugName`/`debugPrompt` stehen bewusst NICHT in TEXTS — sie sind keine
 * data-ctrl-Werte, sondern hängen an einem eigenen Optik-Key `debugMeta` (kein
 * Sound-Snapshot-Recall, s. DebugPanel.js-Kopf) und werden separat in mount.js gebaut.
 */
export function debugPanelDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});

    return {
        // debugMeta lebt NICHT hier als Sound-Default, sondern wird von MiniState wie jeder
        // andere Key beim ersten Zugriff über `state.get('debugMeta') || {}` behandelt —
        // ein leerer Default reicht, DEFAULTS ist trotzdem der übliche Ort (Konvention).
        DEFAULTS: { debugMeta: { name: '', prompt: '' } },

        NOTES: {
            debugNote: { label: 'Begleit-Prompt an die KI' },
        },

        BUTTONS: {
            // Titel bewusst NICHT der teslacoil-Wortlaut ("Master abgreifen") — Werkbank
            // zapft den Analyser-Tap (s. DebugPanel.js-Kopf), darum eigener Hint-Text +
            // eigener EN-Eintrag (lib/i18n.js). Die drei übrigen Titel sind 1:1 aus
            // teslacoil übernommen (dort bereits mit EN-Entsprechung vorbereitet).
            debugRec: {
                label: 'Rec',
                title: 'Audio am Analyser-Tap abgreifen (derselbe Punkt wie der LevelMeter, also der tatsächliche Ausgangspegel) – Start/Stop',
                onClick: () => onAction('debugRec'),
            },
            debugRec2: {
                label: 'Rec2',
                title: 'Zweite Aufnahme zum Vergleich (vorher/nachher) – Start/Stop',
                onClick: () => onAction('debugRec2'),
            },
            // Leeres Label + icon = SVG-Icon statt Text (s. lib/icons.js, wie an anderer
            // Stelle im Projekt üblich für reine Aktions-Knöpfe ohne eigene Beschriftung).
            debugRecReset: {
                label: '', icon: 'sync',
                title: 'Beide Aufnahmen verwerfen (Rec und Rec2 leeren)',
                onClick: () => onAction('debugRecReset'),
            },
            debugSave: {
                label: 'Debug speichern',
                title: 'Audio (WAV, beide Aufnahmen) + Screenshot (PNG) + Zustand (JSON) + Prompt (TXT) einzeln herunterladen',
                onClick: () => onAction('debugSave'),
            },
        },

        GROUPS: [
            { name: 'Debug', buttons: ['debugRec', 'debugRec2', 'debugRecReset', 'debugSave'], notes: ['debugNote'] },
        ],

        // Port-Schema (wie recInstrumentDefs): Debug hat keine Routing-Ein-/Ausgänge — es
        // liest den Analyser direkt, nicht über die Registry.
        ports: { outputs: [], inputs: [] },
    };
}
