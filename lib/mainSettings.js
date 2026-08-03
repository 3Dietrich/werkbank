/**
 * mainSettings.js — der INHALT des Einstellungs-Fensters, einmal für alle Pool-Einstiege.
 *
 * ── Warum getrennt von SettingsWindow.js ─────────────────────────────────────────────
 * `SettingsWindow.js` ist die Chrome (Overlay, Kopf, Scrollen, i-Popover) und weiß nichts
 * über Werkbank-Themen. Hier stehen die Themen. Beide Einstiege (`werkbank.js`,
 * `werkbank-leer/werkbank-leer.js`) hatten diesen Aufbau bis 20260802 1:1 doppelt — bei
 * einem POOL von Einstiegen (s. ARCHITEKTUR.md) wären das n Kopien derselben Änderung.
 *
 * Was einstieg-SPEZIFISCH bleibt und darum als Callback hereinkommt: die Daten-Aktionen
 * (Export/Import/Reset arbeiten auf den LS_KEYS des jeweiligen Einstiegs) und sein `state`.
 *
 * ── Reihenfolge und Reichweite (@dpa dd.md 20260802) ─────────────────────────────────
 * Sprache steht OBEN — wer sie sucht, soll sie finden, ohne den Rest zu lesen (dieselbe
 * Entscheidung wie in teslacoil). Danach die zwei Darstellungs-Themen, zuletzt die Daten.
 * Jeder Abschnitt sagt in der Kopfzeile seine REICHWEITE („gilt überall" / „nur dieser
 * Einstieg") — @dpa vermisste genau diese Trennung: Sprache und Beschriftung wirken auf
 * das ganze Fenster, Export/Reset betreffen nur den Datentopf DIESER Seite (lib/appId.js).
 *
 * Die Erklärungen sind Markdown hinter dem i-Icon, nicht Fließtext im Fenster: „wenn diese
 * Text in das mittelgroße Icon 'i' … zum anklicken = markup lesen kriegt, dann braucht es
 * nicht so viel Platz."
 */
import { hint, text as i18nText, setLang, lang as curLang } from './i18n.js';
import { APP } from './appId.js';

/**
 * Die Themen-Abschnitte in ein offenes SettingsWindow bauen.
 *
 * @param {object} f – die Feld-Helfer aus `SettingsWindow.open(build)`
 * @param {object} o
 * @param {{get:Function,set:Function}} o.state – der Haupt-State des Einstiegs
 * @param {()=>void} o.onExport – aktuellen Zustand als .json herunterladen
 * @param {()=>void} o.onImport – Datei-Dialog öffnen
 * @param {()=>void} o.onReset  – alles zurücksetzen (mit Rückfrage)
 * @param {(anchorEl:HTMLElement)=>void} o.onNewEntry – "Neues Projekt starten"
 *        (@dpa-Plan, Phase 3): Name abfragen, Slug prüfen, fertigen `node tools/
 *        new-entry.mjs`-Befehl anzeigen+kopierbar machen. FÜHRT NICHTS AUS (rein statische
 *        Werkbank, kein Backend) — bekommt den eigenen Button als Anker fürs Popover mit,
 *        s. lib/newEntryFlow.js.
 * @param {()=>void} o.reopen   – Fenster neu aufbauen (für Felder ohne eigenes Handle)
 * @param {{list:Function, load:Function, saveNow:Function}} [o.backups] – gestaffelte
 *        Auto-Sicherungen (@dpa ddw.md 20260802 Punkt 4, lib/Backup.js). `list()` → Array
 *        {ts,label} neueste zuerst, `load(ts)` stellt wieder her (fragt/lädt neu), `saveNow()`
 *        legt sofort eins an. Optional, damit ein Einstieg ohne Backup-Wiring nicht crasht.
 */
export function buildMainSettings(f, { state, onExport, onImport, onReset, onNewEntry, reopen, backups }) {
    const { section, num, select, color, colorA, full } = f;
    const mk = (label, title, fn) => {
        const b = document.createElement('button'); b.className = 'pb-btn'; i18nText(b, label);
        hint(b, title); b.addEventListener('click', fn); return b;
    };

    section('Sprache', 'gilt überall', SPRACHE_INFO);
    select('Anzeigesprache', {
        options: [['de', 'Deutsch'], ['en', 'English']],
        get: () => curLang(),
        // Beides setzen: `setLang` schaltet die Oberfläche sofort um, der State macht die
        // Wahl dauerhaft (und nimmt sie beim nächsten Laden wieder auf).
        set: (v) => { setLang(v); state.set('lang', v); },
        title: 'Sprache der Hinweise und Beschriftungen (selbst vergebene Namen bleiben unverändert)',
    });

    // 'Beschriftung' heißt im Fenster weiter so (i18n: → 'Labels'), NICHT wörtlich 'Labels'
    // in beiden Sprachen: seit es ein echtes Sprach-Menü gibt, ist ein deutscher Begriff im
    // deutschen Fenster stimmiger als ein stehengelassener englischer.
    section('Beschriftung', 'gilt überall', BESCHRIFTUNG_INFO);
    const colorField = color('Farbe', {
        get: () => state.get('labelColor') || '#8a94a6',
        set: (v) => state.set('labelColor', v),
        title: 'Farbe ALLER Beschriftungen und Werte-Anzeigen',
    });
    const sizeField = num('Größe', {
        // min:0 statt eines "vernünftig scheinenden" Mindestwerts (@dpa mehrfach eindringlich,
        // CLAUDE.md „keine versteckten Limits" — s. auch Gruppen-Kopf-Größe unten, wo genau so
        // ein Mindestwert ddw.md 20260802 Punkt 5 den Bug verursachte): 0px ist die einzige
        // ECHTE technische Grenze (negativ ergibt keinen Sinn), alles darüber ist @dpas Sache.
        min: 0, max: 1000000,
        get: () => state.get('labelSize') || 10, set: (v) => state.set('labelSize', v),
        title: 'Schriftgröße der Beschriftungen (px)',
    });
    // Wert-BG mit Deckkraft (@dpa ddw.md 20260724_183901): rgba() statt reinem Hex,
    // Default-Alpha 0 — unsichtbar, bis @dpa sie aufdreht.
    colorA('Wert-Hintergrund', {
        get: () => state.get('valueBg') || 'rgba(0,0,0,0)',
        set: (v) => state.set('valueBg', v),
        fallback: '#000000',
    });
    const clearBtn = document.createElement('button');
    clearBtn.className = 'pb-btn'; i18nText(clearBtn, '✕ Vorgabe entfernen');
    hint(clearBtn, 'Vorgabe entfernen (wieder wie ausgeliefert)');
    clearBtn.addEventListener('click', () => {
        state.set('labelColor', ''); state.set('labelSize', ''); state.set('valueBg', '');
        colorField.value = '#8a94a6'; sizeField.value = 10;
        reopen();   // Wert-BG (colorA) hat kein eigenes Handle — neu aufbauen zeigt den Reset
    });
    full(clearBtn);

    section('Gruppen-Kopf', 'gilt überall', GRUPPENKOPF_INFO);
    num('Größe', {
        // BUGFIX (@dpa ddw.md 20260802 Punkt 5: "Ich habe z.B. größe 8 und Höhe 0, sieht
        // immernoch groß genug aus"): die eigentliche Ursache war genau HIER — min:8 auf
        // diesem Feld selbst klemmte jede kleinere Eingabe (auch die probierten 8/4) still
        // wieder hoch, BEVOR sie den State/die CSS-Variable überhaupt erreichte. „limits ≠
        // default" (CLAUDE.md, mehrfach eindringlich @dpa) — 0px ist die einzige ECHTE
        // technische Grenze, der Rest bleibt dem User überlassen (s. auch css/main.css
        // .group-collapse/.group-title-bar, wo das Icon jetzt ebenfalls mitskaliert).
        min: 0, max: 1000000,
        get: () => state.get('grpHeadSize') || 10, set: (v) => state.set('grpHeadSize', v),
        title: 'Schriftgröße der Gruppen-Kopfzeile (px)',
    });
    num('Höhe', {
        min: 0, max: 1000000,
        get: () => state.get('grpHeadH') || 0, set: (v) => state.set('grpHeadH', v),
        title: 'Mindesthöhe der Gruppen-Kopfzeile in px (0 = wie ausgeliefert)',
    });

    // Gestaffelte Auto-Backups (@dpa ddw.md 20260802 Punkt 4: „denselben gestaffelten Export
    // wie in teslacoil" — dort: automatische Sicherung + Auswahl-Menü + Wiederherstellen,
    // ZUSÄTZLICH zum Datei-Export unten, s. lib/Backup.js-Kopf für die Anpassung). Optional
    // (`backups` kommt nur mit, wenn der Einstieg es verdrahtet) — ohne bleibt die Sektion weg.
    if (backups) {
        section('Backups', 'nur dieser Einstieg', BACKUPS_INFO);
        const bkRow = document.createElement('div'); bkRow.className = 'cfg-btn-row';
        const bkSel = document.createElement('select'); bkSel.className = 'sw-select';
        const fmtTs = (ts) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
        const refreshBackups = () => {
            bkSel.innerHTML = '';
            const list = backups.list();   // neueste zuerst
            if (!list.length) {
                const o = document.createElement('option'); i18nText(o, '— keine Backups —'); o.value = '';
                bkSel.appendChild(o); bkSel.disabled = true; return;
            }
            bkSel.disabled = false;
            const ph = document.createElement('option'); i18nText(ph, '— Backup wählen —'); ph.value = ''; bkSel.appendChild(ph);
            list.forEach((b) => {
                const o = document.createElement('option'); o.value = String(b.ts);
                o.textContent = fmtTs(b.ts) + (b.label ? '  · ' + b.label : ''); bkSel.appendChild(o);
            });
        };
        refreshBackups();
        const bkLoad = mk('Laden', 'Gewähltes Backup wiederherstellen (ersetzt alles) und neu laden', () => {
            const ts = Number(bkSel.value); if (!ts) return;
            backups.load(ts);
        });
        const bkSave = mk('Jetzt sichern', 'Sofort ein Backup des aktuellen Zustands anlegen', () => {
            backups.saveNow(); refreshBackups();
        });
        bkRow.append(bkSel, bkLoad, bkSave);
        full(bkRow);
        // Der erklärende Text stand hier vorher als Dauer-Absatz im Fenster (@dpa ddw.md
        // 20260802_234615 Punkt 6: "der Text gehört in die {i} hilfe") — er lebt jetzt
        // ausschließlich in BACKUPS_INFO hinter dem (i)-Icon oben, kein full(bkNote) mehr.
    }

    section('Daten', 'nur dieser Einstieg', DATEN_INFO);
    const btnRow = document.createElement('div'); btnRow.className = 'cfg-btn-row';
    // "+ Neu" braucht sich selbst als Popover-Anker (@dpa-Plan Phase 3) — darum erst
    // deklarieren, dann im eigenen Klick-Handler zurückgreifen (zur Klickzeit ist die
    // Zuweisung längst passiert, JS wertet Closures erst bei Aufruf aus).
    let newEntryBtn;
    newEntryBtn = mk('+ Neu', 'Neues Projekt starten: eigenes Fenster mit Name-Eingabe und fertigem Terminalbefehl', () => onNewEntry(newEntryBtn));
    btnRow.append(
        mk('⭳ Export', 'Aktuellen Zustand als .json herunterladen', onExport),
        mk('⭱ Import', 'Zustand aus einer .json laden (Seite lädt neu)', onImport),
        mk('↺ Reset', 'Alles zurücksetzen (localStorage leeren, Seite lädt neu)', onReset),
        newEntryBtn,
    );
    full(btnRow);
    // Eigener Hinweis direkt unter der Knopfreihe (nicht im i-Popover versteckt, s.
    // DATEN_INFO): "+ Neu" ist konzeptionell etwas anderes als die drei Datentopf-Aktionen
    // davor (öffnet ein eigenes Fenster statt sofort zu wirken) — das sollte man beim
    // Bedienen sehen, nicht erst nach dem Klick erraten. Die zentrale "+ Neu"-Karte in
    // werkbank-leer (s. dortiges index.html) erklärt denselben Ablauf ausführlicher; hier
    // reicht ein Einzeiler, weil das Fenster selbst gleich alles Nötige erklärt.
    const newEntryNote = document.createElement('div'); newEntryNote.className = 'sw-note';
    i18nText(newEntryNote, '+ Neu öffnet ein eigenes Fenster für den Ablauf (kein einzelner Klick — ein paar Schritte im Terminal).');
    full(newEntryNote);
    // Beim Bedienen sichtbar, nicht im i-Popover versteckt: welchen Datentopf die drei
    // Knöpfe gerade meinen. Bei mehreren offenen Einstiegen ist genau das die Frage. APP
    // ist der reine data-app-Name (kein Übersetzungsfall), nur der Vorspann läuft über i18n.
    const dataNote = document.createElement('div'); dataNote.className = 'sw-note';
    const dataNoteLabel = document.createElement('span'); i18nText(dataNoteLabel, 'Datentopf: ');
    dataNote.append(dataNoteLabel, document.createTextNode(APP));
    full(dataNote);
}

// Die Erklärungstexte stehen als Konstanten am Dateiende, damit der Aufbau oben in einem
// Stück lesbar bleibt. Markdown (lib/miniMarkdown.js): **fett**, `code`, Absätze.
// Je ein { de, en }-Paar statt eines i18n-Eintrags: mehrsätzige Absätze taugen nicht als
// Dictionary-Schlüssel (s. Kopf von SettingsWindow.js, makeInfoIcon).
//
// Alle Texte hier straff gehalten (@dpa ddw.md 20260802_234615 Punkt 6: "auch da bitte
// keine Romane und nichts über selbstverständlichkeiten" — als Negativ-Beispiel zitierte er
// wörtlich die alte Gruppenkopf-Erklärung "Größe ist die Schriftgröße, Höhe eine
// Mindesthöhe..." — genau die Art Satz ist hier unten überall raus. Nur, was man OHNE das
// Fenster zu bedienen nicht erraten würde, bleibt stehen.
const SPRACHE_INFO = {
    de: 'Schaltet die ganze Oberfläche sofort um, ohne Neuladen. Was du **selbst benannt** '
        + 'hast (Regler, Gruppen, Instrumente, Snapshots), bleibt unübersetzt.',
    en: 'Switches the whole interface instantly, no reload. Anything **you named yourself** '
        + '(knobs, groups, instruments, snapshots) stays untranslated.',
};

const BESCHRIFTUNG_INFO = {
    de: 'Gilt für **alle** Beschriftungen/Werte-Anzeigen auf einmal. Die Farbe eines '
        + '**einzelnen** Reglers stellst du separat ein (Rechtsklick auf den Regler).\n\n'
        + '**Wert-Hintergrund** startet unsichtbar (Deckkraft 0), bis du am `A`-Regler drehst.',
    en: 'Applies to **all** labels/value readouts at once. A **single** knob’s colour is set '
        + 'separately (right-click that knob).\n\n'
        + '**Value background** starts invisible (opacity 0) until you turn the `A` knob.',
};

const GRUPPENKOPF_INFO = {
    de: 'Die Kopfzeile jeder Control-Gruppe. Nützlich, wenn Gruppen dicht nebeneinander '
        + 'stehen und die Köpfe auf einer Linie liegen sollen.',
    en: 'The header row of every control group. Useful when groups sit side by side and '
        + 'their headers should line up.',
};

const BACKUPS_INFO = {
    de: 'Automatisch gesichert, solange sich etwas ändert (gestaffelt: max. 2/Min, 5/Std, '
        + '1/Tag, 1/Woche). Ein Backup zu laden ersetzt den KOMPLETTEN Zustand dieses '
        + 'Einstiegs.',
    en: 'Saved automatically whenever something changes (staged: max. 2/min, 5/hr, 1/day, '
        + '1/week). Loading a backup replaces the COMPLETE state of this entry point.',
};

const DATEN_INFO = {
    de: 'Diese drei Knöpfe wirken **nur auf diesen Einstieg** — jede Seite hat ihren eigenen '
        + 'Datentopf.\n\n'
        + '**Import** liest auch eine `.json` aus einem **anderen** Einstieg (Schlüssel werden '
        + 'umgebogen). **Reset** ist NICHT umkehrbar — vorher exportieren.',
    en: 'These three buttons affect **this entry point only** — every page has its own data '
        + 'store.\n\n'
        + '**Import** also reads a `.json` from a **different** entry point (keys get '
        + 'rewritten). **Reset** cannot be undone — export first.',
};
