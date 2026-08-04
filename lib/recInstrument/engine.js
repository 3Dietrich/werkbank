/**
 * engine.js — Rec als eigenes Instrument (@dpa 20260721, „Rec nicht in Poly drin, sondern
 * als Extra Instrument"). Extrahiert aus taktmetro/engine.js (Rec-Instrument-TODO 1-6,
 * unverändert in der Logik) — zwei Änderungen durch die Verselbständigung:
 *
 *  1. Nimmt jetzt den GEMEINSAMEN Master-Bus ab (lib/audioBus.js), nicht mehr taktmetros
 *     eigenen — „alles Hörbare" heißt jetzt wirklich alle Instrumente, nicht nur eins.
 *  2. Start/Stop-Sync (Downbeat-Arming, Schritt 5) braucht weiterhin den Takt-Beat, kommt
 *     aber jetzt von AUSSEN (werkbank.js verdrahtet `taktEngine.onClockBeat(rec.handleClockBeat)`)
 *     statt aus einem eigenen Clock — Rec hat keinen eigenen Takt, sondern hängt sich an
 *     den des Taktmetro-Instruments.
 *
 * Eingangs-Tap wählbar (@dpa 20260804, „Rec/LevelMeter sollen an mehreren Stellen gleichzeitig
 * abgreifen können" — Vervielfältigung, s. lib/recInstrument/multiRec.js): `opts.getInputNode`
 * liefert den AudioNode, den `recStart()` anzapft — Default bleibt `getMaster()` (der rohe
 * Summenbus VOR Fader/Limiter, unverändert das bisherige Verhalten für jeden Aufrufer, der
 * die Option weglässt). multiRec.js übergibt hier pro Instanz eine Closure, die wahlweise den
 * Master-Bus oder einen anderen `hasNode`-Output aus der Routing-Registry zurückgibt.
 */
import { fileStamp } from '../fileIO.js';
import { processRecording } from '../recPostProcess.js';
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';
import { busLatencyMs } from '../routing/latency.js';

export function createRecEngine(state, opts = {}) {
    const getBpm = opts.getBpm || (() => 120);
    const getBeatsPerBar = opts.getBeatsPerBar || (() => 4);
    // Läuft der Takt gerade NICHT, kommt nie ein Downbeat, auf den „armed" warten könnte —
    // Rec blieb dann für immer blinkend hängen, ohne je aufzunehmen (@dpa 20260722_013727:
    // „nimmt nichts auf", „blinkt danach immer, egal wie oft man ihn schaltet"). Ohne
    // laufenden Takt schaltet Rec deshalb SOFORT statt zu armen.
    const isClockRunning = opts.isClockRunning || (() => false);
    // s. Datei-Kopf: Default = unverändertes Alt-Verhalten (roher Master-Bus).
    const getInputNode = opts.getInputNode || getMaster;

    let recorder = null, recChunks = [], recDest = null, recSrcNode = null;
    let recArmed = null;   // null | 'start' | 'stop'
    let _onRecording = () => {};
    let _onRecArmed = () => {};

    function recording() { return !!recorder; }

    function recStart() {
        ensureBus();
        if (recorder) return;
        const audio = getContext();
        // Node ERST bei recStart() auflösen (nicht schon beim Bauen) — dieselbe Lazy-Regel
        // wie überall sonst bei hasNode()/node() (s. Registry.js-Kommentar): eine gewählte
        // Quelle kann sich zwischen zwei Aufnahmen ändern, ohne dass ein alter Node-Rest
        // hängen bleibt. Fällt eine gewählte Quelle (noch) auf null zurück (z.B. Ensemble
        // noch nicht bereit), greift derselbe Master-Fallback wie beim Default.
        recSrcNode = getInputNode() || getMaster();
        recDest = audio.createMediaStreamDestination();
        recSrcNode.connect(recDest);
        recChunks = [];
        recorder = new MediaRecorder(recDest.stream, { mimeType: 'audio/webm;codecs=opus' });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
        recorder.onstop = () => {
            const rawBlob = new Blob(recChunks, { type: 'audio/webm' });
            const prefix = (state.get('recName') || 'werkbank-rec').trim() || 'werkbank-rec';
            const ts = fileStamp();   // lokale Zeit YYYYMMDD_HHMMSS (wie fileIO.js)
            const download = (blob, ext) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = prefix + '-' + ts + '.' + ext; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
            };
            if (recSrcNode) { try { recSrcNode.disconnect(recDest); } catch { /* schon getrennt */ } }
            recSrcNode = null; recDest = null; recorder = null; recChunks = [];
            _onRecording(false);   // sofort „gestoppt" zeigen, Nachbearbeitung läuft im Hintergrund

            // Rec-Instrument-TODO 6: webm→PCM dekodieren, aufs Takt-Raster zurechtschneiden,
            // erst danach encodieren (nur wenn recFormat ≠ webm). Schlägt das fehl (z.B.
            // Decode-Fehler), landet die Rohaufnahme trotzdem beim Nutzer statt zu verschwinden.
            processRecording(rawBlob, {
                audioContext: audio, bpm: getBpm(),
                beatsPerBar: Math.max(1, getBeatsPerBar() | 0) || 4,
                format: state.get('recFormat') || 'webm',
                mp3Bitrate: state.get('recMp3Bitrate') || 192,
                mp3Stereo: state.get('recMp3Stereo') !== false,
                wavSampleRate: state.get('recWavSampleRate') || 44100,
                wavBitDepth: state.get('recWavBitDepth') || 16,
            }).then(({ blob, ext }) => download(blob, ext))
              .catch((e) => { console.error('Rec-Nachbearbeitung fehlgeschlagen, liefere Rohaufnahme:', e); download(rawBlob, 'webm'); });
        };
        recorder.start();
        _onRecording(true);
    }
    function recStop() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }

    // Start/Stop-Sync (Rec-Instrument-TODO 5): Rec schaltet NICHT sofort, sondern „armed"
    // sich (sichtbar blinkend) und wartet auf den nächsten Takt-Downbeat — auch wenn der
    // Takt gerade noch gar nicht läuft. Ein Klick während eines laufenden Arms tut nichts.
    function recToggle() {
        if (recArmed) return;
        if (!isClockRunning()) { recording() ? recStop() : recStart(); return; }
        recArmed = recording() ? 'stop' : 'start';
        _onRecArmed(recArmed);
        // GroupHost flippt den Knopf beim Klick optimistisch — weil Rec asynchron erst am
        // nächsten 0C schaltet, muss hier synchron der TATSÄCHLICHE Stand re-asserted werden.
        _onRecording(recording());
    }
    /** Vom Taktmetro-Instrument getrieben: werkbank.js verdrahtet
     *  `taktEngine.onClockBeat((t, beat) => recEngine.handleClockBeat(t, beat))`. */
    function handleClockBeat(time, beatInBar) {
        if (!recArmed || beatInBar !== 0) return;
        const which = recArmed;
        recArmed = null; _onRecArmed(null);
        const delay = Math.max(0, (time - getContext().currentTime) * 1000);
        setTimeout(() => { which === 'start' ? recStart() : recStop(); }, delay);
    }

    /** Der Takt wurde gestoppt, während Rec noch auf den nächsten Downbeat wartete — sonst
     *  bliebe Rec für immer „armed"/blinkend hängen, weil kein Beat mehr kommt (@dpa
     *  20260722_013727). Löst das Arm sofort auf, statt endlos zu warten. */
    function clockStopped() {
        if (!recArmed) return;
        const which = recArmed;
        recArmed = null; _onRecArmed(null);
        which === 'start' ? recStart() : recStop();
    }

    /** Dieselbe onAction(id,phase)-Signatur wie die anderen Instrumente. */
    function onAction(id) { if (id === 'rec') recToggle(); }

    // ISM-Latenz-Vertrag (Phase 2.2): kein eigener Vorlauf — reiner Bus-Anteil.
    function latency() { return busLatencyMs(); }

    return {
        onAction, recording, handleClockBeat, clockStopped, latency,
        recArmed: () => recArmed,   // 'start'|'stop'|null — Debug/Test
        onRecording(fn) { _onRecording = fn || (() => {}); },   // tatsächlicher Rec-Start/Stop
        onRecArmed(fn) { _onRecArmed = fn || (() => {}); },     // 'start'|'stop'|null, für Blink-UI
    };
}
