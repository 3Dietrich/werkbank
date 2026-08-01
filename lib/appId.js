/**
 * appId.js — welcher HTML-Einstieg bin ich, und wie heißen meine localStorage-Keys?
 *
 * ── Warum es das gibt (@dpa dd.md 20260801_2) ────────────────────────────────────────
 * Früher hatte JEDES Projekt seinen eigenen Port (teslacoil :8000, werkbank :8002, …).
 * localStorage hängt am Origin (Schema + Host + PORT), also hatte jedes Projekt seinen
 * eigenen Datentopf, ohne dass jemand etwas dafür bauen musste — @dpa: „es gab pro port
 * eine json … es funktionierte tadellos".
 *
 * Seit die Werkbank ein POOL mehrerer HTML-Einstiege auf EINEM Port ist
 * (index.html + werkbank-leer.html + künftige Kopien, s. ARCHITEKTUR.md), fällt diese
 * Trennung weg: gleicher Port = gleicher localStorage, nur ein anderer Pfad. Damit teilten
 * sich alle Einstiege ihre Instrumenten-Stände, und ein Demo-Export aus einer Seite
 * überschrieb den Erstbesuch-Stand der anderen mit.
 *
 * Deshalb bekommt jeder Einstieg hier ein PRÄFIX, das seine Keys eindeutig macht:
 *   <html data-app="werkbank">        → werkbank_taktmetro,      presets/werkbank-config.json
 *   <html data-app="werkbank-leer">   → werkbank-leer_taktmetro, presets/werkbank-leer-config.json
 *
 * Der Default ist bewusst 'werkbank': index.html behält damit EXAKT seine bisherigen
 * Key-Namen — kein Migrationsschritt, kein verlorener Stand in einem Browser, der die
 * Seite schon benutzt hat.
 *
 * Eine neue Kopie (z.B. werkbank-drone.html) braucht nur ihr eigenes `data-app` und hat
 * damit automatisch eigene Daten UND eine eigene Demo-Datei — keine Liste, die man
 * irgendwo pflegen müsste (@dpa: „auch für die Zukunft: neue kopien von werkbank-leer,
 * die dann anders heißen, auf diese wieder ein neue eigene Daten").
 */

/** Kennung dieses Einstiegs (aus <html data-app="…">, Default 'werkbank'). */
export const APP = (typeof document !== 'undefined' && document.documentElement.dataset.app) || 'werkbank';

/** localStorage-Key dieses Einstiegs für einen Bereich: lsKey('taktmetro') → 'werkbank_taktmetro'. */
export const lsKey = (name) => `${APP}_${name}`;

/** Demo-/Erstbesuch-Datei dieses Einstiegs. */
export const configPath = () => `presets/${APP}-config.json`;

/** Trägt der Key das Präfix DIESES Einstiegs? (Import-/Export-Filter) */
export const isOwnKey = (key) => typeof key === 'string' && key.startsWith(`${APP}_`);

/**
 * Key aus einer FREMDEN Export-Datei auf diesen Einstieg umbiegen.
 *
 * Export-Dateien tragen die Keys der Seite, auf der sie entstanden sind (und alte Dateien
 * von vor dieser Trennung durchweg `werkbank_…`). Ohne Umbiegen ließe sich ein Export nur
 * dort einlesen, wo er gemacht wurde — genau das war vorher der Ärger. Der Bereichsname
 * hinter dem ersten `_` ist stabil ('taktmetro', 'state', …), also wird nur das Präfix
 * ersetzt. Keys ohne Unterstrich bleiben unangetastet (nichts erfinden).
 */
export function toOwnKey(key) {
    if (typeof key !== 'string') return key;
    const at = key.indexOf('_');
    return at > 0 ? `${APP}_${key.slice(at + 1)}` : key;
}
