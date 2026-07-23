// defs.js — Rec als EIGENES Instrument (@dpa 20260721: „Rec nicht in Poly drin, sondern
// als Extra Instrument"). Vorher Teil von taktmetro/defs.js (Gruppe „Aufnahme") — jetzt
// eigenständig, weil Rec „alles Hörbare" aufnehmen soll (lib/audioBus.js, gemeinsamer
// Master für alle Instrumente), nicht an EIN bestimmtes Instrument gebunden.

export function recInstrumentDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});

    return {
        DEFAULTS: {
            recName: 'werkbank-rec',
            recFormat: 'webm',
            recMp3Bitrate: 192,
            recMp3Stereo: true,
            recWavSampleRate: 44100,
            recWavBitDepth: 16,
        },

        BUTTONS: {
            // „erst mal webm/opus" (@dpa 20260720): Klick startet/stoppt (Start/Stop-Sync
            // auf den nächsten Takt-Downbeat, lib/recInstrument/engine.js), beim Stopp fällt
            // der Download. Nimmt den gemeinsamen Master-Bus ab (alles Hörbare).
            rec: { label: '⏺ Rec', title: 'Nimmt alle Instrumente zusammen auf — Klick startet, nochmal Klick stoppt (je auf dem nächsten Takt-Downbeat) und lädt herunter.', mode: 'toggle', onClick: (k, phase) => onAction('rec', phase) },
        },

        TEXTS: {
            recName: { label: 'Dateiname', placeholder: 'werkbank-rec' },
        },

        GROUPS: [
            {
                name: 'Aufnahme',
                buttons: ['rec'],
                texts: ['recName'],
            },
        ],

        // Port-Schema (Phase 2, PLAN_OPERA.md/PHASE2_SPEC.md): reine Metadaten, KEIN Verhalten
        // hier — die Bindung (read/write) macht werkbank.js beim registerModule() der Registry.
        ports: {
            outputs: [],
            inputs: [
                { id: 'clock', label: 'Clock', type: 'Gate' },
            ],
        },
    };
}
