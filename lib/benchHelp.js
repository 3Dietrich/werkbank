/**
 * benchHelp.js — [?]-Hilfe-Popover im Instrument-Header (@dpa 20260722, editierbar).
 *
 * Vorher byte-identisch (bis auf Kommentare) dreifach dupliziert in overcord/werkbank.js,
 * werkbank-leer/werkbank-leer.js und pitchosc/pitchosc.js (@dpa 20260804, Auslöser: „wie
 * sieht es mit all den anderen Elementen aus?" — s. lib/adsrPanel.js/lib/scope/
 * multiScope.js für dieselbe Art Fund). Jetzt EINE Quelle, jeder Einstiegspunkt ruft nur
 * noch mit seiner eigenen `BENCH_HELP_EN`-Übersetzungstabelle auf:
 *
 *   mountBenchHelp('bench-taktgeber', taktState, BENCH_HELP_EN);
 *
 * Titel im Popover = der Instrumenten-Name selbst, direkt editierbar (@dpa 20260722_130710:
 * „auch den Titel editierbar machen … beides, es braucht keine extra Überschrift") — die
 * alte separate <summary>-Überschrift ist raus, statt zwei Titeln (Popover-Caption +
 * Instrumenten-Name) gibt es nur noch EINEN. Teilt sich den `instrName`-State-Key mit
 * lib/InstrumentSettings.js (Rechtsklick-Kopfzeile → „Name"), also dieselbe Naht, kein
 * zweiter Persistenz-Pfad — hier zusätzlich noch das `.wb-instr-name`-Span direkt
 * nachgezogen, weil InstrumentSettings' eigenes applyName() an dieser Stelle noch nicht
 * gemountet ist (Aufruf-Reihenfolge: mountBenchHelp vor mountInstrumentSettings).
 *
 * Icon wie ein „i"-Info-Kreis statt eines reinen "?"-Zeichens (lib/icons.js: 'info'), zeigt
 * bei Hover die ECHTE Beschreibung (nicht den generischen title="Beschreibung anzeigen").
 * updateBtnHint() hält den Hover-Text mit dem jeweils aktuellen Beschreibungstext synchron
 * (auch nach dem Markdown-Editieren).
 */
import { hint, lang as curLang, onLangChange } from './i18n.js';
import { icon } from './icons.js';
import { mdToHtml, htmlToMdApprox } from './miniMarkdown.js';

/** `benchHelpEn`: Objekt `{ [sectionId]: htmlString }` mit der EN-Fassung des Standard-
 *  Hilfetexts (aus dem `.wb-note`-Block der jeweiligen `.wb-bench`-Sektion). Fehlt ein
 *  Eintrag, bleibt die deutsche Fassung auch im EN-Modus stehen (Fallback). */
export function mountBenchHelp(sectionId, state, benchHelpEn = {}) {
    const section = document.querySelector('#' + sectionId);
    if (!section) return;
    const note = section.querySelector(':scope > .wb-note');
    const h2 = section.querySelector('h2');
    if (!h2) return;
    let defaultBodyHtmlDe = '';
    if (note) {
        const clone = note.cloneNode(true);
        const s = clone.querySelector('summary'); if (s) s.remove();
        defaultBodyHtmlDe = clone.innerHTML.trim();
        note.remove();
    }
    const defaultBodyHtmlEn = benchHelpEn[sectionId] || defaultBodyHtmlDe;
    const defaultBodyHtml = () => (curLang() === 'en' ? defaultBodyHtmlEn : defaultBodyHtmlDe);
    const instrNameEl = h2.querySelector('.wb-instr-name');
    const defaultInstrName = instrNameEl ? instrNameEl.textContent.trim() : '';

    const btn = document.createElement('button');
    btn.className = 'wb-help-btn'; btn.type = 'button';
    btn.appendChild(icon('info', 14));
    h2.appendChild(btn);
    /** Hover-Hint des [?]-Buttons auf den AKTUELLEN Beschreibungstext ziehen (Klartext, kein
     *  Markdown/HTML — die Blase zeigt textContent, s. HintBubble.js). */
    function updateBtnHint() {
        const md = state.get('instrHelpMd');
        const html = md ? mdToHtml(md) : defaultBodyHtml();
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const plain = tmp.textContent.trim().replace(/\s+/g, ' ');
        hint(btn, plain || 'Beschreibung');
    }
    updateBtnHint();

    let pop = null, editing = false;
    const close = () => {
        if (!pop) return;
        pop.remove(); pop = null; editing = false; btn.classList.remove('active');
        document.removeEventListener('mousedown', onOut, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn) close(); };
    const onKey = (e) => {
        if (e.key !== 'Escape' || !pop) return;
        e.stopPropagation();
        if (editing) { editing = false; render(); } else close();
    };

    function render() {
        pop.innerHTML = '';
        const head = document.createElement('div'); head.className = 'wb-help-headrow';
        const titleIn = document.createElement('input');
        titleIn.type = 'text'; titleIn.className = 'wb-help-title-input';
        titleIn.value = state.get('instrName') || defaultInstrName;
        titleIn.placeholder = defaultInstrName;
        titleIn.title = 'Instrumenten-Name (überall im Header sichtbar)';
        titleIn.addEventListener('focus', () => titleIn.select());
        titleIn.addEventListener('mousedown', (e) => e.stopPropagation());
        titleIn.addEventListener('input', () => {
            state.set('instrName', titleIn.value);
            if (instrNameEl) instrNameEl.textContent = titleIn.value || defaultInstrName;
        });
        titleIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') titleIn.blur(); });
        head.appendChild(titleIn);
        const editBtn = document.createElement('button');
        editBtn.className = 'wb-help-edit'; editBtn.type = 'button';
        editBtn.title = 'Hilfe als Markdown bearbeiten';
        editBtn.appendChild(icon('edit', 13));
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); editing = true; render(); });
        head.appendChild(editBtn);
        pop.appendChild(head);

        if (editing) {
            const ta = document.createElement('textarea'); ta.className = 'wb-help-edit-area';
            ta.value = state.get('instrHelpMd') || htmlToMdApprox(defaultBodyHtml());
            pop.appendChild(ta);
            const foot = document.createElement('div'); foot.className = 'wb-help-foot';
            const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Speichern';
            save.addEventListener('click', (e) => { e.stopPropagation(); state.set('instrHelpMd', ta.value.trim()); editing = false; render(); updateBtnHint(); });
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Abbrechen';
            cancel.addEventListener('click', (e) => { e.stopPropagation(); editing = false; render(); });
            foot.append(save, cancel); pop.appendChild(foot);
            ta.focus();
        } else {
            const body = document.createElement('div'); body.className = 'wb-help-body';
            const md = state.get('instrHelpMd');
            body.innerHTML = md ? mdToHtml(md) : defaultBodyHtml();
            pop.appendChild(body);
        }
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pop) { close(); return; }
        pop = document.createElement('div'); pop.className = 'wb-help-pop';
        document.body.appendChild(pop);
        render();
        btn.classList.add('active');
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (r.bottom + 6) + 'px';
        setTimeout(() => { document.addEventListener('mousedown', onOut, true); document.addEventListener('keydown', onKey, true); }, 0);
    });

    onLangChange(() => { updateBtnHint(); if (pop && !editing) render(); });
}
