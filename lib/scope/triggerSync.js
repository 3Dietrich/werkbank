/**
 * triggerSync.js — reine Trigger-Mathematik fürs Signal-Scope-Sync-Feature (@dpa 20260804,
 * Grill-Runde „Signal-Scope: Sync/Freeze-Buttons", todos.md 20260727_111500).
 *
 * KEIN DOM, KEIN AudioContext, KEIN Zustand — bewusst reine Funktionen (Vorbild
 * `processBlock()` in lib/audio/limiterProcessor.js), damit die Kernlogik ohne Browser per
 * `node --test` geprüft werden kann. SignalScope.js ruft diese Funktionen aus tick() auf und
 * kümmert sich selbst um Domain-Umrechnung (Audio-Context-Sekunden für den Sample-Ringpuffer,
 * performance.now()-Millisekunden für den bestehenden Frame-Puffer — beide Domains sind
 * intern jeweils in sich konsistent, die Funktionen hier sind einheitenlos/domain-agnostisch:
 * `nowTime`/`windowDur`/`syncOffset` müssen nur alle in DERSELBEN Einheit übergeben werden).
 *
 * ── Zeitbedeutung des Sync-Offsets (@dpa 20260804: „es muss immer die Möglichkeit geben,
 * den Klick nach vorne zu ziehen") ───────────────────────────────────────────────────────
 * `syncOffset` verschiebt den REFERENZ-BEAT-ZEITPUNKT selbst (nicht nur die Anzeige-Position
 * im Fenster, das macht `offsetFrac`) — negativ = der Beat gilt als FRÜHER geschehen (Klick
 * nach vorne gezogen, z.B. um die Latenz einer Modulationskette zu kompensieren), positiv =
 * später. Getrennt von `offsetFrac` (0=Fenster beginnt am Beat, 0.5=Beat mittig, 1=Fenster
 * endet am Beat), das rein die Darstellung im sichtbaren Ausschnitt bestimmt.
 */

/**
 * Wählt den jüngsten Beat, dessen Anzeige-Fenster (Breite `windowDur`, Beat-Position
 * `offsetFrac` im Fenster, verschoben um `syncOffset`) VOLLSTÄNDIG in der Vergangenheit
 * relativ zu `nowTime` liegt — d.h. genug Puffer-Historie existiert bereits, um das Fenster
 * ganz zu zeichnen. Gibt `null` zurück, wenn (noch) kein Beat dafür ausreicht; Aufrufer
 * fällt dann still auf die normale Live-Anzeige zurück (Projekt-Konvention, wie beim
 * `accuracy`-Fallback in SignalScope.js).
 *
 * @param {number[]} beatTimes  bekannte Beat-Zeitpunkte (gleiche Domain wie nowTime)
 * @param {number} nowTime
 * @param {number} windowDur  Fensterbreite (gleiche Domain)
 * @param {number} offsetFrac  0..1, Position des Beats im Fenster (0.5 = mittig)
 * @param {number} [syncOffset]  Verschiebung des Referenz-Beats selbst (gleiche Domain, Default 0)
 * @returns {{beatTime:number, winStart:number, winEnd:number}|null}
 */
export function chooseTriggerWindow(beatTimes, nowTime, windowDur, offsetFrac, syncOffset = 0) {
    let best = null;
    for (const b of beatTimes) {
        const eff = b + syncOffset;
        const winStart = eff - offsetFrac * windowDur;
        const winEnd = eff + (1 - offsetFrac) * windowDur;
        if (winEnd > nowTime) continue;   // Fenster reicht (teilweise) in die Zukunft — noch nicht fertig gepuffert
        if (!best || eff > best.beatTime) best = { beatTime: eff, winStart, winEnd };
    }
    return best;
}

/**
 * Extrahiert ein Zeitfenster aus einem GLEICHFÖRMIGEN Audio-Ringpuffer (fester sampleRate,
 * linearer Zeit↔Index-Zusammenhang — kein Zeitstempel pro Sample nötig, ein einziger Anker
 * reicht). `ring` = { samples: Float32Array (zirkulär), capacity, totalWritten, sampleRate,
 * anchorTime } — `totalWritten` = Gesamtzahl je geschriebener Samples seit Anker (absoluter,
 * monoton wachsender Zähler, NICHT der zirkuläre Schreib-Index).
 *
 * @returns {Float32Array|null}  null wenn das Fenster (teilweise) außerhalb der noch
 *   gepufferten Historie liegt (zu jung = Zukunft, zu alt = schon überschrieben) — Aufrufer
 *   fällt dann still zurück (wie bei chooseTriggerWindow).
 */
export function extractRingWindow(ring, winStart, winEnd) {
    const { samples, capacity, totalWritten, sampleRate, anchorTime } = ring;
    const idxOf = (t) => Math.round((t - anchorTime) * sampleRate);
    const startN = idxOf(winStart);
    const endN = idxOf(winEnd);
    const n = endN - startN;
    if (n <= 0) return null;
    if (endN > totalWritten) return null;               // noch nicht (ganz) geschrieben
    if (startN < totalWritten - capacity) return null;   // schon überschrieben
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const abs = startN + i;
        out[i] = samples[((abs % capacity) + capacity) % capacity];
    }
    return out;
}

/**
 * Dasselbe Fenster aus dem bestehenden UNGLEICHFÖRMIGEN Frame-Puffer ({t,v}[], wie
 * SignalScope.js `_buf` ihn im 'frame'-Modus führt) — für Sync im 'frame'-Genauigkeitsmodus
 * (bewusst mit angeboten, @dpa 20260804: „Ja, aber mit Toleranzbereich" — SignalScope.js
 * zeichnet die Trigger-Linie hier gestrichelt/als Toleranz-Kennzeichnung, nicht Teil dieser
 * reinen Funktion, nur der Datenauswahl).
 *
 * @returns {{t:number,v:number}[]|null}  null wenn kein Punkt im Fenster liegt
 */
export function extractFrameWindow(buf, winStart, winEnd) {
    const out = [];
    for (const p of buf) if (p.t >= winStart && p.t <= winEnd) out.push(p);
    return out.length ? out : null;
}
