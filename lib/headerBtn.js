/**
 * headerBtn.js — Header-Umschalt-Buttons (⌨ Tasten/MIDI, 💬 Hints, e-Mode, …) an
 * ElementSettings anschließen, mit Optik, die einen aktiven „.active"-Zustand überlebt.
 *
 * Vorher (bis auf Kommentare) byte-identisch dreifach dupliziert in overcord/werkbank.js,
 * werkbank-leer/werkbank-leer.js und pitchosc/pitchosc.js (@dpa 20260804, gleicher Fund wie
 * bei ADSR/Scope/mountBenchHelp — s. lib/adsrPanel.js-Kommentar). Jeder Einstiegspunkt legt
 * einmal `wireHeaderBtnSettings` über seine eigene `hdrElemSettings`-Instanz + `state` an
 * und benutzt sie danach wie vorher unverändert:
 *
 *   const hdrElemSettings = new ElementSettings(state);
 *   const wireHeaderBtnSettings = makeWireHeaderBtnSettings({ hdrElemSettings, state });
 *   wireHeaderBtnSettings('keyBtn', keyBtn, 'Tasten/MIDI');
 */
export function makeWireHeaderBtnSettings({ hdrElemSettings, state }) {
    return function wireHeaderBtnSettings(id, btn, defLabel) {
        const field = document.createElement('div'); field.className = 'btn-field hdr-btn-field';
        const labelEl = document.createElement('span'); labelEl.className = 'btn-label';
        field.append(labelEl, btn);
        field.dataset.ctrl = id;
        // Sichtbarer Text in einem eigenen Span, damit ein Icon im Button (⚙) das Umbenennen
        // überlebt — `btn.textContent` würde ALLE Kinder ersetzen (dd.md 20260802).
        let txtEl = btn.querySelector('.hdr-btn-text');
        if (!txtEl) {
            txtEl = document.createElement('span'); txtEl.className = 'hdr-btn-text';
            txtEl.textContent = btn.textContent; btn.textContent = ''; btn.appendChild(txtEl);
        }
        const baseText = txtEl.textContent;
        const applyStyle = (s) => {
            labelEl.textContent = s.label || '';
            field.classList.remove('btn-label-top', 'btn-label-left', 'btn-label-right', 'btn-label-bottom', 'btn-label-off');
            field.classList.add('btn-label-' + (s.labelPos || 'off'));
            const onText = s.textOn || baseText, offText = s.textOff || baseText;
            btn._applyBtnStyle = () => {
                const on = btn.classList.contains('active');
                txtEl.textContent = on ? onText : offText;
                btn.style.background = on ? (s.bgOn || '') : (s.bg || '');
            };
            btn.style.color = s.fg || '';
            btn.style.fontSize = s.size ? s.size + 'px' : '';
            btn.style.padding = s.pad != null ? s.pad + 'px' : '';
            btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
            btn.style.height = s.boxH ? s.boxH + 'px' : '';
            btn._applyBtnStyle();
        };
        // `.active` wird von jedem Header-Button anders/eigenständig geschaltet — statt an
        // jeder Stelle einzeln nachzuziehen, EIN MutationObserver auf die Klasse: repaint
        // (Text/BG) läuft dann automatisch mit, ohne deren Klick-Logik anzufassen.
        new MutationObserver(() => btn._applyBtnStyle && btn._applyBtnStyle())
            .observe(btn, { attributes: true, attributeFilter: ['class'] });
        field.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            hdrElemSettings.open({ id, type: 'button', el: field, defLabel, applyStyle });
        });
        applyStyle((state.get('ctrlStyles') || {})[id] || {});
        return field;
    };
}
