/**
 * SizeHint.js – Größen-Änderungs-Hinweis (@dpa 20260721, korrigiert 20260721_162648:
 * „nee, falsch … Der Hinweis soll in den control settings erscheinen, und zwar immer
 * wenn man control settings aufruft, bis man es global dismissed hat").
 *
 * NICHT mehr eine flüchtige Bubble bei der Skalierungs-ÄNDERUNG (erste, falsche Fassung)
 * — sondern: jedes Mal, wenn das Settings-Panel eines Controls geöffnet wird, DAS dessen
 * Größe gerade durch eine Gruppen- oder Instrument-weite Skalierung beeinflusst wird
 * (nicht bei manuellem Control-Resize), erscheint dort ein Hinweis — lineare Gate-ASR
 * [0.5, 2, 0.5]s (Timing @dpa bestätigt „super"). Doppelklick = global „zeig nicht mehr"
 * (EIN State-Flag für alle Controls, überlebt den Reload).
 */
const FLAG_KEY = 'sizeHintDismissed';

export function createSizeHintSystem(state) {
    const dismissed = () => !!state.get(FLAG_KEY);
    function dismissAll() { state.set(FLAG_KEY, true); }

    /** Hinweis INS bereits geöffnete Settings-Panel einfügen (nicht schwebend). Entfernt
     *  einen evtl. vorher dort stehenden Hinweis zuerst (das Panel ist ein Singleton, das
     *  bei jedem open() wiederverwendet wird). */
    function showInline(panelEl, text) {
        panelEl.querySelectorAll(':scope > .size-hint-inline').forEach((n) => n.remove());
        if (dismissed() || !panelEl || !text) return;
        const el = document.createElement('div');
        el.className = 'size-hint-inline';
        el.textContent = text;
        el.title = 'Doppelklick: nicht mehr anzeigen';
        el.addEventListener('dblclick', () => { dismissAll(); el.remove(); });
        panelEl.appendChild(el);
        setTimeout(() => el.remove(), 3000);   // Envelope-Länge: 0.5+2+0.5s (Panel bleibt offen)
    }
    return { showInline, dismissAll, dismissed };
}
