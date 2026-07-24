/**
 * globalLook.js – ensemble-weite Optik-Defaults (@dpa ddw.md 20260724, main Config):
 * Label-Farbe/-Größe, Wert-Hintergrund, Gruppen-Header-Schriftgröße/-Höhe. Alles läuft über
 * CSS-Custom-Properties auf <html> — die betroffenen Regeln (.knob-label, .select-field,
 * .btn-label, .pm-label, .group-title, .group-title-bar, .knob-value) haben ihre Fallbacks
 * bereits (var(--lab-col, var(--muted)) etc.), hier wird nur der Wert gesetzt/entfernt.
 * Bestehende Pro-Control-Overrides (ctrlStyles[id].fg, inline gesetzt) gewinnen automatisch
 * weiter — Inline-Styles schlagen jede Custom-Property-Fallback-Kette.
 */
const VARS = {
    labelColor: '--lab-col',
    labelSize: '--lab-size',
    valueBg: '--val-bg',
    grpHeadSize: '--grp-head-size',
    grpHeadH: '--grp-head-h',
};
const PX_KEYS = new Set(['labelSize', 'grpHeadSize', 'grpHeadH']);

function applyGlobalLook(state) {
    const root = document.documentElement.style;
    for (const [key, cssVar] of Object.entries(VARS)) {
        const v = state.get(key);
        if (v == null || v === '') { root.removeProperty(cssVar); continue; }
        root.setProperty(cssVar, PX_KEYS.has(key) ? v + 'px' : v);
    }
}

/** Einmal beim Start anwenden + auf künftige Änderungen reagieren. */
export function wireGlobalLook(state) {
    applyGlobalLook(state);
    state.subscribe((key) => { if (key in VARS) applyGlobalLook(state); });
}
