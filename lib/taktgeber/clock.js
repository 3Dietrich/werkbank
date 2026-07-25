/**
 * clock.js – der Taktgeber selbst: Lookahead-Scheduler, sample-genau.
 *
 * Ruft `onBeat(time, beatInBar)` für jeden Schlag im Vorausfenster auf. Das Tempo holt
 * er sich live über `bpmFn()`, die Taktlänge über `beatsPerBarFn()` – eine Tempo- oder
 * Takt-Änderung greift damit ab dem nächsten geplanten Schlag, ohne dass jemand die Uhr
 * anfassen muss.
 *
 * Warum ein Worker als Ticker: Hintergrund-Tabs drosseln `setInterval` im Main-Thread bis
 * auf ~1×/s – der Scheduler verhungert und das Metronom stottert. Worker-Timer nicht.
 */
const LOOKAHEAD = 0.15;   // s, so weit im Voraus wird geplant
const TICK_MS = 25;       // Takt des Tickers
/** Notbremse pro Tick. Ohne sie ist ein winziges Intervall ein Browser-Tod (@dpa 20260717:
 *  „ich konnte es so schnell tabben dass es neu lud"): der Scheduler plant dann pro Tick
 *  hunderte Klick-Quellen ins Vorausfenster. Der erste Riegel dagegen ist `foldBpm`
 *  (tapTempo.js) – dieser hier ist der, der auch hält, wenn das Tempo anders reinkommt. */
const MAX_PER_TICK = 256;

export class Clock {
    /**
     * @param {AudioContext} ctx
     * @param {(time:number, beatInBar:number)=>void} onBeat
     */
    constructor(ctx, onBeat) {
        this.ctx = ctx;
        this.onBeat = onBeat;
        this.bpmFn = () => 120;
        this.beatsPerBarFn = () => 4;
        this.beatInBar = 0;
        this._next = 0;
        this._worker = null;
    }

    get running() { return !!this._worker; }

    start() {
        if (this._worker) return;
        this.beatInBar = 0;
        this._next = this.ctx.currentTime + 0.06;
        const src = "let id=null;onmessage=e=>{if(e.data==='start'){id=setInterval(()=>postMessage(0)," + TICK_MS + ");}else{clearInterval(id);id=null;}};";
        this._worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
        this._worker.onmessage = () => this.schedule();
        this._worker.postMessage('start');
        this.schedule();
    }

    stop() {
        if (!this._worker) return;
        this._worker.postMessage('stop');
        this._worker.terminate();
        this._worker = null;
    }

    /**
     * Auf die 1 zurück – dieselben zwei Knöpfe wie in teslacoil (@dpa 20260717).
     * @param {boolean} hard  false („!") = nur der Zähler, der nächste Schlag wird zur 1;
     *                        der Takt läuft unbeirrt weiter. true („!!") = zusätzlich fällt
     *                        dieser Schlag sofort, die Phase beginnt hier.
     * Ohne laufende Uhr passiert nichts: gestoppt gibt es keine Phase zum Syncen, und ein
     * `_next` in der Vergangenheit ließe den nächsten `start()` einen Burst nachholen.
     */
    resync(hard = false) {
        if (!this._worker) return;
        this.beatInBar = 0;
        if (hard) { this._next = this.ctx.currentTime; this.schedule(); }
    }

    /** Phase neu ankern – nach einem eingefrorenen Tab ist die Kontext-Uhr weitergelaufen. */
    reanchor() {
        this._next = this.ctx.currentTime + 0.06;
        this.beatInBar = 0;
    }

    schedule() {
        if (!this._worker) return;
        const now = this.ctx.currentTime;
        // Zu weit zurückgefallen (Hintergrund)? Neu ankern statt einen Burst nachzuholen.
        if (this._next < now - 0.2) this.reanchor();
        let guard = 0;
        while (this._next < now + LOOKAHEAD && guard++ < MAX_PER_TICK) {
            const bpb = Math.max(1, this.beatsPerBarFn() | 0);
            // Wirft onBeat, darf das NIE den Scheduler stallen (teslacoil-Lehre): sonst
            // bliebe _next stehen und der Ticker feuerte alle 25 ms neu.
            try { this.onBeat(this._next, this.beatInBar); }
            catch (e) { console.error('Clock.onBeat error:', e); }
            this._next += 60 / Math.max(1, this.bpmFn());
            this.beatInBar = (this.beatInBar + 1) % bpb;
        }
    }
}
