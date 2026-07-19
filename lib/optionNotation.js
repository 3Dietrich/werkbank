/**
 * optionNotation.js — die kompakte „Tabellen"-Kurzschrift für Select-/Segment-Inhalte.
 *
 * @dpa 20260718_234247: „ein (vergrößerbarer) textbereich wo man den inhalt als Table
 * angabe macht … eine passende kurze Form". Genau eine Zeile beschreibt alle Einträge eines
 * Auswahl-Controls — Wert, Anzeige, und „nichts"-Einträge — damit man sie sehen und kopieren
 * kann, ohne pro Option ein eigenes Feld.
 *
 * ── Form ──────────────────────────────────────────────────────────────────────────────
 *   [Name = ] [ eintrag, eintrag, … ]
 *   • „Name =" (optional) wird zum Label des Controls.
 *   • Einträge in eckigen Klammern, mit Komma getrennt. (Die Klammern sind optional.)
 *   • Ein Eintrag „Wert - Text" trennt internen Wert und Anzeige (z.B. `1 - konstant`).
 *   • Ein Eintrag ohne „ - " ist Wert UND Anzeige zugleich (`3` → Wert 3, zeigt „3").
 *   • Ein LEERER Eintrag ist „nichts" (leere Option). `= [,,3]` = drei Einträge, nur der
 *     dritte trägt „3".
 *
 * parseOptions('Modus = [1 - konstant, 2 - folgend]')
 *   → { name:'Modus', options:[{v:'1',l:'konstant'},{v:'2',l:'folgend'}] }
 * parseOptions('= [,,3]')
 *   → { name:'', options:[{v:'',l:''},{v:'',l:''},{v:'3',l:'3'}] }
 */

/** @returns {{name:string, options:{v:string,l:string}[]}|null} null = nichts angegeben. */
export function parseOptions(str) {
    let body = String(str == null ? '' : str).trim();
    let name = '';
    const eq = body.indexOf('=');
    if (eq >= 0) { name = body.slice(0, eq).trim(); body = body.slice(eq + 1).trim(); }
    const m = body.match(/^\[([\s\S]*)\]$/);   // umschließende [ ] abstreifen (optional)
    if (m) body = m[1];
    if (body.trim() === '') return name ? { name, options: [] } : null;
    const options = body.split(',').map((p) => {
        const t = p.trim();
        if (t === '') return { v: '', l: '' };
        const dash = t.indexOf(' - ');
        if (dash >= 0) return { v: t.slice(0, dash).trim(), l: t.slice(dash + 3).trim() };
        return { v: t, l: t };
    });
    return { name, options };
}

/** Optionen zurück in die Kurzschrift (zum Vorbefüllen des Feldes). */
export function optionsToStr(name, options) {
    const inner = (options || []).map((o) => {
        const v = o.v ?? '', l = o.l ?? '';
        if (v === '' && l === '') return '';
        return v === l ? v : `${v} - ${l}`;
    }).join(', ');
    return (name ? name + ' = ' : '') + '[' + inner + ']';
}

/** Rohe Options-Vorgabe eines Controls (Strings ODER {v,l}/{v,l,title}) normalisieren. */
export function normOptions(raw) {
    return (raw || []).map((o) => (typeof o === 'string' ? { v: o, l: o } : { v: String(o.v), l: o.l ?? String(o.v) }));
}
