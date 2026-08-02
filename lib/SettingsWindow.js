/**
 * SettingsWindow.js — DAS Einstellungs-Fenster der Werkbank (ein Fenster für alle Einstiege).
 *
 * ── Warum es das gibt (@dpa dd.md 20260802) ──────────────────────────────────────────
 * Vorher war das ⚙-Config ein `MiniSettings`-Popover: dasselbe schwebende Panel, das auch
 * ein Regler oder eine Seq-Anzeige per Rechtsklick aufmacht. Genau das war der Fehler —
 * @dpa: „es ist derzeit zu wenig ‚Einstellungs'-mäßig". Ein Rechtsklick-Panel meint EIN
 * Element; ein Einstellungs-Fenster meint das ganze Werkzeug. Wenn beides gleich aussieht,
 * sieht man dem ⚙ nicht an, dass es die andere Sorte ist.
 *
 * Vorbild ist teslacoils `openSettings()` (js/app.js): abgedunkelter Hintergrund, EIN graues
 * Fenster in der Mitte, Zahnrad im Kopf, pro Thema ein Abschnitt, **nach unten offen** — ein
 * weiterer Abschnitt ist ein Aufruf mehr, kein Umbau. Übernommen wurde das Design, NICHT die
 * langen Erklärabsätze: @dpa: „Mit den Hilfstexten ist in teslacoil ein bisschen überflüssig,
 * wenn diese Text in das mittelgroße Icon ‚i' … zum anklicken = markup lesen kriegt, dann
 * braucht es nicht so viel Platz." Also steht die Erklärung hinter dem i-Icon der
 * Abschnitts-Überschrift (Markdown, dieselbe Optik wie die ISM-Beschreibungen in
 * `.wb-help-pop`), und das Fenster bleibt kurz.
 *
 * ── Warum GEMEINSAM statt je Einstieg ────────────────────────────────────────────────
 * Der cfgPanel-Aufbau stand bis hierhin 1:1 doppelt in `werkbank.js` und
 * `werkbank-leer/werkbank-leer.js`. Die Werkbank ist aber ein POOL von Einstiegen
 * (s. ARCHITEKTUR.md) und wächst um weitere Kopien — bei n Einstiegen wären es n Kopien
 * derselben Änderung. Ab hier beschreibt jeder Einstieg nur noch SEINE Abschnitte, die
 * Chrome (Overlay, Kopf, Scrollen, Schließen, i-Popover) wohnt hier.
 *
 * ── Naht ──────────────────────────────────────────────────────────────────────────────
 * `new SettingsWindow().open(build, onClose)`; `build` bekommt die Feld-Helfer und beschreibt
 * damit den Inhalt — das Fenster weiß nichts über Labels, Sprache oder Export. Dieselbe
 * Bau-per-Callback-Naht wie `MiniSettings`, damit man nicht zwei Denkweisen im Kopf haben
 * muss; die Helfer heißen bewusst gleich (`section`, `num`, `color`, `colorA`, `full`, `raw`).
 */
import { icon } from './icons.js';
import { mdToHtml } from './miniMarkdown.js';
import { colorPickerBusy, upgradeColorInputs } from './colorPick.js';
import { Knob } from './Knob.js';
import { parseHex, parseA, hexA } from './rgba.js';
import { text as i18nText, hint, lang as curLang, onLangChange } from './i18n.js';
import { makeDraggable } from './dragPanel.js';
import { lsKey } from './appId.js';

/**
 * Das i-Icon hinter einer Abschnitts-Überschrift: klickt man drauf, erklärt ein Popover den
 * Abschnitt (Markdown). Bewusst KEIN Hover-Hint als einziger Weg — eine Erklärung, die man
 * nur zufällig findet, ist keine; und ein dauerhaft sichtbarer Absatz kostet den Platz,
 * den @dpa gerade sparen will.
 *
 * `md` ist entweder ein String oder ein `{ de, en }`-Paar. Mehrsätzige Markdown-Blöcke
 * laufen NICHT über lib/i18n.js: dort ist der deutsche Satz der Schlüssel, was bei einem
 * Absatz einen unhandlichen Schlüssel gäbe und bei jeder Textkorrektur still die
 * Übersetzung verlöre. Dasselbe Muster wie BENCH_HELP_EN in werkbank.js.
 */
function makeInfoIcon(md) {
    const btn = document.createElement('button');
    btn.className = 'sw-info'; btn.type = 'button';
    btn.appendChild(icon('info', 14));
    hint(btn, 'Erklärung anzeigen');
    let pop = null;
    const close = () => {
        if (!pop) return;
        pop.remove(); pop = null; btn.classList.remove('active');
        document.removeEventListener('mousedown', onOut, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const onOut = (e) => { if (pop && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
    // ESC schließt NUR das Popover und stoppt dort — sonst risse dieselbe Taste das ganze
    // Einstellungs-Fenster mit weg, obwohl man erkennbar nur die Erklärung zumachen wollte.
    const onKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } };
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pop) { close(); return; }
        pop = document.createElement('div');
        pop.className = 'wb-help-pop sw-info-pop';
        const src = typeof md === 'string' ? md : (curLang() === 'en' ? (md.en || md.de) : md.de);
        pop.innerHTML = `<div class="wb-help-body">${mdToHtml(src)}</div>`;
        document.body.appendChild(pop);
        btn.classList.add('active');
        const r = btn.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = (r.bottom + 6) + 'px';
        // Das Fenster steht in der oberen Bildhälfte; ein Popover an einem tiefen Abschnitt
        // kann trotzdem unten anstoßen — dann klappt es über das Icon statt darunter.
        if (pop.getBoundingClientRect().bottom > window.innerHeight - 8) {
            pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px';
        }
        setTimeout(() => {
            document.addEventListener('mousedown', onOut, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    });
    btn._closeInfo = close;
    btn._infoOpen = () => !!pop;
    return btn;
}

export class SettingsWindow {
    /** @param {string} [title] – Kopfzeile (übersetzt) */
    constructor(title = 'Einstellungen') {
        this._title = title;
        this._ov = null;
        this._infos = [];
    }

    get isOpen() { return !!this._ov; }

    /**
     * Öffnen.
     * @param {(f:{section:Function, row:Function, num:Function, text:Function, select:Function,
     *            color:Function, colorA:Function, raw:Function, full:Function, note:Function}) => void} build
     * @param {()=>void} [onClose] – z.B. um den Header-Knopf wieder aus 'active' zu nehmen
     */
    open(build, onClose) {
        this.close();
        this._onClose = onClose || null;
        this._infos = [];

        const ov = document.createElement('div'); ov.className = 'sw-overlay';
        ov.addEventListener('mousedown', (e) => {
            // Ein offener Farbwähler hängt an <body>, nicht im Fenster — ohne diese Ausnahme
            // risse der Klick, mit dem man ihn zumacht, das ganze Fenster mit weg (derselbe
            // Fall wie in MiniSettings._outside).
            if (e.target === ov && !colorPickerBusy(this._win)) this.close();
        });
        const win = document.createElement('div'); win.className = 'sw-window';
        win.addEventListener('mousedown', (e) => e.stopPropagation());
        this._win = win;

        const head = document.createElement('div'); head.className = 'sw-head';
        head.appendChild(icon('gear', 16));
        const title = document.createElement('span');
        i18nText(title, this._title);
        head.appendChild(title);
        const x = document.createElement('button');
        x.className = 'sw-close'; x.type = 'button';
        x.appendChild(icon('close', 12));
        hint(x, 'Schließen');
        x.addEventListener('click', () => this.close());
        head.appendChild(x);
        win.appendChild(head);

        const body = document.createElement('div'); body.className = 'sw-body';
        win.appendChild(body);

        // Jeder Abschnitt sammelt seine Zeilen selbst — dadurch ist „ein Thema mehr" wirklich
        // nur ein `section()`-Aufruf mehr, ohne dass irgendwo eine Reihenfolge gepflegt wird.
        let cur = null;

        /**
         * Neues Thema.
         * @param {string} label – Überschrift
         * @param {string} [scope] – Reichweite als kurzes Wort rechts in der Kopfzeile
         *        („gilt überall" / „nur dieser Einstieg"). @dpa dd.md 20260802 vermisste
         *        genau diese Trennung; sie gehört an die Überschrift, weil man sie beim
         *        Bedienen sehen muss — nicht ins i-Popover, das man erst aufklappt.
         * @param {string} [infoMd] – die Erklärung hinter dem i-Icon (Markdown)
         */
        const section = (label, scope, infoMd) => {
            const sec = document.createElement('section'); sec.className = 'sw-sec';
            const h = document.createElement('div'); h.className = 'sw-subhead';
            const sp = document.createElement('span'); i18nText(sp, label); h.appendChild(sp);
            if (infoMd) { const info = makeInfoIcon(infoMd); this._infos.push(info); h.appendChild(info); }
            if (scope) {
                const sc = document.createElement('span'); sc.className = 'sw-scope';
                i18nText(sc, scope); h.appendChild(sc);
            }
            sec.appendChild(h);
            const rows = document.createElement('div'); rows.className = 'sw-rows';
            sec.appendChild(rows);
            body.appendChild(sec);
            cur = rows;
            return sec;
        };

        const row = (label, ...els) => {
            if (!cur) section('');
            const r = document.createElement('div'); r.className = 'sw-row';
            if (label) { const l = document.createElement('label'); i18nText(l, label); r.appendChild(l); }
            els.forEach((e) => r.appendChild(e));
            cur.appendChild(r);
            return r;
        };

        /** Zahlenfeld. `get`/`set` sprechen direkt mit dem Besitzer (State o.ä.). */
        const num = (label, { min, max, get, set, title: ttl }) => {
            const i = document.createElement('input');
            i.type = 'number'; i.min = min; i.max = max; i.step = 1; i.value = get();
            i.className = 'sw-num';
            if (ttl) hint(i, ttl);
            i.addEventListener('input', () => {
                const v = parseInt(i.value);
                if (!isNaN(v)) set(Math.max(min, Math.min(max, v)));
            });
            row(label, i);
            return i;
        };

        /** Textfeld. */
        const textField = (label, { get, set, placeholder, title: ttl }) => {
            const i = document.createElement('input');
            i.type = 'text'; i.className = 'sw-text'; i.value = get() || '';
            if (placeholder) i.placeholder = placeholder;
            if (ttl) hint(i, ttl);
            // Klick in Werteingaben selektiert immer den gesamten Inhalt (Music-weit).
            i.addEventListener('focus', () => i.select());
            i.addEventListener('input', () => set(i.value));
            row(label, i);
            return i;
        };

        /**
         * Auswahlmenü (@dpa dd.md 20260802: „ein menu [deutsch,English], nach dem Umstellen
         * ist alles english"). Zwei Knöpfe nebeneinander sind eine Entweder-oder-Anzeige;
         * ein Menü ist der Ort, an dem man eine EINSTELLUNG erwartet — und es bleibt kurz,
         * wenn später eine dritte Sprache dazukommt.
         */
        const select = (label, { options, get, set, title: ttl }) => {
            const s = document.createElement('select'); s.className = 'sw-select';
            options.forEach(([value, name]) => {
                const o = document.createElement('option'); o.value = value; o.textContent = name;
                s.appendChild(o);
            });
            s.value = get();
            if (ttl) hint(s, ttl);
            s.addEventListener('change', () => set(s.value));
            row(label, s);
            return s;
        };

        /** Reiner Farbwähler (ohne Deckkraft). */
        const color = (label, { get, set, title: ttl }) => {
            const c = document.createElement('input');
            c.type = 'color'; c.value = get();
            if (ttl) hint(c, ttl);
            c.addEventListener('input', () => set(c.value));
            row(label, c);
            return c;
        };

        /** Farbwähler + Deckkraft als rgba() (Alpha als Mini-Knob, wie in MiniSettings). */
        const colorA = (label, { get, set, fallback = '#5ad1ff' }) => {
            const c = document.createElement('input');
            c.type = 'color'; c.value = parseHex(get(), fallback);
            const knob = new Knob({
                label: 'A', min: 0, max: 1, step: 0.01, curve: 'linear', decimals: 2,
                viewSize: 'mini', hideValue: true, value: parseA(get(), 1),
                onChange: (v) => set(hexA(c.value, v)),
            });
            c.addEventListener('input', () => set(hexA(c.value, knob.value)));
            return row(label, c, knob.element);
        };

        /** Beliebiges fertiges Element mit Label in eine Zeile hängen. */
        const raw = (label, el) => row(label, el);

        /** Beliebiges Element OHNE Label, volle Breite (z.B. eine Knopfreihe). */
        const full = (el) => {
            if (!cur) section('');
            const r = document.createElement('div'); r.className = 'sw-row sw-row-full';
            r.appendChild(el);
            cur.appendChild(r);
            return r;
        };

        /** Kurze Zeile Kleingedrucktes im Abschnitt (für den EINEN Fakt, der nicht ins
         *  i-Popover gehört, weil man ihn beim Bedienen sehen muss — z.B. welcher Einstieg). */
        const note = (txt) => {
            if (!cur) section('');
            const p = document.createElement('div'); p.className = 'sw-note';
            p.textContent = txt;
            cur.appendChild(p);
            return p;
        };

        build({ section, row, num, text: textField, select, color, colorA, raw, full, note });

        ov.appendChild(win);
        document.body.appendChild(ov);
        upgradeColorInputs(win);   // eigener kompakter Farbwähler statt des nativen
        this._ov = ov;

        // Per Header-Drag verschiebbar (@dpa ddw.md 20260802, Punkt 4 „Config": „verschiebbar
        // machen (über header drag)"), Vorbild teslacoils dragPanel.js-Nutzung bei
        // KnobMetaEditor/ElementSettings (s. lib/ElementSettings.js `makeDraggable`-Aufruf).
        // `.sw-window` sitzt normalerweise flex-zentriert im Overlay (kein eigenes position/
        // left/top) — makeDraggable braucht `position:fixed` + Px-Koordinaten. Ohne gespeicherte
        // Position bleibt die erste Öffnung exakt wie bisher (Rect NACH dem Einhängen abgelesen,
        // dann erst auf fixed umgestellt = kein sichtbarer Sprung); eine gespeicherte Position
        // (pro Einstieg via lsKey, @dpa ddw.md 20260726 „Positionen aller verschiebbarer Fenster
        // sollen ihre Position merken") schlägt die Zentrierung ab dem zweiten Mal.
        const savedPos = this._loadPos();
        const r = win.getBoundingClientRect();
        win.style.position = 'fixed';
        win.style.margin = '0';
        win.style.left = (savedPos ? savedPos.x : r.left) + 'px';
        win.style.top = (savedPos ? savedPos.y : r.top) + 'px';
        makeDraggable(win, head, (pos) => this._savePos(pos));

        this._onKey = (e) => {
            if (e.key !== 'Escape' || !this._ov) return;
            e.stopPropagation();
            // Ein offenes i-Popover geht vor: beide Listener hängen am selben Knoten
            // (document, capture) und feuern in Registrierungsreihenfolge — das Fenster war
            // zuerst da, sein Escape käme also IMMER vor dem des Popovers. Ohne diese
            // Abfrage risse die erste Escape-Taste das ganze Fenster mit weg, obwohl
            // erkennbar nur die gerade gelesene Erklärung gemeint war.
            const openInfo = this._infos.find((b) => b._infoOpen && b._infoOpen());
            if (openInfo) { openInfo._closeInfo(); return; }
            this.close();
        };
        document.addEventListener('keydown', this._onKey, true);
        // Sprachwechsel wirkt live (i18n zieht Labels/Hints selbst nach) — nur die
        // i-Popover-Texte werden beim Öffnen gerendert, also offene zumachen.
        this._offLang = onLangChange(() => this._infos.forEach((b) => b._closeInfo && b._closeInfo()));
    }

    close() {
        if (!this._ov) return;
        this._infos.forEach((b) => b._closeInfo && b._closeInfo());
        this._infos = [];
        this._ov.remove(); this._ov = null; this._win = null;
        document.removeEventListener('keydown', this._onKey, true);
        if (this._offLang) { this._offLang(); this._offLang = null; }
        if (this._onClose) { const fn = this._onClose; this._onClose = null; fn(); }
    }

    /** Fenster-Position (@dpa ddw.md 20260802 Punkt 4) — eigener, lsKey-gescopter Roh-Key
     *  statt eines MiniState (SettingsWindow kennt „seinen" State nicht, ist pro Einstieg
     *  wiederverwendbar wie ElementSettings/KnobMetaEditor). Defensiv: ein kaputter/fremder
     *  localStorage-Eintrag darf das Fenster nie am Öffnen hindern (Fallback = Zentrierung). */
    _loadPos() {
        try {
            const raw = localStorage.getItem(lsKey('cfgWinPos'));
            const p = raw ? JSON.parse(raw) : null;
            return (p && Number.isFinite(p.x) && Number.isFinite(p.y)) ? p : null;
        } catch { return null; }
    }
    _savePos(pos) {
        try { localStorage.setItem(lsKey('cfgWinPos'), JSON.stringify(pos)); } catch { /* Storage voll/gesperrt — kein Absturz */ }
    }
}
