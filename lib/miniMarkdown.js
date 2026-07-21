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
        return '<p>' + lines.map(inlineMd).join(' ') + '</p>';
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
        .replace(/<\/p>\s*<p>/g, '\n\n')
        .replace(/<\/?p>/g, '')
        .replace(/<[^>]+>/g, '')
        .split('\n').map((l) => l.trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
