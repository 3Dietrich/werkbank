/**
 * HintBubble.js — schwebende Hilfe-Blase für Hover-Hints (@dpa 20260720).
 *
 * werkbank hatte bisher keinen Renderer: `hint()` (i18n.js) legt den Text nur in `data-hint`
 * ab, aber nichts zeigte ihn. Diese Blase macht die Hints sichtbar UND global abschaltbar
 * (Header-Knopf „Hints") — genau das, was ein natives `title` nicht kann.
 *
 * Für Controls (data-ctrl) zieht sie den EDITIERTEN Hilfetext (state.hintText[id]) bzw. den
 * Auslieferungstext (hints.js) — also dasselbe, was das ?-Feld in den Settings pflegt.
 *
 * Markdown (@dpa 20260722_152438, ddw.md: „für die Controls als auch alle anderen Fließtexte"
 * dasselbe Markdown wie bei der Instrument-Hilfe) — rendert über dieselbe miniMarkdown.js wie
 * das [?]-Popover (werkbank.js mountBenchHelp), gleiche Typografie-Klasse (.wb-help-body) für
 * einheitliche Optik. Reiner Text ohne Markdown-Syntax rendert unverändert wie vorher.
 */
import { mdToHtml } from './miniMarkdown.js';

export class HintBubble {
    /** @param {(el:HTMLElement)=>string} resolve  liefert den Hint-Text zu einem Element ('' = keiner) */
    constructor(resolve, opts = {}) {
        this._resolve = resolve;
        this._enabled = opts.enabled !== false;
        this._delay = opts.delay ?? 450;
        this._bubble = null;
        this._timer = 0;
        this._curEl = null;
        this._lastXY = { x: 0, y: 0 };
        const root = opts.root || document.body;
        root.addEventListener('mousemove', (e) => this._onMove(e));
        root.addEventListener('mouseleave', () => this._hide(), true);
        // Beim Scrollen/Ziehen: Blase weg (Position würde sonst „kleben").
        window.addEventListener('scroll', () => this._hide(), true);
        window.addEventListener('mousedown', () => this._hide(), true);
    }

    enable(on) { this._enabled = !!on; if (!on) this._hide(); }
    isEnabled() { return this._enabled; }

    _onMove(e) {
        if (!this._enabled) return;
        this._lastXY = { x: e.clientX, y: e.clientY };
        // Das nächste Element mit einem auflösbaren Hint suchen (Control oder data-hint).
        const el = e.target.closest && e.target.closest('[data-ctrl], [data-hint]');
        if (!el) { this._hide(); return; }
        if (el === this._curEl) { if (this._bubble) this._place(); return; }
        this._curEl = el;
        clearTimeout(this._timer);
        if (this._bubble) this._bubble.remove(), this._bubble = null;
        this._timer = setTimeout(() => {
            const txt = this._resolve(el);
            if (!txt) return;
            this._show(txt);
        }, this._delay);
    }

    _show(txt) {
        this._bubble = document.createElement('div');
        this._bubble.className = 'hint-bubble';
        const body = document.createElement('div');
        body.className = 'wb-help-body';
        body.innerHTML = mdToHtml(txt);
        this._bubble.appendChild(body);
        document.body.appendChild(this._bubble);
        this._place();
    }
    _place() {
        if (!this._bubble) return;
        const { x, y } = this._lastXY;
        const b = this._bubble.getBoundingClientRect();
        let left = x + 14, top = y + 16;
        if (left + b.width + 8 > window.innerWidth) left = x - b.width - 12;
        if (top + b.height + 8 > window.innerHeight) top = y - b.height - 12;
        this._bubble.style.left = Math.max(6, left) + 'px';
        this._bubble.style.top = Math.max(6, top) + 'px';
    }
    _hide() {
        clearTimeout(this._timer); this._timer = 0; this._curEl = null;
        if (this._bubble) { this._bubble.remove(); this._bubble = null; }
    }
}
