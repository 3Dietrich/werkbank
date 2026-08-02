/**
 * slugify.js — Name → Ordner-Slug für einen neuen Pool-Einstieg ("Neues Projekt starten",
 * @dpa-Plan). GETEILT zwischen `tools/new-entry.mjs` (Node, legt den Ordner wirklich an) und
 * dem Panel-Trigger (Browser, `lib/mainSettings.js`-Knopf + Verdrahtung in werkbank.js/
 * werkbank-leer.js, zeigt nur den fertigen Befehl) — beide Seiten reine ES-Module ohne
 * Build-Step, ein relativer Import geht hier also ohne Modul-Verrenkungen. WICHTIG: beide
 * Seiten MÜSSEN für denselben Namen denselben Slug berechnen, sonst zeigt das Panel einen
 * anderen Ordnernamen an als das Skript tatsächlich anlegt — darum genau EINE Quelle, nicht
 * zwei von Hand synchron gehaltene Kopien.
 *
 * Regeln:
 *  - lowercase, nur `[a-z0-9-]`.
 *  - CamelCase wird VOR dem Lowercasen an Wortgrenzen aufgetrennt ("PitchOszillator" →
 *    "pitch-oszillator") — sonst würde daraus nur "pitchoszillator".
 *  - führendes Zeichen muss ein Buchstabe sein (ein Ordnername, der wie eine Zahl/ein
 *    Sonderzeichen beginnt, wirkt wie Unfug/ein Pfad-Fragment) — sonst wird `p-` vorangestellt.
 *  - Reservierte Namen (bestehende Root-Strukturen: overcord/, lib/, css/, … s. RESERVED_SLUGS)
 *    sind gesperrt — das ist eine EIGENE Prüfung, keine Ableitung aus der Normalisierung,
 *    weil z.B. "Lib" normalisiert zu "lib" würde und sonst still den echten lib/-Ordner träfe.
 *
 * Verschachtelte Slugs (mit `/`) kommen aus dieser Funktion NIE heraus (jeder Trenner wird zu
 * `-`) — genau deshalb prüft der Aufrufer (new-entry.mjs, Panel-Trigger) den ROHEN Namen VOR
 * dem Normalisieren explizit auf `/`/`\`, statt sich auf slugify() zu verlassen: das
 * Normalisieren würde den Fehler sonst nur VERSTECKEN (aus "foo/bar" würde klaglos "foo-bar"),
 * statt ihn zu melden — verschachtelte Ordner sind nicht unterstützt (nur EINE Verzeichnistiefe
 * wie werkbank-leer/, s. `../css/`-/`../lib/`-Pfade dort).
 */

/** Reservierte Root-Namen — mit KEINEM darf ein neuer Einstiegs-Ordner kollidieren. */
export const RESERVED_SLUGS = [
    'overcord', 'werkbank-leer', 'lib', 'css', 'presets', 'assets', 'test', 'tools',
    'docs', 'ddw', '.git', 'index',
];

/** Rohen Anzeigenamen zu einem gültigen Ordner-Slug normalisieren. */
export function slugify(name) {
    let s = String(name || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')   // camelCase-Grenzen VOR dem Lowercasen auftrennen
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')              // alles Fremde zu einem Trenner
        .replace(/^-+|-+$/g, '')                  // Rand-Bindestriche weg
        .replace(/-{2,}/g, '-');                  // mehrfache Bindestriche zusammenziehen
    if (s && !/^[a-z]/.test(s)) s = `p-${s}`;
    return s;
}

/** Ist dieser (bereits normalisierte) Slug einer der gesperrten Root-Namen? */
export function isReservedSlug(slug) {
    return RESERVED_SLUGS.includes(slug);
}
