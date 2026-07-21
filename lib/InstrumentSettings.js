/**
 * InstrumentSettings.js – Instrument-Settings, generalisiert (@dpa 20260721: „Instrument
 * allgemein: mit eigen Einstellungen (erstmal gleich wie Gruppen)"). Vorher gab es das nur
 * als Einzelbau für taktgeber (werkbank.js, benchHeaderSettings) — jetzt EIN wiederver-
 * wendbares Modul für jedes Instrument: BG-Farbe + Größe % (wie Gruppen-Settings), dazu
 * Verschieben per Header (@dpa 20260721: „Instrumente soll man via header verschieben
 * können").
 *
 * Verschieben: die Sektion startet im normalen Grid-Fluss (#app); der erste Drag hebt sie
 * per position:absolute an ihrer AKTUELLEN Bildschirmposition heraus (kein Sprung), von da
 * an frei ziehbar. Position wird im State gespeichert (instrPos), übersteht den Reload.
 */
import { MiniSettings } from './MiniSettings.js';

/**
 * @param {HTMLElement} sectionEl  die .wb-bench-Sektion
 * @param {object} state           MiniState dieses Instruments
 * @param {object} [opts]
 * @param {string} [opts.bodySelector]  Selektor des zu skalierenden Körpers (Default: die Sektion selbst)
 * @returns {{ scaled: () => boolean }}
 */
export function mountInstrumentSettings(sectionEl, state, opts = {}) {
    const h2 = sectionEl.querySelector(':scope > h2');
    const body = opts.bodySelector ? sectionEl.querySelector(opts.bodySelector) : sectionEl;
    const settings = new MiniSettings('Instrument');

    const applyBg = () => { sectionEl.style.background = state.get('instrBg') || ''; };
    const applyScale = () => { const s = state.get('instrScale'); if (body) body.style.zoom = (s && s !== 100) ? (s / 100) : ''; };
    const applyPos = () => {
        const p = state.get('instrPos');
        if (p) { sectionEl.style.position = 'absolute'; sectionEl.style.left = p.x + 'px'; sectionEl.style.top = p.y + 'px'; }
    };
    applyBg(); applyScale(); applyPos();

    if (h2) {
        h2.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
            settings.open(at, ({ colorA, num }) => {
                colorA('BG', {
                    get: () => state.get('instrBg') || '',
                    set: (v) => { state.set('instrBg', v); applyBg(); },
                    fallback: '#232833',
                });
                num('Größe %', {
                    min: 50, max: 200, title: 'Instrument-Größe in Prozent',
                    get: () => state.get('instrScale') || 100,
                    set: (v) => { state.set('instrScale', v); applyScale(); },
                });
            });
        });

        // Verschieben via Header (@dpa 20260721). Nicht bei Klicks auf Buttons IM Header
        // (z.B. Ein-/Ausklapp-Pfeil) — die sollen weiter normal klickbar bleiben.
        h2.style.cursor = 'grab';
        h2.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) return;
            e.preventDefault();
            const r = sectionEl.getBoundingClientRect();
            const parent = sectionEl.offsetParent;
            const parentR = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
            if (sectionEl.style.position !== 'absolute') {
                sectionEl.style.position = 'absolute';
                sectionEl.style.left = (r.left - parentR.left) + 'px';
                sectionEl.style.top = (r.top - parentR.top) + 'px';
            }
            const startX = e.clientX, startY = e.clientY;
            const baseX = parseFloat(sectionEl.style.left) || 0;
            const baseY = parseFloat(sectionEl.style.top) || 0;
            h2.style.cursor = 'grabbing';
            const onMove = (ev) => {
                sectionEl.style.left = (baseX + ev.clientX - startX) + 'px';
                sectionEl.style.top = (baseY + ev.clientY - startY) + 'px';
            };
            const onUp = () => {
                h2.style.cursor = 'grab';
                state.set('instrPos', { x: parseFloat(sectionEl.style.left) || 0, y: parseFloat(sectionEl.style.top) || 0 });
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    return { scaled: () => (state.get('instrScale') || 100) !== 100 };
}
