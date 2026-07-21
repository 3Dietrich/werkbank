/**
 * SizeHint.js – Größen-Änderungs-Hinweis (@dpa 20260721): flüchtige Blase am Control, wenn
 * dessen Größe durch eine GRUPPEN- oder INSTRUMENT-weite Skalierung geändert wird (nicht bei
 * manuellem Resize des Controls selbst — dafür gibt es keinen Aufruf hierher). Lineare
 * Gate-ASR-Anzeige [0.5, 2, 0.5]s (Attack/Hold/Release), CSS-getrieben (main.css:
 * @keyframes size-hint-asr). Doppelklick = global „zeig nicht mehr" — EIN State-Flag für
 * alle Controls, kein Flag pro Control.
 */
const FLAG_KEY = 'sizeHintDismissed';

export function createSizeHintSystem(state) {
    const dismissed = () => !!state.get(FLAG_KEY);
    function dismissAll() {
        state.set(FLAG_KEY, true);
        document.querySelectorAll('.size-hint-bubble').forEach((el) => el.remove());
    }
    function show(el, text) {
        if (dismissed() || !el) return;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;   // unsichtbares/entferntes Control überspringen
        const bubble = document.createElement('div');
        bubble.className = 'size-hint-bubble';
        bubble.textContent = text;
        bubble.title = 'Doppelklick: nicht mehr anzeigen';
        document.body.appendChild(bubble);
        bubble.style.left = Math.max(4, r.left) + 'px';
        bubble.style.top = Math.max(4, r.top - bubble.offsetHeight - 6) + 'px';
        bubble.addEventListener('dblclick', dismissAll);
        setTimeout(() => bubble.remove(), 3000);   // Envelope-Länge: 0.5+2+0.5s
    }
    /** Für jedes Control-Element (data-ctrl) innerhalb `root` eine Blase zeigen. */
    function showAll(root, text) {
        if (dismissed() || !root) return;
        root.querySelectorAll('[data-ctrl]').forEach((el) => show(el, text));
    }
    return { show, showAll, dismissAll, dismissed };
}
