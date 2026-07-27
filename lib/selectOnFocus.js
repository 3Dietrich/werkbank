/**
 * selectOnFocus.js — jedes Zahl-/Text-Eingabefeld selektiert beim Fokussieren seinen
 * gesamten Inhalt (ddw.md 20260727_135331, @dpa: "die Edit Felder mit Zahlen oder Text
 * sollen bei ihrer Selektion selektiert werden [...] Das funktioniert bereits mit Tab
 * Taste, aber noch nicht beim Anklicken" — entspricht dem längst etablierten Farbfeld-
 * Verhalten, "Klick in Farb-/Werteingabe selektiert immer gesamten Inhalt").
 *
 * EIN document-weiter capture-Listener statt dutzender Einzel-Verdrahtungen in
 * KnobMetaEditor/ElementSettings/MiniSettings/GroupHost/… — neue Eingabefelder
 * bekommen das Verhalten automatisch, ohne dass man beim Bauen daran denken muss.
 * `focus` bubblt nicht, capture-Phase auf `document` fängt es trotzdem für jedes
 * Element im Baum ab.
 */
export function installSelectOnFocus() {
    document.addEventListener('focus', (e) => {
        const el = e.target;
        if (el instanceof HTMLTextAreaElement) { el.select(); return; }
        if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number')) el.select();
    }, true);
}
