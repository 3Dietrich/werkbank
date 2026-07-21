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
 */
import { fileStamp } from '../fileIO.js';
import { processRecording } from '../recPostProcess.js';
import { ensureAudio as ensureBus, getContext, getMaster } from '../audioBus.js';

export function createRecEngine(state, opts = {}) {
    const getBpm = opts.getBpm || (() => 120);
    const getBeatsPerBar = opts.getBeatsPerBar || (() => 4);

    let recorder = null, recChunks = [], recDest = null;
    let recArmed = null;   // null | 'start' | 'stop'
    let _onRecording = () => {};
    let _onRecArmed = () => {};

    function recording() { return !!recorder; }

    function recStart() {
        ensureBus();
        if (recorder) return;
        const audio = getContext(), master = getMaster();
        recDest = audio.createMediaStreamDestination();
        master.connect(recDest);
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
            master.disconnect(recDest); recDest = null; recorder = null; recChunks = [];
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

    /** Dieselbe onAction(id,phase)-Signatur wie die anderen Instrumente. */
    function onAction(id) { if (id === 'rec') recToggle(); }

    return {
        onAction, recording, handleClockBeat,
        recArmed: () => recArmed,   // 'start'|'stop'|null — Debug/Test
        onRecording(fn) { _onRecording = fn || (() => {}); },   // tatsächlicher Rec-Start/Stop
        onRecArmed(fn) { _onRecArmed = fn || (() => {}); },     // 'start'|'stop'|null, für Blink-UI
    };
}
