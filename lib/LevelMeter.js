/**
 * LevelMeter.js – Pegelanzeige des Master-Ausgangs (@dpa 20260722, ddw.md „ich brauche auch
 * einen LevelMeter (wie in teslacoil), aber auch mit Settings"; erweitert @dpa dd.md 20260802).
 *
 * Senkrechter Canvas-Balken, zapft lib/audioBus.js NACH dem Master-Fader ab (zeigt also dessen
 * Wirkung), unabhängig vom Limiter-IO-Schalter (s. audioBus.js-Kopfkommentar). Der Haupt-Balken
 * zeigt den (geglätteten) PEAK — vorher stand hier „RMS", tatsächlich war es aber schon immer
 * eine Peak-mit-Hold-Anzeige; RMS ist jetzt eine eigene, zuschaltbare dünne Linie (s.u.), damit
 * beide Werte nebeneinander lesbar sind, statt sie stillschweigend zu vermischen.
 *
 * Layout (links nach rechts, jeder Teil ist optional): [Peak-Balken] [6dB-Skala] [Limiter-
 * Reduktionsbalken]. boxSize/boxH (Settings) bestimmen nur die Breite/Höhe des Peak-Balkens
 * selbst — Skala/Limiter-Spalte kommen additiv dazu, damit ein Umschalten sie nicht staucht.
 *
 * Settings (Rechtsklick, ElementSettings type 'levelmeter'): Balkenfarbe/-BG/-Größe (bestehend)
 * + 6dB-Skala an/aus, RMS-Linie an/aus, Peak-Hold-Breite (1-2px)/-Haltezeit, gestufter 6dB-
 * Farbverlauf, Limiter-Anzeige an/aus, „Hektik" (Reaktionsgeschwindigkeit), je eigene Farbe für
 * Peak-Hold-Linie/RMS-Linie/Skala/Limiterbalken. Der Clip-Fleck (rot, über 0dB) ist bewusst KEIN
 * Setting (@dpa-Liste markierte ihn nicht mit *) — fest verdrahtetes Warnsignal, immer an.
 */
import { hint } from './i18n.js';

const MIN_DB = -60, MAX_DB = 6;
const norm = (db) => Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
// Skala/Limiter sind feste Zusatzspalten neben dem eigentlichen Peak-Balken (s. Kopf-Kommentar).
const SCALE_W = 20, LIM_W = 6, GAP = 3;
// 6dB-Raster von oben (+6) bis unten (-60) — Text nur an jeder ZWEITEN Stufe (alle 12dB), sonst
// wird es bei kleiner boxH eng; Striche selbst an jeder 6dB-Stufe.
const SCALE_DB = [6, 0, -6, -12, -18, -24, -30, -36, -42, -48, -54, -60];

export class LevelMeter {
    /**
     * @param {() => AnalyserNode|null} getAnalyser
     * @param {() => DynamicsCompressorNode|null} [getLimiter] – für die Reduktionsanzeige;
     *   ohne Übergabe bleibt die Limiter-Spalte einfach leer (kein Crash, s. tick()).
     */
    constructor(getAnalyser, getLimiter) {
        this._getAnalyser = getAnalyser;
        this._getLimiter = getLimiter || (() => null);
        this._buf = null;
        // Peak-Hold (weiße/eigene Linie): hält das letzte Maximum peakHoldMs lang, fällt danach
        // pro Tick um HOLD_DECAY dB (@dpa: „fällt … 'runter und hält sich … wieder auf dem
        // Maximum" — genau dieses klassische VU-Verhalten gab es schon, jetzt mit Settings).
        this._holdDb = MIN_DB;
        this._holdT = 0;
        // Peak-Balken selbst: EMA-geglättet über 'hektikMs' (@dpa: „wie hektisch die Anzeige
        // reagiert") statt roh pro Frame gezeigt — sonst flackert ein einzelner Analyser-Buffer
        // sichtbar, weil ein Musiksignal Frame für Frame stark schwankt.
        this._dispDb = MIN_DB;
        this._dispRmsDb = MIN_DB;
        this._lastT = 0;
        // Clip (@dpa: „leuchtend roter Fleck über 0dB, wenn Signal über 0dB" — kein *, also
        // fest verdrahtet statt Setting): Zeitpunkt des letzten Clips, blendet danach aus.
        this._clipT = -Infinity;
        this._fg = ''; this._holdFg = ''; this._rmsFg = ''; this._scaleFg = ''; this._limFg = '';
        this._boxSize = 20; this._boxH = 130;
        this._showScale = true; this._showRms = false; this._showLimiter = true;
        this._peakWidth = 1; this._peakHoldMs = 800; this._hektikMs = 60; this._stepGrad = false;
        this.element = document.createElement('canvas');
        this.element.className = 'level-meter';
        this._resize();
        hint(this.element, 'Pegel des Master-Ausgangs (Peak, geglättet), nach Lautstärke. Rechtsklick = Settings.');
        this._paint();
    }

    /** Canvas-Gesamtbreite/-höhe aus Balkengröße + optionalen Zusatzspalten neu setzen. */
    _resize() {
        let w = this._boxSize;
        if (this._showScale) w += GAP + SCALE_W;
        if (this._showLimiter) w += GAP + LIM_W;
        this.element.width = w;
        this.element.height = this._boxH;
    }

    /** Rechtsklick-Settings (ElementSettings type 'levelmeter'). */
    applyStyle(s) {
        this._fg = s.fg || '';
        this._holdFg = s.holdFg || '';
        this._rmsFg = s.rmsFg || '';
        this._scaleFg = s.scaleFg || '';
        this._limFg = s.limFg || '';
        this.element.style.background = s.bg || '';
        if (s.boxSize) this._boxSize = s.boxSize;
        if (s.boxH) this._boxH = s.boxH;
        this._showScale = s.showScale !== false;
        this._showRms = !!s.showRms;
        this._showLimiter = s.showLimiter !== false;
        this._peakWidth = s.peakWidth || 1;
        this._peakHoldMs = s.peakHoldMs ?? 800;
        this._hektikMs = s.hektikMs ?? 60;
        this._stepGrad = !!s.stepGrad;
        this._resize();
        this._paint();
    }

    /** Läuft im Render-Loop (wie baseKeyboard.tick/Readout.tick). */
    tick() {
        const an = this._getAnalyser();
        let peakDb = MIN_DB, rmsDb = MIN_DB;
        if (an) {
            if (!this._buf || this._buf.length !== an.fftSize) this._buf = new Float32Array(an.fftSize);
            an.getFloatTimeDomainData(this._buf);
            let sum = 0, peakLin = 0;
            for (let i = 0; i < this._buf.length; i++) {
                const v = this._buf[i];
                sum += v * v;
                const a = Math.abs(v); if (a > peakLin) peakLin = a;
            }
            const rms = Math.sqrt(sum / this._buf.length);
            rmsDb = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
            peakDb = peakLin > 0 ? 20 * Math.log10(peakLin) : MIN_DB;
        }
        peakDb = Math.max(MIN_DB, Math.min(MAX_DB, peakDb));
        rmsDb = Math.max(MIN_DB, Math.min(MAX_DB, rmsDb));

        const now = performance.now();
        const dt = this._lastT ? now - this._lastT : 16;
        this._lastT = now;
        // Symmetrische Glättung (Attack UND Release gleich schnell) über 'hektikMs' — bewusst
        // EIN Regler statt getrennter Attack/Release, wie von @dpa als „Hektik" beschrieben.
        const alpha = 1 - Math.exp(-dt / Math.max(1, this._hektikMs));
        this._dispDb += (peakDb - this._dispDb) * alpha;
        this._dispRmsDb += (rmsDb - this._dispRmsDb) * alpha;

        // Peak-Hold: sofort hoch, peakHoldMs halten, danach abfallen (klassisches VU-Verhalten).
        if (peakDb >= this._holdDb) { this._holdDb = peakDb; this._holdT = now; }
        else if (now - this._holdT > this._peakHoldMs) this._holdDb = Math.max(peakDb, this._holdDb - 0.6);

        // Clip (@dpa: „wenn Signal über 0dB") — der UNGEGLÄTTETE Peak zählt, sonst würde ein
        // kurzer Über-0dB-Ausschlag von der Glättung weggemittelt und der Fleck bliebe stumm.
        if (peakDb >= 0) this._clipT = now;

        this._paint();
    }

    /** Farbe an einer 0..1-Position entlang des Standard-Grün→Gelb→Rot-Verlaufs (für den
     *  gestuften 6dB-Modus: an der STUFENMITTE ausgewertet statt weich interpoliert). */
    _gradColorAt(t) {
        // Dieselben drei Stopps wie im Canvas-Gradient unten, hier aber als diskrete Formel,
        // weil createLinearGradient keine Einzelfarbe an einem Punkt zurückgeben kann.
        const stops = [[0, 0x6e, 0xe7, 0xa8], [0.75, 0xff, 0xd1, 0x66], [1, 0xff, 0x5a, 0x5a]];
        let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
        const [t0, r0, g0, b0] = stops[i], [t1, r1, g1, b1] = stops[i + 1];
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
        const r = Math.round(r0 + (r1 - r0) * f), g = Math.round(g0 + (g1 - g0) * f), b = Math.round(b0 + (b1 - b0) * f);
        return `rgb(${r},${g},${b})`;
    }

    _paintBar(ctx, x, w, h) {
        const barH = norm(this._dispDb) * h;
        if (this._fg) {
            ctx.fillStyle = this._fg;
            ctx.fillRect(x, h - barH, w, barH);
        } else if (this._stepGrad) {
            // 6dB-Farbstufen (@dpa: „vielleicht meter 6dB-Farbenverlauf"): pro 6dB-Band EINE
            // Flächenfarbe (Bandmitte des Verlaufs) statt weichem Übergang — klassischer
            // LED-Meter-Look. Nur der Teil eines Bands, der im gefüllten Bereich liegt, wird
            // gezeichnet (oberstes Band meist nur teilweise gefüllt).
            for (let dbHi = MAX_DB; dbHi > MIN_DB; dbHi -= 6) {
                const dbLo = dbHi - 6;
                const yHi = h - norm(dbHi) * h, yLo = h - norm(dbLo) * h;
                const top = Math.max(yHi, h - barH);
                if (top >= yLo) continue;   // Band liegt komplett über dem gefüllten Bereich
                ctx.fillStyle = this._gradColorAt(norm((dbHi + dbLo) / 2));
                ctx.fillRect(x, top, w, yLo - top);
            }
        } else {
            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#6ee7a8'); grad.addColorStop(0.75, '#ffd166'); grad.addColorStop(1, '#ff5a5a');
            ctx.fillStyle = grad;
            ctx.fillRect(x, h - barH, w, barH);
        }
        // RMS-Linie (@dpa: „rms zuschaltbar") — eigene dünne Markierung unter/auf dem Peak.
        if (this._showRms) {
            ctx.fillStyle = this._rmsFg || '#8fd3ff';
            ctx.fillRect(x, h - norm(this._dispRmsDb) * h - 1, w, 1);
        }
        // Peak-Hold-Linie (@dpa: „peak schmal (1, max 2px dick), fast weiß").
        ctx.fillStyle = this._holdFg || '#ffffff';
        ctx.fillRect(x, h - norm(this._holdDb) * h - this._peakWidth, w, this._peakWidth);
        // Clip-Fleck (@dpa: „leuchtend roter Fleck über 0dB" — fest, kein Setting): sitzt AN
        // der 0dB-Marke, blendet über ~1.2s aus, wenn kein neuer Clip nachkommt.
        const sinceClip = performance.now() - this._clipT;
        if (sinceClip < 1200) {
            const alpha = sinceClip < 150 ? 1 : Math.max(0, 1 - (sinceClip - 150) / 1050);
            const y0 = h - norm(0) * h;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff2222';
            ctx.shadowColor = '#ff2222'; ctx.shadowBlur = 4;
            ctx.fillRect(x, y0 - 3, w, 3);
            ctx.restore();
        }
    }

    _paintScale(ctx, x, h) {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = this._scaleFg || '#8a93a3';
        ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.85;
        SCALE_DB.forEach((db, i) => {
            const y = h - norm(db) * h;
            ctx.fillRect(x, y, 3, 1);
            if (i % 2 === 0) ctx.fillText(String(db), x + 5, y);
        });
        ctx.restore();
    }

    _paintLimiter(ctx, x, h) {
        const lim = this._getLimiter();
        // reduction ist ein natives DynamicsCompressorNode-Feld, IMMER <= 0 dB (0 = keine
        // Reduktion). „Rückwärts-Balken" (@dpa): füllt von OBEN statt von unten — visuell klar
        // vom Peak-Balken unterscheidbar, obwohl es dieselbe dB-Achse benutzt.
        const reduction = lim ? Math.abs(lim.reduction || 0) : 0;
        const rNorm = Math.max(0, Math.min(1, reduction / 24));   // 24dB Anzeige-Obergrenze reicht weit über jeden Alltagsfall
        ctx.fillStyle = 'rgba(255,255,255,.04)';
        ctx.fillRect(x, 0, LIM_W, h);
        if (rNorm > 0) {
            ctx.fillStyle = this._limFg || '#ff5a5a';
            ctx.fillRect(x, 0, LIM_W, rNorm * h);
        }
    }

    _paint() {
        const ctx = this.element.getContext('2d'), W = this.element.width, h = this.element.height;
        ctx.clearRect(0, 0, W, h);
        this._paintBar(ctx, 0, this._boxSize, h);
        let x = this._boxSize;
        if (this._showScale) { x += GAP; this._paintScale(ctx, x, h); x += SCALE_W; }
        if (this._showLimiter) { x += GAP; this._paintLimiter(ctx, x, h); }
    }

    mount(parent) { parent.appendChild(this.element); }
}
