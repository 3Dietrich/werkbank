/**
 * dragPanel.js – Ein schwebendes Panel an seiner Titelleiste verschiebbar machen.
 *
 * @dpa 20260716_023817: „die Settings müssen verschoben werden können! via click und drag
 * auf deren [Kopfzeile]". Die Settings öffnen neben ihrem Control – und liegen damit
 * zwangsläufig über dem, was man beim Einstellen sehen will (Nachbarregler, Gruppe).
 * Statt die Aufklapp-Logik zu verkomplizieren: einfach wegschieben können.
 *
 * Persistenz (@dpa ddw.md 20260726: „die Positionen aller verschiebbarer Fenster sollen
 * ihre Position merken, wenn sie geschlossen werden") — kehrt die ursprüngliche Entscheidung
 * oben bewusst um: optionaler `onDragEnd(pos)`-Callback, den der Aufrufer nutzt, um die
 * Position (z.B. in einem State-Key wie `instrPos`) zu sichern und beim nächsten Öffnen
 * wiederherzustellen. Ohne dritten Parameter unverändertes altes Verhalten (kein Callback).
 */

/**
 * @param {HTMLElement} panel  – das Panel (position: fixed, left/top in px)
 * @param {HTMLElement} handle – der Greifbereich (Titelleiste)
 * @param {(pos:{x:number,y:number})=>void} [onDragEnd] – wird beim Loslassen mit der
 *        finalen Position aufgerufen (für Persistenz durch den Aufrufer).
 */
export function makeDraggable(panel, handle, onDragEnd) {
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => {
        // Der Schließen-Knopf (und alles andere Bedienbare) in der Leiste bleibt Klick.
        if (e.target.closest('button, input, select')) return;
        e.preventDefault();
        const r = panel.getBoundingClientRect();
        const ox = e.clientX - r.left, oy = e.clientY - r.top;
        let lastX = r.left, lastY = r.top;
        const onMove = (ev) => {
            // Im Fenster halten: der Greifpunkt darf nicht hinter den Rand wandern, sonst
            // ist das Panel nicht mehr zurückzuholen.
            const x = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - ox));
            const y = Math.max(0, Math.min(window.innerHeight - 20, ev.clientY - oy));
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            lastX = x; lastY = y;
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (typeof onDragEnd === 'function') onDragEnd({ x: lastX, y: lastY });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });
}
