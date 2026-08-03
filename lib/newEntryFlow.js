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
 */
import { slugify, isReservedSlug } from './slugify.js';

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

    const ov = document.createElement('div'); ov.className = 'sw-overlay ne-overlay';
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });

    const win = document.createElement('div'); win.className = 'sw-window ne-window';
    win.addEventListener('mousedown', (e) => e.stopPropagation());

    const head = document.createElement('div'); head.className = 'sw-head';
    const title = document.createElement('span'); title.textContent = 'Neues Projekt starten';
    const x = document.createElement('button');
    x.className = 'sw-close'; x.type = 'button'; x.textContent = '✕'; x.title = 'Schließen';
    x.addEventListener('click', () => close());
    head.append(title, x);
    win.appendChild(head);

    const body = document.createElement('div'); body.className = 'sw-body';
    win.appendChild(body);

    ov.appendChild(win);
    document.body.appendChild(ov);

    function close() {
        ov.remove();
        if (triggerEl && triggerEl.isConnected) triggerEl.focus();
    }

    showNameStep(body, close, (slug, displayName) => showCommandStep(body, slug, displayName));
}

/** Schritt 1: Name eingeben → validieren (Pfadtrenner/Slug/reserviert/Kollision) → weiter. */
function showNameStep(body, close, onDone) {
    body.innerHTML = '';

    const intro = document.createElement('p'); intro.className = 'sw-note';
    intro.textContent = 'Diese Werkbank ("Leer") bleibt immer leer — sie ist die Vorlage. '
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

/** Schritt 2: fertigen, cwd-unabhängigen Befehl zeigen + sofort kopieren. */
function showCommandStep(body, slug, displayName) {
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

    const p2 = document.createElement('p'); p2.className = 'sw-note';
    p2.textContent = 'Der Befehl kopiert "werkbank-leer/" nach ' + slug + '/ und fügt die neuen '
        + 'Dateien zu Git hinzu (nur vormerken, kein Commit).';
    body.appendChild(p2);

    const p3 = document.createElement('p'); p3.className = 'sw-note';
    p3.innerHTML = `Danach ist <code>${slug}/</code> bereit — <code>git commit</code>, wenn es bleiben soll.`;
    body.appendChild(p3);

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
        const cmd = `node "${root}/tools/new-entry.mjs" "${displayName}"`;
        code.textContent = cmd;
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', () => doCopy(cmd));
        doCopy(cmd);   // sofort kopieren, zusätzlich zum Knopf für ein bewusstes Erneut-Kopieren
    }).catch((e) => {
        code.textContent = `node tools/new-entry.mjs "${displayName}"`;
        const warn = document.createElement('p'); warn.className = 'sw-note ne-error';
        warn.textContent = `Projekt-Pfad konnte nicht ermittelt werden (${e.message}) — der Befehl oben `
            + 'funktioniert nur, wenn das Terminal schon im Projektordner steht (cd dorthin, dann einfügen).';
        body.appendChild(warn);
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', () => doCopy(code.textContent));
    });
}
