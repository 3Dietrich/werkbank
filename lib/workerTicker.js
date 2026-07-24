/**
 * workerTicker.js — ein Ticker, der auch bei UNSICHTBAREM Tab weiterläuft.
 *
 * Warum: Hintergrund-Tabs drosseln `requestAnimationFrame` auf 0 und ein main-thread
 * `setInterval` auf ~1×/s. Alles, was nur am rAF-Render-Loop hängt, verhungert damit,
 * sobald @dpa den Tab wechselt. Ein Worker-Timer wird NICHT gedrosselt (dieselbe Lehre
 * wie clock.js: „Warum ein Worker als Ticker").
 *
 * Genau das war der @dpa-Bug (ddw.md 20260724_212747): „beim Fokus auf anderen Tab …
 * die Sequenzer 'senden' nichts mehr … das soll ein stabiler Bus sein!". Der Metronom
 * lief durch, weil sein Klang direkt aus dem Worker-Scheduler der Clock ins Audio geplant
 * wird — der Sequenzer-Transport dagegen wurde bis dahin NUR aus dem rAF-Loop getickt
 * (werkbank.js) und fror deshalb im Hintergrund ein. Dieser Ticker treibt den
 * Seq-Transport unabhängig vom Tab-Fokus; der rAF-Loop bleibt fürs bloße Zeichnen
 * zuständig (das darf im Hintergrund ruhen — sieht ohnehin niemand).
 *
 * Der Callback bekommt `performance.now()` (im Main-Thread geholt, der Worker liefert nur
 * den Takt) — dieselbe Zeitbasis wie der rAF-Loop, damit derselbe `tick(nowMs)` von beiden
 * Quellen aus idempotent bleibt (er verarbeitet nur, was seit `nextAt` fällig ist).
 */
export function makeWorkerTicker(intervalMs, onTick) {
    // Der Worker hält nur ein setInterval und pingt zurück; die eigentliche Arbeit läuft
    // im Main-Thread (onmessage), damit sie auf denselben State/DOM zugreifen kann.
    const src = "let id=null;onmessage=e=>{const d=e.data;"
        + "if(d&&d.cmd==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),d.ms);}"
        + "else{clearInterval(id);id=null;}};";
    let worker = null;
    return {
        start() {
            if (worker) return;
            worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
            worker.onmessage = () => onTick(performance.now());
            worker.postMessage({ cmd: 'start', ms: Math.max(1, intervalMs | 0) });
        },
        stop() {
            if (!worker) return;
            worker.postMessage({ cmd: 'stop' });
            worker.terminate();
            worker = null;
        },
        get running() { return !!worker; },
    };
}
