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
 * @param {()=>void} o.reopen   – Fenster neu aufbauen (für Felder ohne eigenes Handle)
 */
export function buildMainSettings(f, { state, onExport, onImport, onReset, reopen }) {
    const { section, num, select, color, colorA, full } = f;

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
        min: 6, max: 1000000,
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
        min: 8, max: 1000000,
        get: () => state.get('grpHeadSize') || 10, set: (v) => state.set('grpHeadSize', v),
        title: 'Schriftgröße der Gruppen-Kopfzeile (px)',
    });
    num('Höhe', {
        min: 0, max: 1000000,
        get: () => state.get('grpHeadH') || 0, set: (v) => state.set('grpHeadH', v),
        title: 'Mindesthöhe der Gruppen-Kopfzeile in px (0 = wie ausgeliefert)',
    });

    section('Daten', 'nur dieser Einstieg', DATEN_INFO);
    const btnRow = document.createElement('div'); btnRow.className = 'cfg-btn-row';
    const mk = (label, title, fn) => {
        const b = document.createElement('button'); b.className = 'pb-btn'; i18nText(b, label);
        hint(b, title); b.addEventListener('click', fn); return b;
    };
    btnRow.append(
        mk('⭳ Export', 'Aktuellen Zustand als .json herunterladen', onExport),
        mk('⭱ Import', 'Zustand aus einer .json laden (Seite lädt neu)', onImport),
        mk('↺ Reset', 'Alles zurücksetzen (localStorage leeren, Seite lädt neu)', onReset),
    );
    full(btnRow);
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
const SPRACHE_INFO = {
    de: 'Schaltet **die ganze Oberfläche** um: Beschriftungen, Menüs, Hilfetexte und die '
        + 'Hover-Hinweise — sofort, ohne Neuladen.\n\n'
        + 'Was du **selbst benannt** hast (umbenannte Regler, Gruppen, Instrumente, '
        + 'Snapshots), bleibt unangetastet. Deine Namen sind deine Namen, die übersetzt '
        + 'niemand.',
    en: 'Switches **the entire interface**: labels, menus, help texts and the hover hints — '
        + 'instantly, no reload.\n\n'
        + 'Anything **you named yourself** (renamed knobs, groups, instruments, snapshots) '
        + 'stays untouched. Your names are your names; nobody translates those.',
};

const BESCHRIFTUNG_INFO = {
    de: 'Gilt für **alle** Beschriftungen und Werte-Anzeigen auf einmal — quer über alle '
        + 'Instrumente.\n\n'
        + 'Die Farbe eines **einzelnen** Reglers stellst du woanders ein: Rechtsklick auf '
        + 'den Regler. Die bleibt hiervon unberührt.\n\n'
        + '**Wert-Hintergrund** ist das Polster hinter der Zahl. Es startet mit Deckkraft 0, '
        + 'ist also unsichtbar, bis du am `A`-Regler drehst.\n\n'
        + '`✕ Vorgabe entfernen` nimmt alle drei zurück auf den Auslieferungszustand.',
    en: 'Applies to **all** labels and value readouts at once — across every instrument.\n\n'
        + 'The colour of a **single** knob is set elsewhere: right-click that knob. It stays '
        + 'untouched by this.\n\n'
        + '**Value background** is the padding behind the number. It starts at opacity 0, so '
        + 'it stays invisible until you turn the `A` knob.\n\n'
        + '`✕ Vorgabe entfernen` resets all three to the shipped state.',
};

const GRUPPENKOPF_INFO = {
    de: 'Die Kopfzeile jeder Control-Gruppe (die Zeile mit dem Gruppennamen).\n\n'
        + '**Größe** ist die Schriftgröße, **Höhe** eine Mindesthöhe in Pixeln — `0` heißt '
        + '„so hoch wie der Text es braucht".\n\n'
        + 'Nützlich, wenn Gruppen dicht nebeneinander stehen und die Köpfe auf einer Linie '
        + 'liegen sollen.',
    en: 'The header row of every control group (the line carrying the group name).\n\n'
        + '**Size** is the font size, **height** a minimum height in pixels — `0` means '
        + '“as tall as the text needs”.\n\n'
        + 'Useful when groups sit side by side and their headers should line up.',
};

const DATEN_INFO = {
    de: 'Diese drei Knöpfe wirken **nur auf diesen Einstieg**. Jede Seite der Werkbank hat '
        + 'ihren eigenen Datentopf (`data-app`), sie können sich also nicht gegenseitig '
        + 'überschreiben.\n\n'
        + '**Export** schreibt den kompletten Zustand in eine `.json`: Umbenennungen, '
        + 'Anordnung, Tasten-/MIDI-Belegungen, Optik, Snapshots.\n\n'
        + '**Import** liest so eine Datei wieder ein — auch eine aus einem **anderen** '
        + 'Einstieg: die Schlüssel werden beim Einlesen auf diese Seite umgebogen.\n\n'
        + '**Reset** leert den Datentopf dieser Seite und lädt neu. Das ist nicht umkehrbar — '
        + 'vorher exportieren, wenn der Stand etwas wert ist.',
    en: 'These three buttons affect **this entry point only**. Every workbench page has its '
        + 'own data store (`data-app`), so they cannot overwrite one another.\n\n'
        + '**Export** writes the complete state into a `.json`: renamings, arrangement, '
        + 'key/MIDI bindings, appearance, snapshots.\n\n'
        + '**Import** reads such a file back in — including one from a **different** entry '
        + 'point: the keys are rewritten onto this page while loading.\n\n'
        + '**Reset** empties this page’s data store and reloads. That cannot be undone — '
        + 'export first if the state is worth anything.',
};
