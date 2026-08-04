// defs.js — Rec als EIGENES Instrument (@dpa 20260721: „Rec nicht in Poly drin, sondern
// als Extra Instrument"). Vorher Teil von taktmetro/defs.js (Gruppe „Aufnahme") — jetzt
// eigenständig, weil Rec „alles Hörbare" aufnehmen soll (lib/audioBus.js, gemeinsamer
// Master für alle Instrumente), nicht an EIN bestimmtes Instrument gebunden.
//
// Vervielfältigbar (@dpa 20260804, s. lib/recInstrument/multiRec.js): `recName`/`recSrc`
// sind pro Instanz (`_i`-Suffix, wie multiEnv/multiScope), `recFormat`/`recMp3*`/`recWav*`
// bleiben ISM-WEIT geteilt — sie wurden bewusst als EINE globale „Aufnahme-Format"-Einstellung
// in die Haupt-Settings verschoben (ddw.md 20260803_135251 Punkt B, s. lib/mainSettings.js),
// nicht dupliziert für jede Instanz. multiRec.js reicht darum nur `recName`/`recSrc` scoped
// an die Engine durch (s. dortiger Kommentar), der Rest bleibt unsuffixed/gemeinsam.

export function recInstrumentDefs(opts = {}) {
    const onAction = opts.onAction || (() => {});

    return {
        DEFAULTS: {
            recName: 'werkbank-rec',
            // Tap-Punkt dieser Instanz (@dpa 20260804): '' = Master-Bus (roher Summenbus VOR
            // Fader/Limiter, s. lib/recInstrument/engine.js-Kopf) — das bisherige, einzige
            // Verhalten. Jeder andere Wert ist ein 'modul.port'-String aus
            // routing.outputSources() (nur hasNode-Einträge, s. multiRec.js).
            recSrc: '',
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
            // onClick reicht den ECHTEN (ggf. indizierten) `k` durch statt 'rec' fest zu
            // verdrahten (@dpa 20260804, Vervielfältigung s. multiRec.js) — GroupHost übergibt
            // hier bei mehreren Instanzen 'rec_0'/'rec_1'/…; der alte Singleton-Aufrufer bekam
            // ohnehin schon IMMER 'rec' übergeben (kein instanceSuffix), also unverändertes
            // Verhalten für jeden Aufrufer, der die neue Vervielfältigung nicht nutzt.
            rec: { label: '⏺ Rec', title: 'Nimmt alle Instrumente zusammen auf — Klick startet, nochmal Klick stoppt (je auf dem nächsten Takt-Downbeat) und lädt herunter.', mode: 'toggle', onClick: (k, phase) => onAction(k, phase) },
        },

        TEXTS: {
            recName: { label: 'Dateiname', placeholder: 'werkbank-rec', title: 'Dateiname für den Download, ohne Dateiendung — die kommt automatisch je nach Format.' },
        },

        // GROUPS/ports unten sind der ALTE Singleton-Bauplan — seit @dpa 20260804 (Vervielfäl-
        // tigung, s. lib/recInstrument/multiRec.js) baut multiRec.js Gruppen/Routing-Ports pro
        // Instanz SELBST (liest hier nur DEFAULTS/BUTTONS/TEXTS als Vorlage). Bleiben stehen als
        // dokumentierter Alt-Bauplan/für den Fall eines direkten Einzel-Rec ohne Manager.
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
