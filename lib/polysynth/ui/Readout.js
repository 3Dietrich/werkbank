/**
 * Readout.js — minimaler Live-Text-Baustein (Control-Sorte `readout`, @dpa 20260722_013727:
 * „Freq-Anzeige... am besten geteilt in mehrere Control readout und texts").
 *
 * Der Typ `readout` existiert in ElementSettings.js schon länger (Settings: Textgröße,
 * Feldbreite, Farbe — bewusst OHNE Label, s. dortiger Kopf-Kommentar) und wird bereits im
 * Werkbank-Demo-Baustein (werkbank.js, oberste Zeile „Readout") vorgeführt. Diese Klasse ist
 * dieselbe Idee als eigenständiger, ENGINE-gebundener Control zum `mountInGroup`en (wie
 * BaseKeyboard/PlayKeyboard) — nur der Text-Beschaffer (`getText`) unterscheidet sich je
 * Verwendung (Tone-Name, Freq-Wert, …).
 */
import { hint } from '../../i18n.js';

export class Readout {
    /**
     * @param {() => string} getText  liefert den aktuell anzuzeigenden Text
     * @param {string} [hintText]
     */
    constructor(getText, hintText) {
        this._getText = getText;
        this._last = null;
        this.element = document.createElement('div');
        this.element.className = 'base-readout';
        if (hintText) hint(this.element, hintText);
        this.tick();
    }

    /** Läuft im Render-Loop (wie BaseKeyboard.tick) — schreibt nur bei echter Änderung ins DOM. */
    tick() {
        const t = this._getText();
        if (t === this._last) return;
        this._last = t;
        this.element.textContent = t;
    }

    mount(parent) { parent.appendChild(this.element); }
}
