/**
 * newEntryFlow.js — "Neues Projekt starten": eigenes Fenster im Vordergrund, EIN Ablauf
 * (@dpa ddw.md 20260803, kompletter Rebuild nach dem ersten, gescheiterten Versuch).
 *
 * ── Warum ein Rebuild, nicht nur ein Fix ──────────────────────────────────────────────
 * @dpa nach dem Ausprobieren der ersten Fassung, wörtlich (ddw.md, volles Zitat dort):
 * "das ist zu durcheinander! … Das ist alles sehr sehr unklar! … Nee.. das ist ein Chaos,
 * bei dem jeder Fehler macht." Zwei konkrete Fehler daran:
 *   1. Der kopierte Terminalbefehl enthielt einen RELATIVEN Pfad zum Skript selbst
 *      (`node tools/new-entry.mjs …`) — lief nur, wenn das Terminal zufällig schon im
 *      Projektordner stand. @dpa führte ihn in `~` aus → "Cannot find module".
 *   2. Der Text erklärte, was NICHT automatisch passiert ("legt den Ordner NICHT selbst
 *      an … dann git add/commit nicht vergessen (sonst …)") statt es zu automatisieren.
 *      "Etwas tut nicht - danach soll man..?? … das kann man keinem User anbieten!"
 * Beides ist hier behoben: der Befehl referenziert das Skript über einen ABSOLUTEN Pfad
 * (funktioniert aus jedem cwd, s. showCommandStep()), und tools/new-entry.mjs führt
 * `git add` jetzt selbst aus (NUR staging, nie commit — s. dortiger Kopf).
 *
 * ── Warum die Werkbank den Befehl trotzdem nur ANZEIGT, nicht ausführt ──────────────────
 * Sie läuft komplett STATISCH (kein Server, kein Backend, s. CLAUDE.md "Starten/Testen") —
 * ein Klick im Browser kann keinen Ordner auf der Festplatte anlegen. `tools/new-entry.mjs`
 * (Node) macht die eigentliche Kopie; dieser Trigger bereitet nur vor: Name abfragen, Slug
 * clientseitig GENAUSO normalisieren wie das Node-Skript (lib/slugify.js — EINE geteilte
 * Quelle statt zweier von Hand synchron zu haltender Kopien), eine billige Kollisionsprobe,
 * dann den fertigen Befehl zeigen + kopieren.
 *
 * ── Absoluter Projekt-Pfad: EINE Quelle ─────────────────────────────────────────────────
 * Ein rein statisches HTML kann den Dateisystem-Pfad, unter dem es liegt, grundsätzlich
 * nicht selbst kennen (Browser-Sandbox). `project-root.txt` (Repo-Wurzel, ein einzelner
 * Klartext-Pfad) ist die einzige Quelle dafür — kein Server, kein Build-Schritt, passt zur
 * "kein Backend"-Architektur. `tools/new-entry.mjs` hält sie SELBST aktuell (schreibt sie
 * bei jedem Lauf neu aus demselben ROOT, das es sowieso schon berechnet) — verschiebt/klont
 * @dpa den Projektordner, korrigiert sich die Datei von selbst, ohne dass hier zwei Quellen
 * synchron gehalten werden müssten.
 *
 * ── Eigenes Fenster statt Popover + native prompt() (@dpa: "extra Fenster … separat") ───
 * Die alte Fassung nutzte den nativen `prompt()`-Dialog für den Namen und danach ein
 * schwebendes Popover für den Befehl — zwei verschiedene, unklar zusammenhängende UI-Sorten.
 * Hier ist es EIN Fenster (`.sw-overlay`/`.sw-window`, dieselben Klassen wie das Einstellungs-
 * Fenster, s. lib/SettingsWindow.js) mit zwei Schritten (Name → Befehl) im selben Rahmen.
 * Bewusst OHNE eigene ESC-Bindung (1:1-Muster aus dem alten Rec-Format-Popover,
 * werkbank-leer/werkbank-leer.js `closeRecFmt`): wird dieses Fenster AUS dem offenen
 * Einstellungs-Fenster heraus geöffnet (lib/mainSettings.js), würde eine eigene ESC-Bindung
 * mit dessen ESC-Handler um den Tastendruck konkurrieren (Registrierungsreihenfolge). Schließen
 * geht über ✕ oder Klick auf den abgedunkelten Grund — reicht für ein Fenster mit genau zwei
 * Knöpfen pro Schritt.
 *
 * ── Geteilt statt verdoppelt ──────────────────────────────────────────────────────────
 * `openNewEntryFlow()` ist der `onNewEntry`-Callback, den sowohl overcord/werkbank.js als
 * auch werkbank-leer/werkbank-leer.js an `buildMainSettings()` (lib/mainSettings.js) reichen
 * UND den die zentrale "+ Neu"-Karte in werkbank-leer/index.html direkt aufruft (s. dortiger
 * Kommentar) — dieselbe Logik einmal statt mehrfach dupliziert.
 *
 * ── "Auslagern"-Modus (@dpa ddw.md 20260803_122138 Punkt 3) ────────────────────────────
 * "die zentrale mittige NEU auf dem Panel NUR in WB-leer. im neu erzeugten dann nur noch
 * als 'Copy to new html' o.ä. in der Config (ähnlicher Vorgang, aber nicht als 'neu'
 * sondern als Teilung/Auslagerung.." Dieselbe Funktion hier bedient BEIDE Fälle, erkannt
 * über `APP` (aus `<html data-app>`, s. lib/appId.js): im Original werkbank-leer bleibt
 * alles wie bisher (Titel/Texte "Neues Projekt starten", Quelle = werkbank-leer). In JEDEM
 * anderen Einstieg (= ein bereits gewachsener Klon) ändert sich NUR die Beschriftung/Erklärung
 * UND die Kopier-Quelle im generierten Befehl (`--source <APP>`, s. tools/new-entry.mjs) —
 * das Kopierziel bleibt in beiden Fällen ein neuer, leerer Ordner; der aktuelle Einstieg wird
 * NIE selbst verändert. Der kleine Settings-Knopf (lib/mainSettings.js) fragt dieselbe APP
 * separat ab, um seine eigene Beschriftung ("+ Neu" / "Auslagern") zu wählen.
 *
 * ── "Öffnen"-Knopf (@dpa ddw.md 20260803_122138 Punkt 2) ────────────────────────────────
 * "nach diesem Fenster: vielleicht gleich ein (halbautomatisches) 'öffne [neuer
 * ordnername html]' im gleichen Fenster?" Der Zielordner existiert erst, NACHDEM @dpa den
 * kopierten Befehl selbst im Terminal ausgeführt hat — das Fenster kann das nicht wissen,
 * ohne nachzuschauen. showCommandStep() pollt darum periodisch per HEAD auf
 * `/<slug>/index.html` (GENAU derselbe Trick wie der Kollisions-Check in showNameStep(),
 * nur umgekehrte Bedingung: hier wartet man DARAUF, dass die Antwort 200 wird, statt dass
 * sie 404 bleibt). Kein endloses Pollen (@dpa: "dann aufhören zu pollen statt endlos") —
 * harte Obergrenze POLL_MAX_MS, danach bleibt der Knopf einfach unsichtbar, kein Fehler.
 * Der Poll-Timer wird beim Schließen des Fensters IMMER gestoppt (close() räumt ihn ab),
 * sonst liefe er im Hintergrund weiter, auch wenn niemand mehr hinschaut.
 */
import { slugify, isReservedSlug } from './slugify.js';
import { APP } from './appId.js';

// Die ZWEI hand-gebauten Original-Einstiege (kein automatisch erzeugter Klon): overcord/
// (voller Baukasten, APP bewusst weiter 'werkbank' — s. lib/appId.js-Kopf "Default ist
// bewusst 'werkbank'") UND werkbank-leer/ selbst (die Vorlage). Beide behalten "+ Neu" mit
// unveränderter Bedeutung. ALLES andere APP ist ein per tools/new-entry.mjs erzeugter Klon —
// NUR dort gilt "Auslagern" (@dpa ddw.md 20260803_122138 Punkt 3). Ohne diese Unterscheidung
// würde overcord (APP='werkbank' !== 'werkbank-leer') fälschlich als Klon durchgehen.
const ORIGINAL_APPS = ['werkbank', 'werkbank-leer'];

/** Läuft dieser Ablauf NICHT in einem der zwei Original-Einstiege, sondern in einem bereits
 *  geklonten, gewachsenen Einstieg? Dann ist es kein "neu", sondern ein "Auslagern". Exportiert
 *  (statt nur lokal genutzt), damit lib/mainSettings.js für die Beschriftung des kleinen
 *  Settings-Knopfs DIESELBE Erkennung verwendet — nicht eine zweite, separat gepflegte Kopie. */
export const isOutsourceMode = () => !ORIGINAL_APPS.includes(APP);

/** project-root.txt einmalig laden + zwischenspeichern (mehrere Aufrufe teilen sich EINEN Fetch). */
let _rootPromise = null;
function projectRoot() {
    if (!_rootPromise) {
        _rootPromise = fetch('/project-root.txt')
            .then((res) => {
                if (!res.ok) throw new Error(`project-root.txt: HTTP ${res.status}`);
                return res.text();
            })
            .then((txt) => {
                const root = txt.trim();
                if (!root) throw new Error('project-root.txt ist leer');
                return root;
            });
    }
    return _rootPromise;
}

/**
 * Ablauf öffnen: EIN Fenster, Schritt 1 (Name) → Schritt 2 (fertiger Befehl).
 * Ohne Parameter aufrufbar (Fenster ist immer mittig) — nimmt optional das auslösende
 * Element entgegen, um den Fokus beim Schließen dorthin zurückzugeben (Bedienbarkeit per
 * Tastatur), sonst ungenutzt.
 * @param {HTMLElement} [triggerEl]
 */
export function openNewEntryFlow(triggerEl) {
    document.querySelectorAll('.ne-overlay').forEach((o) => o.remove());
    // Öffnen/Schließen generisch per Event melden (@dpa ddw.md 20260803_135251 Punkt 3: die
    // zentrale "+ Neu"-Karte in werkbank-leer/index.html soll verschwinden, solange dieses
    // Fenster offen ist — "das kann weg"). Bewusst ein Event statt eines direkten Aufrufs:
    // diese Datei kennt die Karte NICHT (sie bedient GENAUSO den kleinen "+ Neu"-Knopf im
    // Einstellungs-Fenster, der keine Karte hat) — der Listener sitzt in werkbank-leer.js,
    // wo die Karte tatsächlich lebt.
    window.dispatchEvent(new CustomEvent('werkbank:new-entry-flow', { detail: { open: true } }));

    const outsource = isOutsourceMode();

    const ov = document.createElement('div'); ov.className = 'sw-overlay ne-overlay';
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });

    const win = document.createElement('div'); win.className = 'sw-window ne-window';
    win.addEventListener('mousedown', (e) => e.stopPropagation());

    const head = document.createElement('div'); head.className = 'sw-head';
    const title = document.createElement('span');
    title.textContent = outsource ? 'Als eigenes Projekt auslagern' : 'Neues Projekt starten';
    const x = document.createElement('button');
    x.className = 'sw-close'; x.type = 'button'; x.textContent = '✕'; x.title = 'Schließen';
    x.addEventListener('click', () => close());
    head.append(title, x);
    win.appendChild(head);

    const body = document.createElement('div'); body.className = 'sw-body';
    win.appendChild(body);

    ov.appendChild(win);
    document.body.appendChild(ov);

    // Poll-Timer des "Öffnen"-Knopfs (Schritt 2, s. Datei-Kopf) — lebt hier oben, damit
    // close() ihn IMMER stoppen kann, egal wie/wann geschlossen wird (✕, Klick auf den
    // abgedunkelten Grund). showCommandStep() reicht seine Timer-ID über setPollTimer() hier
    // hinein, statt einen eigenen, von hier aus unerreichbaren Timer zu verwalten.
    let pollTimer = null;
    function close() {
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        ov.remove();
        window.dispatchEvent(new CustomEvent('werkbank:new-entry-flow', { detail: { open: false } }));
        if (triggerEl && triggerEl.isConnected) triggerEl.focus();
    }

    showNameStep(body, close, outsource, (slug, displayName) => {
        showCommandStep(body, slug, displayName, outsource, (id) => { pollTimer = id; });
    });
}

/** Schritt 1: Name eingeben → validieren (Pfadtrenner/Slug/reserviert/Kollision) → weiter. */
function showNameStep(body, close, outsource, onDone) {
    body.innerHTML = '';

    const intro = document.createElement('p'); intro.className = 'sw-note';
    // Auslagern-Fall (@dpa ddw.md 20260803_122138 Punkt 3): "bleibt immer leer" stimmt hier
    // nicht mehr — dieser Einstieg hat längst eigenen Inhalt, GENAU DER wird die Kopier-Quelle.
    // @dpas genaue Wortwahl steht noch aus (Abschlussbericht markiert das zur Freigabe).
    intro.textContent = outsource
        ? `Dieser Einstieg ("${APP}") hat schon einen eigenen Stand. Ein neues, eigenständiges `
            + 'Projekt entsteht als Kopie DAVON (nicht der leeren Vorlage), in ein paar Schritten im Terminal.'
        : 'Diese Werkbank ("Leer") bleibt immer leer — sie ist die Vorlage. '
            + 'Ein eigenes Projekt entsteht als Kopie davon, in ein paar Schritten im Terminal.';
    body.appendChild(intro);

    const row = document.createElement('div'); row.className = 'sw-row-full ne-name-row';
    const label = document.createElement('label'); label.textContent = 'Name des neuen Projekts';
    label.htmlFor = 'ne-name-input';
    const input = document.createElement('input');
    input.type = 'text'; input.id = 'ne-name-input'; input.className = 'sw-text';
    input.placeholder = 'z.B. "Pitch Oszillator"';
    input.addEventListener('focus', () => input.select());
    row.append(label, input);
    body.appendChild(row);

    const preview = document.createElement('div'); preview.className = 'sw-note ne-slug-preview';
    body.appendChild(preview);
    const err = document.createElement('div'); err.className = 'sw-note ne-error'; err.hidden = true;
    body.appendChild(err);

    const updatePreview = () => {
        const trimmed = input.value.trim();
        if (!trimmed) { preview.textContent = ''; return; }
        if (trimmed.includes('/') || trimmed.includes('\\')) { preview.textContent = ''; return; }
        const slug = slugify(trimmed);
        preview.innerHTML = slug ? `Ordner wird: <code>${slug}/</code>` : '';
    };
    input.addEventListener('input', () => { err.hidden = true; updatePreview(); });

    const foot = document.createElement('div'); foot.className = 'sw-row-full ne-foot';
    const goBtn = document.createElement('button');
    goBtn.type = 'button'; goBtn.className = 'pb-btn'; goBtn.textContent = 'Weiter →';
    foot.appendChild(goBtn);
    body.appendChild(foot);

    const showErr = (msg) => { err.textContent = msg; err.hidden = false; };

    const submit = () => {
        const trimmed = input.value.trim();
        if (!trimmed) { showErr('Bitte einen Namen eingeben.'); return; }
        // Verschachtelte Slugs ablehnen, GENAU wie tools/new-entry.mjs (s. dortiger Kopf +
        // lib/slugify.js-Kopf): slugify() würde '/' klaglos zu '-' machen — das müsste hier
        // VOR dem Normalisieren gemeldet werden, sonst zeigte Schritt 2 einen Befehl, der beim
        // echten Skriptlauf denselben (dann versteckten) Fehler nur verzögert.
        if (trimmed.includes('/') || trimmed.includes('\\')) {
            showErr('Der Name darf keinen Schrägstrich enthalten (verschachtelte Ordner werden nicht unterstützt).');
            return;
        }
        const slug = slugify(trimmed);
        if (!slug) { showErr('Dieser Name ergibt keinen gültigen Ordnernamen.'); return; }
        if (isReservedSlug(slug)) {
            showErr(`"${slug}" ist ein reservierter Name (bestehende Root-Struktur) — bitte einen anderen Namen wählen.`);
            return;
        }
        goBtn.disabled = true; goBtn.textContent = 'Prüfe …';
        // Kollisions-Check: ein billiger HINWEIS, KEIN Ersatz für die Sperrliste/den echten
        // fs.existsSync()-Check im Node-Skript (ein HEAD auf /<slug>/index.html träfe z.B.
        // lib/ oder css/ nicht — genau darum prüft isReservedSlug() oben separat).
        fetch(`/${slug}/index.html`, { method: 'HEAD' })
            .then((res) => {
                if (res.ok) {
                    showErr(`"${slug}/" scheint bereits zu existieren — bitte einen anderen Namen wählen.`);
                    goBtn.disabled = false; goBtn.textContent = 'Weiter →';
                    return;
                }
                onDone(slug, trimmed);
            })
            .catch(() => onDone(slug, trimmed));   // Netzwerkfehler beim Check blockiert nicht — die echte Kollision zeigt sich spätestens beim Skriptlauf
    };
    goBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(() => input.focus(), 0);
}

// Poll-Konstanten für den "Öffnen"-Knopf (s. Datei-Kopf Punkt 2): 1.5s zwischen den
// Versuchen, harte Obergrenze 3 Minuten (@dpa: "aufhören zu pollen statt endlos" — kein
// Fehler danach, der Knopf bleibt einfach unsichtbar, falls @dpa den Befehl noch gar nicht
// ausgeführt hat).
const OPEN_POLL_MS = 1500;
const OPEN_POLL_MAX_MS = 3 * 60 * 1000;

/**
 * Schritt 2: fertigen, cwd-unabhängigen Befehl zeigen + sofort kopieren, danach halbautomatisch
 * auf den entstehenden Ordner warten (Punkt 2).
 * @param {(id: any) => void} setPollTimer  reicht die aktuelle Timer-ID an den Aufrufer
 *        (openNewEntryFlow) weiter, damit close() sie beim Schließen stoppen kann.
 */
function showCommandStep(body, slug, displayName, outsource, setPollTimer) {
    body.innerHTML = '';

    const p1 = document.createElement('p');
    p1.innerHTML = `Neuer Ordner: <code>${slug}/</code>. Befehl ist schon kopiert — im Terminal einfügen und Enter drücken.`;
    body.appendChild(p1);

    const codeRow = document.createElement('div'); codeRow.className = 'ne-code-row';
    const code = document.createElement('code'); code.className = 'ne-code';
    code.textContent = 'Projekt-Pfad wird geladen …';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button'; copyBtn.className = 'wb-help-btn'; copyBtn.style.cssText = 'width:auto; padding:0 8px;';
    copyBtn.textContent = '⧉'; copyBtn.title = 'In Zwischenablage kopieren'; copyBtn.disabled = true;
    codeRow.append(code, copyBtn);
    body.appendChild(codeRow);

    // Auslagern-Fall (Punkt 3): Quelle ist DIESER Einstieg (APP), nicht werkbank-leer — die
    // Erklärung darunter muss das auch so sagen, sonst behauptet sie fälschlich, "werkbank-
    // leer/" würde kopiert, während der Befehl tatsächlich --source <APP> mitgibt.
    const p2 = document.createElement('p'); p2.className = 'sw-note';
    p2.textContent = outsource
        ? `Der Befehl kopiert "${APP}/" (diesen Einstieg, so wie er gerade ist) nach ${slug}/ `
            + 'und fügt die neuen Dateien zu Git hinzu (nur vormerken, kein Commit).'
        : `Der Befehl kopiert "werkbank-leer/" nach ${slug}/ und fügt die neuen `
            + 'Dateien zu Git hinzu (nur vormerken, kein Commit).';
    body.appendChild(p2);

    const p3 = document.createElement('p'); p3.className = 'sw-note';
    p3.innerHTML = `Danach ist <code>${slug}/</code> bereit — <code>git commit</code>, wenn es bleiben soll.`;
    body.appendChild(p3);

    // ── "Öffnen"-Knopf (Punkt 2): erscheint erst, wenn der Ordner wirklich existiert ──────
    // Startet unsichtbar mit einem wartenden Hinweis, kein hartes Fehlschlagen bei zu frühem
    // Klick möglich, weil der Knopf bis dahin gar nicht im DOM anklickbar ist.
    const openRow = document.createElement('div'); openRow.className = 'sw-row-full ne-open-row';
    const waitNote = document.createElement('span'); waitNote.className = 'sw-note ne-open-wait';
    waitNote.textContent = `Wird automatisch erkannt, sobald ${slug}/ existiert …`;
    const openBtn = document.createElement('button');
    openBtn.type = 'button'; openBtn.className = 'pb-btn'; openBtn.hidden = true;
    openBtn.textContent = `${slug}/ öffnen`;
    openBtn.addEventListener('click', () => window.open(`/${slug}/`, '_blank'));
    openRow.append(waitNote, openBtn);
    body.appendChild(openRow);

    let pollElapsed = 0;
    const poll = () => {
        fetch(`/${slug}/index.html`, { method: 'HEAD' })
            .then((res) => {
                if (res.ok) { waitNote.hidden = true; openBtn.hidden = false; return; }
                scheduleNext();
            })
            .catch(() => scheduleNext());   // Netzwerkfehler = einfach weiter versuchen, bis die Obergrenze greift
    };
    const scheduleNext = () => {
        pollElapsed += OPEN_POLL_MS;
        if (pollElapsed >= OPEN_POLL_MAX_MS) { waitNote.textContent = `${slug}/ noch nicht gefunden — bitte den Befehl oben ausführen.`; return; }
        setPollTimer(setTimeout(poll, OPEN_POLL_MS));
    };
    setPollTimer(setTimeout(poll, OPEN_POLL_MS));

    const doCopy = (cmd) => {
        navigator.clipboard.writeText(cmd).then(() => {
            copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
        }).catch(() => { /* z.B. kein Clipboard-Recht ohne User-Geste — Knopf bleibt als Fallback */ });
    };

    projectRoot().then((root) => {
        // Absoluter Pfad ZUM SKRIPT (nicht nur `cd <root> &&`) — new-entry.mjs löst sein
        // eigenes ROOT ohnehin über import.meta.url auf (s. dortiger Kopf), UNABHÄNGIG vom
        // cwd. Ein absoluter Skriptpfad allein macht den ganzen Befehl damit bereits
        // cwd-unabhängig, ohne dass es ein extra `cd` bräuchte — genau der Bug, den @dpa in
        // `~` reproduzierte (`node tools/new-entry.mjs …` = relativer Pfad zum Skript).
        // Auslagern-Fall: `--source <APP>` hängt dran (tools/new-entry.mjs default = werkbank-leer,
        // s. dortiger Kopf) — im Original-Fall bleibt der Befehl unverändert (kein --source).
        const cmd = outsource
            ? `node "${root}/tools/new-entry.mjs" "${displayName}" --source "${APP}"`
            : `node "${root}/tools/new-entry.mjs" "${displayName}"`;
        code.textContent = cmd;
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', () => doCopy(cmd));
        doCopy(cmd);   // sofort kopieren, zusätzlich zum Knopf für ein bewusstes Erneut-Kopieren
    }).catch((e) => {
        code.textContent = outsource
            ? `node tools/new-entry.mjs "${displayName}" --source "${APP}"`
            : `node tools/new-entry.mjs "${displayName}"`;
        const warn = document.createElement('p'); warn.className = 'sw-note ne-error';
        warn.textContent = `Projekt-Pfad konnte nicht ermittelt werden (${e.message}) — der Befehl oben `
            + 'funktioniert nur, wenn das Terminal schon im Projektordner steht (cd dorthin, dann einfügen).';
        body.appendChild(warn);
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', () => doCopy(code.textContent));
    });
}
