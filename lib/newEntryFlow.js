/**
 * newEntryFlow.js — Panel-Trigger für "Neues Projekt starten" (@dpa-Plan, Phase 3).
 *
 * ── Warum nur Vorbereitung, kein Ausführen ───────────────────────────────────────────
 * Die Werkbank läuft komplett STATISCH (kein Server, kein Backend, s. CLAUDE.md
 * "Starten/Testen") — ein Klick im Browser kann keinen Ordner auf der Festplatte anlegen.
 * `tools/new-entry.mjs` (Node) führt die eigentliche Kopie aus; dieser Trigger bereitet nur
 * vor: Name abfragen, Slug clientseitig GENAUSO normalisieren wie das Node-Skript
 * (lib/slugify.js — EINE geteilte Quelle statt zweier von Hand synchron zu haltender
 * Kopien, sonst könnte das Panel einen anderen Ordnernamen ANZEIGEN als das Skript
 * tatsächlich ANLEGT), eine billige Kollisionsprobe, dann den fertigen Terminalbefehl
 * anzeigen + in die Zwischenablage kopieren. Der Befehl wird bewusst NUR angezeigt/kopiert,
 * NIE automatisch ausgeführt (@dpa 20260803) — ob/wie ein Befehl künftig direkt an einen
 * Agenten weitergereicht werden könnte, ist eine spätere, hier bewusst offene Frage.
 *
 * ── Geteilt statt verdoppelt ──────────────────────────────────────────────────────────
 * `openNewEntryFlow(anchorEl)` ist der `onNewEntry`-Callback, den sowohl overcord/werkbank.js
 * als auch werkbank-leer/werkbank-leer.js an `buildMainSettings()` (lib/mainSettings.js)
 * reichen — dieselbe Logik einmal statt zweimal 1:1 dupliziert, wie es bei mainSettings.js/
 * SettingsWindow.js selbst schon gehandhabt wird. Liegt eine Kopie dieser Datei künftig in
 * `<slug>/<slug>.js` (weil new-entry.mjs werkbank-leer.js 1:1 kopiert), bringt jede neue
 * Werkbank automatisch ihren eigenen "+ Neu"-Trigger für die NÄCHSTE Kopie mit.
 *
 * ── Optik ─────────────────────────────────────────────────────────────────────────────
 * Popover-Muster wie das bestehende Rec-Format-Popover (werkbank-leer/werkbank-leer.js,
 * `.cfg-pop`, nur Klick-außerhalb schließt — bewusst ohne eigene ESC-Bindung, s. dortiges
 * Vorbild). Weil dieser Trigger aber AUS dem Einstellungs-Fenster heraus geöffnet wird
 * (lib/SettingsWindow.js, `.sw-overlay` z-index 3000), braucht das Popover die höhere
 * `.wb-help-pop.sw-info-pop`-Kombiklasse (main.css) statt `.cfg-pop` (z-index 1500) — sonst
 * läge es unsichtbar UNTER dem abgedunkelten Grund des Fensters.
 */
import { slugify, isReservedSlug } from './slugify.js';

/**
 * Ablauf anstoßen: Name abfragen → validieren → Kollision prüfen → Befehl-Popover zeigen.
 * @param {HTMLElement} anchorEl – Element, an dem das Ergebnis-Popover andockt (der "+ Neu"-
 *        Knopf selbst, aus lib/mainSettings.js hereingereicht).
 */
export function openNewEntryFlow(anchorEl) {
    const rawName = prompt('Name für das neue Projekt? (wird zu einem Ordnernamen normalisiert, z.B. "Pitch Oszillator" → "pitch-oszillator")');
    if (rawName == null) return;   // Abgebrochen
    const trimmed = rawName.trim();
    if (!trimmed) return;

    // Verschachtelte Slugs ablehnen, GENAU wie tools/new-entry.mjs (s. dortiger Kopf +
    // lib/slugify.js-Kopf): slugify() würde '/' klaglos zu '-' machen, das Panel müsste den
    // Fehler also VOR dem Normalisieren melden, sonst zeigte es einen Befehl, der beim
    // echten Skriptlauf denselben (dann versteckten) Fehler nur verzögert.
    if (trimmed.includes('/') || trimmed.includes('\\')) {
        alert('Name darf keinen Pfadtrenner enthalten (verschachtelte Einstiege werden nicht unterstützt).');
        return;
    }
    const slug = slugify(trimmed);
    if (!slug) {
        alert('Dieser Name ergibt keinen gültigen Ordnernamen.');
        return;
    }
    if (isReservedSlug(slug)) {
        alert(`"${slug}" ist ein reservierter Name (bestehende Root-Struktur) — bitte einen anderen Namen wählen.`);
        return;
    }

    // Kollisions-Check: ein billiger HINWEIS, KEIN Ersatz für die Sperrliste/den echten
    // fs.existsSync()-Check im Node-Skript. Ein HEAD auf /<slug>/index.html träfe z.B. lib/
    // oder css/ nicht (die haben kein eigenes index.html) — genau darum prüft isReservedSlug()
    // oben SEPARAT, unabhängig vom Netzwerk-Ergebnis hier.
    fetch(`/${slug}/index.html`, { method: 'HEAD' })
        .then((res) => {
            if (res.ok) {
                alert(`"${slug}/" scheint bereits zu existieren — bitte einen anderen Namen wählen.`);
                return;
            }
            showCommandPopover(anchorEl, slug, trimmed);
        })
        .catch(() => {
            // Netzwerkfehler beim Check darf den Ablauf nicht blockieren — eine ECHTE
            // Kollision zeigt sich spätestens beim Skriptlauf selbst (fs.existsSync()).
            showCommandPopover(anchorEl, slug, trimmed);
        });
}

function showCommandPopover(anchorEl, slug, displayName) {
    const cmd = `node tools/new-entry.mjs "${displayName}"`;

    document.querySelectorAll('.new-entry-pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    // wb-help-pop = Optik/Grundgerüst, sw-info-pop = z-index ÜBER dem Settings-Overlay
    // (main.css-Kommentar dort), new-entry-pop nur zum gezielten Wiederfinden/Entfernen.
    pop.className = 'wb-help-pop sw-info-pop new-entry-pop';

    const body = document.createElement('div'); body.className = 'wb-help-body';
    const p1 = document.createElement('p');
    p1.innerHTML = `Neuer Einstieg <code>${slug}/</code> — im Terminal (Projektordner) ausführen:`;
    body.appendChild(p1);

    const codeRow = document.createElement('div');
    codeRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin:6px 0;';
    const code = document.createElement('code');
    code.textContent = cmd;
    code.style.cssText = 'flex:1; overflow-x:auto; white-space:nowrap; padding:3px 5px;';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button'; copyBtn.className = 'wb-help-btn'; copyBtn.style.cssText = 'width:auto; padding:0 8px;';
    copyBtn.textContent = '⧉';
    copyBtn.title = 'In Zwischenablage kopieren';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cmd).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
        }).catch(() => alert('Kopieren fehlgeschlagen — Befehl von Hand markieren:\n' + cmd));
    });
    codeRow.append(code, copyBtn);
    body.appendChild(codeRow);

    const p2 = document.createElement('p');
    p2.textContent = 'Legt den Ordner NICHT selbst an — danach im Terminal ausführen, dann git add/commit nicht vergessen (sonst deployt tools/build_pages.sh das nicht mit).';
    body.appendChild(p2);
    pop.appendChild(body);

    // Sofort in die Zwischenablage kopieren (@dpa-Auftrag: "wird angezeigt + in die
    // Zwischenablage kopiert"), zusätzlich zum Knopf für ein bewusstes Erneut-Kopieren.
    navigator.clipboard.writeText(cmd).then(() => {
        copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
    }).catch(() => { /* z.B. kein Clipboard-Recht ohne User-Geste — Knopf bleibt als Fallback */ });

    document.body.appendChild(pop);
    const r = anchorEl.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    // Passt es nicht mehr unter den Anker (Fenster steht oft in der oberen Bildhälfte,
    // s. SettingsWindow.js), klappt es stattdessen darüber (1:1-Muster aus makeInfoIcon()).
    if (pop.getBoundingClientRect().bottom > window.innerHeight - 8) {
        pop.style.top = Math.max(8, r.top - pop.offsetHeight - 6) + 'px';
    }

    // Nur Klick außerhalb schließt (KEINE eigene ESC-Bindung) — 1:1 das Muster des
    // bestehenden Rec-Format-Popovers (werkbank-leer/werkbank-leer.js `closeRecFmt`):
    // ESC bleibt so frei für das Einstellungs-Fenster selbst (lib/SettingsWindow.js), das
    // im Hintergrund weiter offen ist.
    const onOut = (e) => { if (!pop.contains(e.target) && e.target !== anchorEl) close(); };
    function close() { pop.remove(); document.removeEventListener('mousedown', onOut, true); }
    setTimeout(() => document.addEventListener('mousedown', onOut, true), 0);
}
