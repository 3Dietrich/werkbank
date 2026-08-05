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
 *
 * Name + Breite/Höhe (@dpa 20260721_203557, „ism Name" · „ism breite, höhe (0 auto)"):
 * wie bei den Gruppen-Settings (GroupHost.js) — Name überschreibt den Anzeigetext im
 * `.wb-instr-name`-Span, Breite/Höhe sind Grundmaße am Körper (`opts.bodySelector`),
 * leer/0 = auto (Fluss-Layout).
 *
 * Sichtbar-Umschalter (ddw.md 20260803_135251, @dpa: „es gibt für das Ensemble ja kein
 * extra Setting … das wäre gut, um ISM auch wegschalten zu können, so wie in den Gruppen
 * die Controls"): 1:1 dasselbe UI-Muster wie der Panel?-Umschalter bei Controls
 * (GroupHost.js `ctrlOffPanel`, Icon-Knopf `panelIn`/`panelOut`) — nur eine Ebene höher.
 * State-Key `ismHidden` lebt in DIESEM ISM-State (wie `instrPos`/`instrBg`), NICHT in den
 * ismSnaps (das sind Sound-Werte, `ismHidden` ist Layout). Versteckt die ganze `.wb-bench`-
 * Sektion per CSS-Klasse `.ism-hidden` (css/main.css) — bleibt im DOM stehen wie
 * `.ctrl-offpanel`. Damit ein verstecktes ISM nicht „verschwindet": `openSettings()` öffnet
 * DIESES Panel auch ohne sichtbaren Header von außen (lib/mainSettings.js listet
 * ausgeblendete ISMs und ruft es von dort auf).
 *
 * Zusammenklappen (@dpa ddw.md 20260805, „alles zusammenklappbar" — Nachfolger des Punkts
 * „auf jedem … ISM Header … das Zusammenklapp Icon … so wie in 'Tempo*'"): das gab es vorher
 * NUR beim Takt/Metronom-ISM, fest verdrahtet (`taktCollapse`/`wb-collapse`/`benchCollapsed`
 * in werkbank-leer.js/overcord/werkbank.js/pitchosc.js). Jetzt 1:1 generalisiert hierher —
 * JEDES ISM mit `h2` bekommt automatisch das Klapp-Icon links im Header. Anders als
 * `ismHidden`: der Header bleibt sichtbar/bedienbar (Verschieben, Rechtsklick-Settings),
 * nur der INHALT (alle Kinder außer `h2`) klappt weg — dieselbe Ebene wie `group-collapse`
 * bei GroupHost.js, nur eine Stufe höher. State-Key `instrCollapsed`, CSS-Klasse
 * `.ism-collapsed` (css/main.css). Eingeklappt ignoriert `applySize()` eine gesetzte
 * Breite/Höhe (derselbe Bug/Fix wie bei GroupHost.js `applyGroupStyles`) — sonst bliebe die
 * Sektion trotz verstecktem Inhalt auf ihrem eingestellten Maß stehen.
 */
import { MiniSettings } from './MiniSettings.js';
import { PickMenu } from './PickMenu.js';
import { renameIn } from './soundKeys.js';
import { icon } from './icons.js';
import { hint } from './i18n.js';

/**
 * @param {HTMLElement} sectionEl  die .wb-bench-Sektion
 * @param {object} state           MiniState dieses Instruments
 * @param {object} [opts]
 * @param {string} [opts.bodySelector]  Selektor des zu skalierenden Körpers (Default: die Sektion selbst)
 * @param {object} [opts.host]     mountGroups()-Rückgabe dieses ISM — falls gesetzt, gibt es
 *        eine "Snapshot"-Zeile (Werte über ALLE Gruppen dieses ISM, @dpa 20260724 Punkt "ISM
 *        UND (Snapshot)"). Kein Pool-Konzept hier (anders als Gruppen-Combo/-Snapshot) — ein
 *        ISM existiert nur einmal, keine Klone.
 * @param {() => object} [opts.snapExtra]  Strukturierter Zusatz-Blob NEBEN den Sound-Werten,
 *        für ISM-weites (Stepseq: `{sqCount, sqViews}` = Anzahl + volle Sq-Ansicht).
 * @param {(extra:object) => void} [opts.onSnapRecalled]  Hook NACH dem Zurücksetzen aller
 *        Sound-Werte; bekommt den snapExtra-Blob und gleicht Struktur+Ansicht an
 *        (Stepseq: multiSq.recallSnapshot()).
 * @param {string} [opts.defaultName]  Name-Vorgabe, falls der h2 kein `.wb-instr-name`-Span
 *        trägt (z.B. Scope/Meter) — vorher wurde diese Option angenommen, aber nie gelesen
 *        (Bugfix ddw.md 20260803_135251, aufgefallen beim ISM-Sichtbarkeits-Punkt, der einen
 *        vernünftigen Namen für die Liste in mainSettings.js braucht).
 * @returns {{ scaled: () => boolean, isHidden: () => boolean, setHidden: (v:boolean) => void,
 *             isCollapsed: () => boolean, setCollapsed: (v:boolean) => void,
 *             name: () => string, openSettings: (anchorEl?: HTMLElement) => void }}
 */
export function mountInstrumentSettings(sectionEl, state, opts = {}) {
    const h2 = sectionEl.querySelector(':scope > h2');
    const nameEl = h2 ? h2.querySelector('.wb-instr-name') : null;
    // opts.defaultName zuerst (explizite Vorgabe), sonst der .wb-instr-name-Span, sonst der
    // ganze h2-Text (deckt z.B. #bench-scope ab, dessen <span> keine wb-instr-name-Klasse
    // trägt), sonst leer (LevelMeter hat gar keinen h2 — „kein Header", @dpa 20260722).
    const defaultName = opts.defaultName || (nameEl ? nameEl.textContent.trim() : (h2 ? (h2.textContent || '').trim() : ''));
    const body = opts.bodySelector ? sectionEl.querySelector(opts.bodySelector) : sectionEl;
    const settings = new MiniSettings('Instrument');
    const host = opts.host;

    // ── Zusammenklapp-Icon (s. Datei-Kopf) — nur wenn es überhaupt einen Header gibt
    // (LevelMeter hat keinen h2, "wb-bare"). Links im h2, VOR dem Namen, wie group-collapse
    // links in der Gruppen-Titelleiste (GroupHost.js buildGroup).
    let collapseBtn = null;
    if (h2) {
        collapseBtn = document.createElement('button');
        collapseBtn.type = 'button'; collapseBtn.className = 'ism-collapse';
        collapseBtn.appendChild(icon('caret'));
        hint(collapseBtn, 'Ein-/Ausklappen');
        h2.insertBefore(collapseBtn, h2.firstChild);
    }

    // ── ISM-Snapshot (Werte über alle Gruppen) — nur wenn ein host übergeben wurde ──────
    // opts.snapExtra (@dpa 20260725): STRUKTURIERTER Zusatz-Blob NEBEN den Sound-Werten (nicht
    // hinein gemischt — er ist keine Sound-Größe). Trägt, was host.allSoundValues() (gruppen-
    // basiert) nicht erfasst: beim Stepseq-ISM die Sequenzer-Anzahl (`sqCount`) UND die volle
    // Ansicht/Optik aller Sqs (`sqViews`), damit nach dem Recall auch NEU gebaute Sequenzer
    // (3→6) genauso aussehen wie beim Speichern. opts.onSnapRecalled(extra) bekommt den Blob
    // zurück und gleicht Struktur+Ansicht an (Stepseq: multiSq.recallSnapshot()).
    const listIsmSnaps = () => state.get('ismSnaps') || [];
    const snapExtra = () => (opts.snapExtra ? opts.snapExtra() : undefined);
    function saveIsmSnap(entryName) {
        const list = listIsmSnaps().slice();
        const entry = { name: entryName, ts: Date.now(), values: host.allSoundValues(), extra: snapExtra() };
        const at = list.findIndex((it) => it.name === entryName);
        if (at >= 0) list[at] = entry; else list.push(entry);
        state.set('ismSnaps', list);
        state.set('ismSnapSel', entryName);
        return list;
    }
    function updateIsmSnap(index) {
        const list = listIsmSnaps().slice();
        if (!list[index]) return false;
        list[index] = { ...list[index], ts: Date.now(), values: host.allSoundValues(), extra: snapExtra() };
        state.set('ismSnaps', list);
        return true;
    }
    function renameIsmSnap(index, newName) {
        const list = listIsmSnaps().slice();
        const err = renameIn(list, index, newName);
        if (!err) state.set('ismSnaps', list);
        return err;
    }
    function deleteIsmSnap(index) {
        const list = listIsmSnaps().slice();
        list.splice(index, 1);
        state.set('ismSnaps', list);
        return list;
    }
    function recallIsmSnap(index) {
        const entry = listIsmSnaps()[index];
        if (!entry) return false;
        for (const [k, v] of Object.entries(entry.values || {})) state.set(k, v);
        state.set('ismSnapSel', entry.name);
        // NACH allen Werten: das ISM Struktur+Ansicht an den geladenen State angleichen lassen
        // (Stepseq baut die im Snapshot verlangten Sq-Gruppen neu/ab und stellt ihre Optik her).
        // entry.values MIT übergeben (@dpa dd.md 20260802: alte Snapshots ohne extra.sqCount
        // sollen künftig trotzdem korrekt laden) — sqManager.recallSnapshot() leitet die Anzahl
        // notfalls aus den vorhandenen Werte-Keys ab, statt den aktuell gebauten Stand stehen
        // zu lassen (führte zu "zu vielen"/stehengebliebenen Sequenzern bei Altbestand-Snaps).
        if (opts.onSnapRecalled) opts.onSnapRecalled(entry.extra, entry.values);
        return true;
    }

    const applyBg = () => { sectionEl.style.background = state.get('instrBg') || ''; };
    const applyScale = () => { const s = state.get('instrScale'); if (body) body.style.zoom = (s && s !== 100) ? (s / 100) : ''; };
    const applyPos = () => {
        const p = state.get('instrPos');
        if (p) { sectionEl.style.position = 'absolute'; sectionEl.style.left = p.x + 'px'; sectionEl.style.top = p.y + 'px'; }
    };
    const applyName = () => { if (nameEl) nameEl.textContent = state.get('instrName') || defaultName; };
    // ── Zusammenklapp-Zustand (s. Datei-Kopf) — MUSS vor applySize() feststehen: eingeklappt
    // ignoriert applySize() eine gesetzte Breite/Höhe (derselbe Bug/Fix wie GroupHost.js
    // applyGroupStyles, @dpa ddw.md 20260805: „soll auch Gruppen/ISM mit Breite/Höhe > 0
    // zusammenklappen").
    const isCollapsed = () => !!state.get('instrCollapsed');
    const applySize = () => {
        if (!body) return;
        const col = isCollapsed();
        const w = state.get('instrWidth'), h = state.get('instrHeight');
        body.style.width = (!col && w) ? w + 'px' : '';
        body.style.height = (!col && h) ? h + 'px' : '';
    };
    const applyCollapsed = () => {
        const col = isCollapsed();
        const wasCollapsed = sectionEl.classList.contains('ism-collapsed');
        sectionEl.classList.toggle('ism-collapsed', col);
        if (collapseBtn) collapseBtn.classList.toggle('collapsed', col);
        applySize();   // Breite/Höhe-Vorgabe je nach neuem Zustand neu bewerten
        // Bug (@dpa ddw.md 20260805, „Beim Browser reload mit geschlossenem ISM zeigt es
        // danach keinen Inhalt mehr nach dem ausklappen"): startet die Seite MIT bereits
        // eingeklapptem ISM, baut mountGroups() sein GroupHost-Panel VOR diesem Konstruktor
        // (dessen `applyCollapsed()`-Erstaufruf unten die Sektion display:none setzt) — aber
        // GroupHost.sizePanel() misst erst asynchron im NÄCHSTEN requestAnimationFrame. Das
        // liegt IMMER nach dem Rest des synchronen Skripts (inkl. dieser Zeile), trifft die
        // Sektion also schon unsichtbar an und misst überall 0 → das Panel bleibt dauerhaft
        // auf 0×0 hängen, auch nach dem Wiederaufklappen (display:none liefert für JEDES Kind
        // eine Null-Bounding-Box, unabhängig von dessen eigener Breite/Höhe-Vorgabe). Beim
        // ÜBERGANG eingeklappt→sichtbar erzwingt host.refresh() (mountGroups()-Rückgabe, falls
        // ein ISM eins übergeben hat) eine frische Neu-Messung — jetzt mit sichtbarer Sektion.
        if (!col && wasCollapsed && opts.host && opts.host.refresh) opts.host.refresh();
    };
    const setCollapsed = (v) => { state.set('instrCollapsed', v || undefined); applyCollapsed(); };
    if (collapseBtn) collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); setCollapsed(!isCollapsed()); });
    // ── Sichtbar-Umschalter (ddw.md 20260803_135251, s. Datei-Kopf) ────────────────────
    // `ismHidden` lebt in DIESEM ISM-State, genau wie instrPos/instrBg — kein eigener
    // globaler Config-Key nötig, mainSettings.js liest ihn über das Rückgabe-Objekt (isHidden).
    const isHidden = () => !!state.get('ismHidden');
    const applyHidden = () => { sectionEl.classList.toggle('ism-hidden', isHidden()); };
    const setHidden = (v) => { state.set('ismHidden', v || undefined); applyHidden(); };
    applyBg(); applyScale(); applyPos(); applyName(); applyHidden(); applyCollapsed();

    /** Baut den Panel-Inhalt (geteilt zwischen Rechtsklick-auf-Header UND externem Aufruf
     *  aus mainSettings.js — ein verstecktes ISM hat ja keinen klickbaren Header mehr). */
    function openPanel(anchor) {
        settings.open(anchor, ({ colorA, num, text, raw }) => {
            if (nameEl) {
                text('Name', {
                    get: () => state.get('instrName') || defaultName,
                    set: (v) => { state.set('instrName', v); applyName(); },
                    placeholder: defaultName,
                });
            }
            if (host) {
                // Kein eigenes PickMenu-Label (@dpa 20260724_114012: "Snapshot SNAPSHOOT ist
                // zuviel Label") — die kme-row liefert das Label schon (wie bei Name/BG/…),
                // ein zweites internes .pm-label daneben war schlicht doppelt und sorgte auch
                // für die schiefe Ausrichtung ggü. den anderen Zeilen.
                const snapMenu = new PickMenu({
                    empty: '— kein Snapshot —',
                    title: 'Werte des gesamten Instruments speichern/laden',
                    list: listIsmSnaps,
                    current: () => state.get('ismSnapSel') || '',
                    onPick: (i) => recallIsmSnap(i),
                    onUpdate: (i) => updateIsmSnap(i),
                    onRename: (i, item, newName) => renameIsmSnap(i, newName),
                    onDelete: (i) => deleteIsmSnap(i),
                    foot: [['plus', '+ Neu', 'Aktuelle Werte als neuen Snapshot speichern', () => {
                        const nm = prompt('Name für den neuen Snapshot?', 'Snap ' + (listIsmSnaps().length + 1));
                        if (nm && nm.trim()) saveIsmSnap(nm.trim());
                    }]],
                });
                raw('Snap', snapMenu.element);
            }
            colorA('BG', {
                get: () => state.get('instrBg') || '',
                set: (v) => { state.set('instrBg', v); applyBg(); },
                fallback: '#232833',
            });
            num('Breite', {
                min: 0, max: 1600, title: 'Grundmaß in px, 0 = auto',
                get: () => state.get('instrWidth') || 0,
                set: (v) => { state.set('instrWidth', v > 0 ? v : undefined); applySize(); },
            });
            num('Höhe', {
                min: 0, max: 1600, title: 'Grundmaß in px, 0 = auto',
                get: () => state.get('instrHeight') || 0,
                set: (v) => { state.set('instrHeight', v > 0 ? v : undefined); applySize(); },
            });
            num('Größe %', {
                min: 50, max: 200, title: 'Instrument-Größe in Prozent',
                get: () => state.get('instrScale') || 100,
                set: (v) => { state.set('instrScale', v); applyScale(); },
            });
            // Sichtbar-Umschalter (s. Datei-Kopf): gleicher Button-Typ wie „Panel?" bei
            // Controls (panelIn/panelOut), NICHT schließend beim Klick — man will das Ergebnis
            // (Section verschwindet) direkt sehen, „erst durch escape" (@dpa-Zitat dazu bei
            // Controls, hier 1:1 übernommen).
            const hideBtn = document.createElement('button');
            hideBtn.type = 'button'; hideBtn.className = 'kme-panelbtn';
            const syncHideBtn = () => {
                const h = isHidden();
                hideBtn.innerHTML = '';
                hideBtn.appendChild(icon(h ? 'panelOut' : 'panelIn'));
                hideBtn.classList.toggle('on', h);
                const txt = h
                    ? 'Instrument ist ausgeblendet — nur noch über die Haupt-Settings (⚙) erreichbar. Klicken, um es wieder anzuzeigen.'
                    : 'Instrument ist sichtbar. Klicken, um es auszublenden (bleibt über die Haupt-Settings (⚙) erreichbar).';
                hideBtn.setAttribute('aria-label', txt);
                hint(hideBtn, txt);
            };
            hideBtn.addEventListener('click', () => { setHidden(!isHidden()); syncHideBtn(); });
            syncHideBtn();
            raw('Sichtbar', hideBtn);
        }, undefined,
        // Position merken (ddw.md 20260726): wie groupSettingsPos in GroupHost.js.
        { get: () => state.get('instrSettingsPos'), set: (pos) => state.set('instrSettingsPos', pos) });
    }

    if (h2) {
        h2.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const at = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }) };
            openPanel(at);
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

    return {
        scaled: () => (state.get('instrScale') || 100) !== 100,
        /** ISM-Snapshot (nur nutzbar, wenn opts.host übergeben wurde). */
        listIsmSnaps, saveIsmSnap, updateIsmSnap, renameIsmSnap, deleteIsmSnap, recallIsmSnap,
        // ISM-Sichtbarkeit (ddw.md 20260803_135251, s. Datei-Kopf) — mainSettings.js braucht
        // alle drei: isHidden()/name() für die Liste, openSettings() um das Panel auch OHNE
        // sichtbaren Header zu öffnen (der ist ja weg, solange isHidden() true ist — oder bei
        // LevelMeter, das von Haus aus keinen h2 hat).
        isHidden, setHidden,
        // Zusammenklappen (s. Datei-Kopf) — für Tests/externe Aufrufer, analog isHidden/setHidden.
        isCollapsed, setCollapsed,
        name: () => state.get('instrName') || defaultName,
        openSettings: (anchorEl) => openPanel(anchorEl || h2 || sectionEl),
    };
}
