/**
 * miniMarkdown.js – winziger Markdown-Renderer für die editierbaren Instrument-Hilfetexte
 * (`[?]`-Popover, @dpa 20260721: „ein Symbol Edit-Button, der die Hilfe in Markdown
 * editieren kann"). Kein Abhängigkeits-Overkill für ein paar Absätze/Listen: **fett**,
 * `code`, [Link](url), Absätze durch Leerzeile, Listen mit „- ".
 *
 * htmlToMdApprox geht den Weg zurück – nur als EINMALIGE Saat fürs Edit-Textfeld, wenn noch
 * keine gespeicherte Markdown-Fassung existiert (die mitgelieferten wb-note-Texte sind
 * rohes HTML). Muss nicht verlustfrei sein, nur ein brauchbarer Startpunkt zum Weiterschreiben.
 */

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inlineMd(s) {
    return escHtml(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** @param {string} md @returns {string} HTML */
export function mdToHtml(md) {
    if (!md) return '';
    return md.trim().split(/\n{2,}/).map((block) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^-\s+/.test(l))) {
            return '<ul>' + lines.map((l) => `<li>${inlineMd(l.replace(/^-\s+/, ''))}</li>`).join('') + '</ul>';
        }
        // Überschriften + Zeilenumbrüche (@dpa 20260722_013727: „# Überschrift und
        // Zeilenumbrüche zeigt es nicht"): eine Zeile mit führenden „#" wird ihr eigenes
        // <hN> (1–6 #), auch mitten in einem Block. Der Rest bleibt ein Absatz, dessen Zeilen
        // aber per <br> sichtbar bleiben — bewusst NICHT wie sonst in Markdown üblich zu
        // Leerzeichen zusammengefasst (@dpa will die Zeilen 1:1 wiedersehen).
        const out = [];
        let para = [];
        const flush = () => { if (para.length) { out.push('<p>' + para.map(inlineMd).join('<br>') + '</p>'); para = []; } };
        for (const l of lines) {
            const h = /^(#{1,6})\s+(.*)$/.exec(l);
            if (h) { flush(); const n = h[1].length; out.push(`<h${n}>${inlineMd(h[2])}</h${n}>`); }
            else para.push(l);
        }
        flush();
        return out.join('');
    }).join('');
}

/** @param {string} html @returns {string} grobe Markdown-Annäherung, als Edit-Saat */
export function htmlToMdApprox(html) {
    if (!html) return '';
    return html
        .replace(/<b>(.*?)<\/b>/gs, '**$1**')
        .replace(/<code>(.*?)<\/code>/gs, '`$1`')
        .replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/gs, '[$2]($1)')
        .replace(/<li>(.*?)<\/li>/gs, '- $1\n')
        .replace(/<\/?ul>/g, '')
        .replace(/<h([1-6])>(.*?)<\/h\1>/gs, (_, n, t) => '\n\n' + '#'.repeat(+n) + ' ' + t + '\n\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<\/p>\s*<p>/g, '\n\n')
        .replace(/<\/?p>/g, '')
        .replace(/<[^>]+>/g, '')
        .split('\n').map((l) => l.trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
