/**
 * ui.js — der generische Renderer: baut Gruppen und Controls aus dem Manifest
 * ([modules.js](modules.js)) und bindet jedes Control bidirektional an den State.
 *
 * Er kennt KEINEN einzigen Parameter beim Namen. Was er kennt, sind Sorten (`range`,
 * `toggle`, `segment`, `keybind`) und Aktions-Blöcke, die der Aufrufer beisteuert
 * (`actions` in `mount`). Ein neuer Regler ist damit ein Eintrag im Manifest, sonst nichts
 * – dieselbe Arbeitsteilung wie in teslacoils app.js, nur klein.
 *
 * Zwei Sorten Settings (@dpa 20260717: „Settings müssen getrennt werden"):
 *   · **Ansicht** — Farbe, Größe, Sichtbarkeit. Baut diese Datei für JEDE Gruppe selbst,
 *     das Manifest sagt darüber nichts.
 *   · **Technik** — die Controls mit `tech: true` aus dem Manifest.
 * Beide leben in EINEM schwebenden Fenster pro Gruppe – aufgeklappte Blöcke im Körper
 * schoben sonst alles darunter weg.
 */
import { state } from './state.js';
import { midiName } from './midi.js';

const isHidden = (key) => state.get('hiddenControls').includes(key);
const fmtVal = (c, v) => (c.fmt ? c.fmt(v) : String(v)) + (c.unit || '');

/**
 * „Knob ohne Knob" (@dpa 20260717): ein Zahlenwert, den man waagerecht ZIEHT statt einen
 * Fader zu schieben – Pfeiltasten und Mausrad justieren fein. Ein Baustein, kein Control:
 * er hängt an `get`/`set`, damit ihn sowohl Manifest-Ranges (makeDragNum) als auch der
 * MIDI-Kanal (0–16) benutzen können, ohne dafür einen State-Key zu brauchen.
 *  Rückgabe `{ refresh }` – der Aufrufer verdrahtet das mit seiner Datenquelle.
 */
function dragValue(el, { get, set, min, max, step, fmt }) {
    el.classList.add('dragnum'); el.tabIndex = 0;
    const clamp = (v) => Math.max(min, Math.min(max, Math.round(v / step) * step));
    const show = () => { el.textContent = fmt ? fmt(get()) : String(get()); };
    show();
    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        el.setPointerCapture(e.pointerId); el.classList.add('drag');
        const x0 = e.clientX, v0 = get(), span = (max - min) || 1;
        // ~220px zieht den ganzen Bereich durch – schnell genug, aber noch treffbar.
        const move = (ev) => { set(clamp(v0 + (ev.clientX - x0) / 220 * span)); show(); };
        const up = () => {
            el.classList.remove('drag');
            el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
        e.preventDefault();
    });
    el.addEventListener('keydown', (e) => {
        const d = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? +step
            : (e.key === 'ArrowDown' || e.key === 'ArrowLeft') ? -step : 0;
        if (d) { set(clamp(get() + d)); show(); e.preventDefault(); }
    });
    el.addEventListener('wheel', (e) => { set(clamp(get() + (e.deltaY < 0 ? step : -step))); show(); e.preventDefault(); }, { passive: false });
    return { refresh: show };
}

/** Reine Modifikator-Tasten – als Shortcut sinnlos und beim Belegen im Weg: wer „!" will,
 *  drückt Shift+1, und der Shift-Keydown kommt zuerst (@dpa 20260717: „erscheint ‚shift'…
 *  aber ‚meta' – völlig sinnlos"). */
const MOD_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/**
 * Jeder State-Horcher, den ein Aufbau anlegt, wird notiert und beim Abräumen wieder
 * abgemeldet – sonst hinge nach jedem Ein-/Ausblenden (und nach jedem geöffneten
 * Settings-Fenster) eine weitere Garnitur an totem DOM und liefe stumm mit.
 *
 * Zwei Listen, weil beides unabhängig verschwindet: `bound` gehört dem Gruppen-Aufbau
 * (`rebuild`), `pBound` dem schwebenden Fenster (`closePanel`). Wohin ein neuer Horcher
 * geht, sagt `sink` – so landen auch die Controls, die BEIDE Seiten bauen (`makeControl`
 * im Settings-Raster), automatisch bei dem, der sie später wegräumt. `on()` statt
 * `state.on()` benutzen, das ist der ganze Unterschied.
 */
const bound = [], pBound = [], mBound = [];
let sink = bound;
function on(key, fn) { state.on(key, fn); sink.push([key, fn]); return fn; }
function unbind(list) { for (const [k, f] of list) state.off(k, f); list.length = 0; }
/** `fn` bauen und dabei alle Horcher auf `list` schreiben. */
function into(list, fn) { const prev = sink; sink = list; try { return fn(); } finally { sink = prev; } }

/** Einen Eintrag in einem State-Objekt (groupColors/groupScales) setzen. Immer als NEUES
 *  Objekt: `Store.set` vergleicht mit `===` und schluckte eine Mutation an Ort und Stelle. */
function setIn(key, id, val) { state.set(key, { ...state.get(key), [id]: val }); }
const getIn = (key, id, dflt) => { const v = state.get(key)[id]; return v === undefined ? dflt : v; };

/* ═══ Controls ═══════════════════════════════════════════════════════════════ */

function makeRange(c) {
    const w = document.createElement('label'); w.className = 'ctrl'; w.dataset.key = c.key;
    const val = document.createElement('span'); val.className = 'val';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.id = 'ctrl-' + c.key;
    const sync = () => { inp.value = state.get(c.key); val.textContent = fmtVal(c, parseFloat(inp.value)); };
    inp.addEventListener('input', () => state.set(c.key, parseFloat(inp.value)));
    on(c.key, sync); sync();
    w.append(c.label + ' ', val, inp);
    attachMenu(w, c); return w;
}

function makeToggle(c) {
    const w = document.createElement('label'); w.className = 'ctrl tog'; w.dataset.key = c.key;
    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = 'ctrl-' + c.key;
    const sync = () => inp.checked = state.get(c.key);
    inp.addEventListener('change', () => state.set(c.key, inp.checked));
    on(c.key, sync); sync();
    w.append(inp, ' ' + c.label);
    attachMenu(w, c); return w;
}

function makeSegment(c) {
    const w = document.createElement('div'); w.className = 'ctrl'; w.dataset.key = c.key;
    const lab = document.createElement('span'); lab.textContent = c.label;
    const seg = document.createElement('span'); seg.className = 'seg';
    for (const o of c.options) {
        const b = document.createElement('button'); b.textContent = o.l; b.dataset.v = o.v;
        b.onclick = () => state.set(c.key, o.v); seg.appendChild(b);
    }
    const sync = () => { for (const b of seg.children) b.classList.toggle('sel', String(state.get(c.key)) === b.dataset.v); };
    on(c.key, sync); sync();
    w.append(lab, seg);
    attachMenu(w, c); return w;
}

/**
 * Tasten-Belegung: Klick → das Feld horcht auf den nächsten Tastendruck und übernimmt ihn
 * (@dpa 20260717 wollte Shortcuts einstellbar). Kein Eingabefeld für den Tastennamen: wer
 * „[" belegen will, drückt „[" – niemand soll wissen müssen, wie ein `KeyboardEvent.key`
 * heißt. ESC bricht ab, Backspace/Delete löscht die Belegung.
 */
// Die Taste GENAU so zeigen, wie sie gespeichert ist (immer klein): ein hochgestelltes „G"
// für ein gespeichertes „g" täuschte einen Groß-/Shift-Unterschied vor, den es nicht gibt
// (Belegung + Vergleich laufen klein) – @dpa: „zwischen klein und Groß sehe ich keinen
// Unterschied". Leer bleibt LEER, kein „—" (das las sich wie die Taste „–") – @dpa 20260717.
export const keyLabel = (k) => !k ? '' : k === 'space' ? 'Leertaste' : k;

function makeKeybind(c) {
    const w = document.createElement('div'); w.className = 'ctrl kbrow'; w.dataset.key = c.key;
    const b = document.createElement('button'); b.className = 'kb'; b.type = 'button'; b.title = c.info || '';
    const sync = () => { b.textContent = keyLabel(state.get(c.key)); };
    on(c.key, sync); sync();
    b.onclick = () => {
        if (b.classList.contains('listen')) return;
        b.classList.add('listen'); b.textContent = '… Taste drücken';
        const done = () => { b.classList.remove('listen'); sync(); window.removeEventListener('keydown', grab, true); };
        const grab = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') return done();
            if (e.key === 'Backspace' || e.key === 'Delete') { state.set(c.key, ''); return done(); }
            // Reine Modifikatoren durchlassen, NICHT übernehmen: der nächste echte Tastendruck
            // (bei Shift+1 also „!") ist die Belegung. Sonst fing der Shift-Keydown alles ab
            // und „!" landete nie, „1" kam nicht durch (@dpa 20260717).
            if (MOD_KEYS.has(e.key)) return;
            // Genau `e.key` speichern, NICHT kleingemacht (@dpa 20260717_180719: „Shift+S …
            // es funktionieren beide"): so ist „S" (Shift+s) eine ANDERE Belegung als „s" –
            // Anzeige und Vergleich (index.html evKey) laufen beide über den rohen Key.
            state.set(c.key, e.code === 'Space' ? 'space' : e.key);
            done();
        };
        window.addEventListener('keydown', grab, true);
    };
    // Kleines × räumt die Belegung weg (auf „nichts", @dpa 20260717) – sichtbar statt der
    // versteckten Backspace/Entf-Geste. Klick darf das Belegen nicht mit auslösen.
    const clr = document.createElement('button'); clr.className = 'kb-x'; clr.type = 'button'; clr.textContent = '×';
    clr.title = 'Belegung löschen (kein Shortcut)';
    clr.onclick = (e) => { e.stopPropagation(); state.set(c.key, ''); };
    w.append(b, clr);
    attachMenu(w, c); return w;
}

function makeControl(c) {
    return c.type === 'range' ? makeRange(c)
        : c.type === 'toggle' ? makeToggle(c)
            : c.type === 'keybind' ? makeKeybind(c)
                : makeSegment(c);
}

/* ═══ Rechtsklick am Control: Info · ausblenden · Reset ══════════════════════ */

let menuEl = null;
export function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; unbind(mBound); } }
function attachMenu(w, c) {
    w.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(c, e.clientX, e.clientY); });
}
function openMenu(c, x, y) {
    closeMenu();
    menuEl = document.createElement('div'); menuEl.className = 'popover';
    const t = document.createElement('div'); t.className = 'pt'; t.textContent = c.label;
    const i = document.createElement('div'); i.className = 'pi'; i.textContent = c.info || '';
    const hide = document.createElement('button'); hide.textContent = 'ausblenden';
    hide.onclick = () => {
        const h = state.get('hiddenControls').slice();
        if (!h.includes(c.key)) h.push(c.key);
        state.set('hiddenControls', h); closeMenu(); rebuild();
    };
    const rst = document.createElement('button'); rst.textContent = 'Reset';
    rst.onclick = () => { state.reset(c.key); closeMenu(); };
    menuEl.append(t, i, hide, rst);
    // Kein MIDI-„Untermenü" mehr im Popover (@dpa 20260717_180719: „funktioniert nicht
    // richtig, ist auch überflüssig – kann weg"). MIDI läuft komplett über das 🎹-Icon am
    // Control und das Banner, das es öffnet.
    document.body.appendChild(menuEl);
    menuEl.style.left = Math.min(x, innerWidth - 210) + 'px';
    menuEl.style.top = Math.min(y, innerHeight - 130) + 'px';
}
window.addEventListener('click', closeMenu);

/* ═══ MIDI-Learn (alle Controls, @dpa 20260717) ══════════════════════════════ */

let _midi = null;
/** Ziel einer Bindung: die Action eines Knopfes (`act`) hat Vorrang vor dem Wert-Key. */
const midiTarget = (c) => c.act || c.key;

// Ein einziges schwebendes MIDI-Banner „über dem Settingsfenster". Es ist der GANZE
// MIDI-Editor eines Ziels (@dpa 20260717_180719, Popover-„Untermenü" ist weg): ist noch
// nichts belegt, horcht es sofort; ist etwas belegt, zeigt es die Bindung + den Kanal als
// gezogenen 0–16-Wert (später verstellbar) + „neu" + Löschen.
let midiEl = null, midiId = null, midiLabel = '';
/** Schließt das Banner. Rückgabe: ob eines offen war – so nimmt ESC ERST das Banner weg
 *  und lässt das Settings-Fenster stehen (eine Ebene nach der anderen). */
export function closeMidi() {
    if (!midiEl) return false;
    midiEl.remove(); midiEl = null; midiId = null;
    if (_midi) _midi.cancelLearn();
    return true;
}
function openMidi(targetId, label) {
    if (!_midi) return;
    closeMidi();
    midiEl = document.createElement('div'); midiEl.className = 'midi-learn';
    midiId = targetId; midiLabel = label;
    document.body.appendChild(midiEl);
    if (_midi.binding(targetId)) paintMidi(); else startMidiListen();
}
const mlIco = () => Object.assign(document.createElement('span'), { className: 'ml-ico', textContent: '🎹' });
const mlClose = () => { const x = document.createElement('button'); x.className = 'p-x'; x.textContent = '✕'; x.onclick = closeMidi; return x; };

/** Horch-Modus: der nächste Regler/die nächste Note wird übernommen (Kanal gleich mit). */
function startMidiListen() {
    if (!midiEl) return;
    _midi.startLearn(midiId);
    midiEl.innerHTML = '';
    const txt = document.createElement('span'); txt.className = 'ml-txt';
    txt.append('MIDI lernen: ', Object.assign(document.createElement('b'), { textContent: midiLabel }),
        ' — jetzt eine Note spielen oder einen Regler bewegen · ESC bricht ab');
    midiEl.append(mlIco(), txt, mlClose());
}
/** Editor-Modus: gelernte Bindung, Kanal (ziehbar), neu lernen, löschen. */
function paintMidi() {
    if (!midiEl) return;
    const b = _midi.binding(midiId);
    midiEl.innerHTML = '';
    const txt = document.createElement('span'); txt.className = 'ml-txt';
    txt.append(Object.assign(document.createElement('b'), { textContent: midiLabel }), ': ' + midiName(b) + ' · Kanal ');
    const ch = document.createElement('span'); ch.className = 'ml-ch'; ch.title = 'MIDI-Kanal (0 = alle) – ziehen';
    dragValue(ch, {
        get: () => (_midi.binding(midiId) || {}).ch || 0, set: (v) => _midi.setChannel(midiId, v),
        min: 0, max: 16, step: 1, fmt: (v) => v === 0 ? 'alle' : String(v),
    });
    txt.append(ch);
    const relearn = document.createElement('button'); relearn.className = 'ml-btn'; relearn.textContent = 'neu';
    relearn.title = 'Andere Note/Regler lernen'; relearn.onclick = startMidiListen;
    const del = document.createElement('button'); del.className = 'ml-btn'; del.textContent = '× löschen';
    del.onclick = () => { _midi.clear(midiId); closeMidi(); };
    midiEl.append(mlIco(), txt, relearn, del, mlClose());
}
/** Rückmeldung vom Lernen: sobald gebunden, in den Editor-Modus wechseln. */
function onLearn(id, st) {
    if (!midiEl || midiId !== id || st === 'listening') return;
    if (st && typeof st === 'object') paintMidi();
}

/** Kleines 🎹 am Control (@dpa): ein Klick öffnet das MIDI-Banner (Learn bzw. Editor).
 *  Zeigt sich erst beim Überfahren des Controls – belegte bleiben sichtbar (s. takt.css). */
function midiIcon(targetId, label) {
    const b = document.createElement('button'); b.className = 'midi-ic'; b.type = 'button'; b.textContent = '🎹';
    b.title = 'MIDI lernen';
    b.onclick = (e) => { e.stopPropagation(); openMidi(targetId, label); };
    const sync = () => b.classList.toggle('bound', !!(_midi && _midi.binding(targetId)));
    on('midiBindings', sync); sync();
    return b;
}

/** Ein Control + sein 🎹-Icon in einer Zeile. EIN Ort, an dem das Icon angehängt wird –
 *  Körper wie Settings gehen hier durch, kein doppeltes Anhängen. */
function withMidi(el, c) {
    if (!_midi) return el;
    const wrap = document.createElement('span'); wrap.className = 'mwrap';
    wrap.append(el, midiIcon(midiTarget(c), c.label));
    return wrap;
}

/* ═══ Schwebendes Settings-Fenster pro Gruppe ═══════════════════════════════ */

let panelEl = null;
export function closePanel() {
    if (!panelEl) return;
    panelEl.remove(); panelEl = null;
    unbind(pBound);
}

/** Titelleiste zum Verschieben – wie teslacoils dragPanel.js, ohne Persistenz: beim
 *  nächsten Öffnen steht das Fenster wieder an seiner Gruppe. */
function makeDraggable(panel, handle) {
    handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.p-x')) return;
        const r = panel.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = (ev) => {
            panel.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + 'px';
            panel.style.top = Math.max(0, Math.min(innerHeight - 30, ev.clientY - dy)) + 'px';
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        e.preventDefault();
    });
}

/** Eine Raster-Zeile Label→Eingabe. `info` (@dpa 20260717: „jedes Einzelteil mit hint") als
 *  Tooltip auf BEIDE Seiten – man landet mit dem Zeiger mal auf dem Label, mal auf dem Wert. */
function gridRow(grid, label, el, info) {
    const l = document.createElement('label'); l.textContent = label;
    if (info) { l.title = info; el.title = el.title || info; }
    grid.append(l, el);
}

/** Ein Manifest-`range` als gezogener Wert („Knob ohne Knob", @dpa 20260717) – kein Fader. */
function makeDragNum(c) {
    const el = document.createElement('span'); el.className = 'val';
    const api = dragValue(el, {
        get: () => state.get(c.key), set: (v) => state.set(c.key, v),
        min: c.min, max: c.max, step: c.step, fmt: (v) => fmtVal(c, v),
    });
    on(c.key, api.refresh);
    return el;
}

/** Regler + Wertanzeige für einen Manifest-Eintrag, im Settings-Raster – mit MIDI-Icon
 *  daneben (@dpa 20260717: „ein Icon neben die Shortcut"). */
function techRow(grid, c) {
    let el;
    if (c.type === 'range' && c.drag) {
        el = makeDragNum(c);
    } else if (c.type === 'range') {
        const box = document.createElement('span');
        const inp = document.createElement('input');
        inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step;
        const v = document.createElement('span'); v.className = 'v';
        const sync = () => { inp.value = state.get(c.key); v.textContent = fmtVal(c, parseFloat(inp.value)); };
        inp.addEventListener('input', () => state.set(c.key, parseFloat(inp.value)));
        on(c.key, sync); sync();
        box.append(v, inp);
        el = box;
    } else {
        el = makeControl(c);
    }
    gridRow(grid, c.label, withMidi(el, c), c.info);
}

function openSettings(mod, anchor) { closePanel(); into(pBound, () => buildSettings(mod, anchor)); }

function buildSettings(mod, anchor) {
    const p = document.createElement('div'); p.className = 'panel';
    const head = document.createElement('div'); head.className = 'p-head';
    const t = document.createElement('div'); t.className = 't'; t.textContent = mod.title + ' · Settings';
    const x = document.createElement('button'); x.className = 'p-x'; x.textContent = '✕'; x.onclick = closePanel;
    head.append(t, x);
    const body = document.createElement('div'); body.className = 'p-body';
    p.append(head, body);

    // ── Ansicht (die „üblichen": farbe, größe) ──
    const s1 = document.createElement('div'); s1.className = 'p-sub'; s1.textContent = 'Ansicht';
    const g1 = document.createElement('div'); g1.className = 'p-grid';
    // Zwei Wähler in EINER Zelle: VG und BG sind ein Paar, keine zwei Einstellungen.
    // Das ✕ daneben nimmt die Farbe wieder weg (statt „Standard" raten zu müssen).
    const cols = document.createElement('span'); cols.className = 'p-cols';
    const colorPick = (key, dflt, title) => {
        const c = document.createElement('input'); c.type = 'color'; c.title = title;
        c.value = getIn(key, mod.id, dflt);
        c.addEventListener('input', () => setIn(key, mod.id, c.value));
        const x = document.createElement('button'); x.className = 'p-x'; x.textContent = '✕';
        x.title = title + ' zurücknehmen';
        x.onclick = () => { setIn(key, mod.id, undefined); c.value = dflt; };
        cols.append(c, x);
    };
    colorPick('groupColors', '#4fc3f7', 'Vordergrund (Titel, Rahmen, Regler)');
    colorPick('groupBgs', '#1d2027', 'Hintergrund');
    gridRow(g1, 'Farbe VG / BG', cols, 'Vordergrund (Titel, Rahmen, Regler) und Hintergrund der Gruppe; ✕ nimmt die Farbe zurück.');
    const scBox = document.createElement('span');
    const sc = document.createElement('input'); sc.type = 'range'; sc.min = 0.8; sc.max = 1.6; sc.step = 0.05;
    const scv = document.createElement('span'); scv.className = 'v';
    const scSync = () => { const v = getIn('groupScales', mod.id, 1); sc.value = v; scv.textContent = (+v).toFixed(2) + '×'; };
    sc.addEventListener('input', () => setIn('groupScales', mod.id, parseFloat(sc.value)));
    on('groupScales', scSync); scSync();
    scBox.append(scv, sc);
    gridRow(g1, 'Größe', scBox, 'Skaliert Schrift und Bedienelemente dieser Gruppe (0,8×–1,6×).');
    body.append(s1, g1);

    // ── Sichtbarkeit ──
    if (mod.controls?.length) {
        const s = document.createElement('div'); s.className = 'p-sub'; s.textContent = 'Sichtbarkeit';
        const list = document.createElement('div'); list.className = 'vislist';
        // Nur der Körper steht zur Wahl: ein ausgeblendetes Technik-Control wäre nirgends
        // mehr erreichbar – auch nicht hier, wo man es wieder einschalten müsste.
        for (const c of mod.controls.filter((c) => !c.tech)) {
            const l = document.createElement('label');
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !isHidden(c.key);
            cb.onchange = () => {
                const h = state.get('hiddenControls').slice();
                const i = h.indexOf(c.key);
                if (cb.checked && i >= 0) h.splice(i, 1); else if (!cb.checked && i < 0) h.push(c.key);
                state.set('hiddenControls', h); rebuild();
            };
            l.append(cb, c.label); l.title = c.info || ''; list.appendChild(l);
        }
        if (list.children.length) body.append(s, list);
    }

    // ── Technik ──
    // Kein „TECHNIK"-Titel mehr, sondern ein sanfter Strich (@dpa 20260717): der Abschnitt
    // ist ohnehin der letzte, der Strich trennt ihn von der Ansicht, ohne ein Wort zu kosten.
    const tech = (mod.controls || []).filter((c) => c.tech);
    if (tech.length) {
        const hr = document.createElement('div'); hr.className = 'p-div'; hr.title = 'Technik';
        const g = document.createElement('div'); g.className = 'p-grid';
        for (const c of tech) techRow(g, c);
        body.append(hr, g);
    }
    // Was sich nicht deklarieren lässt (MIDI-Learn), steuert der Aufrufer bei — dieselbe
    // Tür wie die Aktions-Blöcke im Körper, nur für die Settings.
    const extra = _actions[mod.id + ':settings'];
    if (extra) body.append(extra());
    if (mod.settingsInfo) {
        const n = document.createElement('div'); n.className = 'p-note'; n.textContent = mod.settingsInfo;
        body.append(n);
    }

    document.body.appendChild(p);
    panelEl = p;
    const r = anchor.getBoundingClientRect();
    p.style.left = Math.min(r.left, innerWidth - p.offsetWidth - 8) + 'px';
    p.style.top = Math.min(r.bottom + 4, innerHeight - p.offsetHeight - 8) + 'px';
    makeDraggable(p, head);
    // Klick ins Fenster darf es nicht schließen (der Body-Handler unten schließt sonst
    // beim ersten Reglerzug wieder zu).
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('pointerdown', function once(e) {
        if (p.isConnected && !p.contains(e.target)) { closePanel(); window.removeEventListener('pointerdown', once); }
    });
}

/* ═══ Gruppen ═══════════════════════════════════════════════════════════════ */

let _root = null, _mods = null, _actions = null;

function buildGroup(mod) {
    const g = document.createElement('div'); g.className = 'group'; g.dataset.group = mod.id;
    // VG und BG getrennt (@dpa 20260717_151145). Beide als CSS-Variable an der Gruppe:
    // was sie einfärben (Titel, Rahmen, Regler, Beat-Punkte …), entscheidet takt.css –
    // hier steht nur, WELCHE Farbe gilt. Nichts gesetzt = die Variable fällt weg und der
    // Default aus dem Stylesheet greift (`var(--gcol, var(--line))`).
    const paint = () => {
        const set = (prop, key) => {
            const v = state.get(key)[mod.id];
            if (v) g.style.setProperty(prop, v); else g.style.removeProperty(prop);
        };
        set('--gcol', 'groupColors');
        set('--gbg', 'groupBgs');
        g.style.setProperty('--gs', getIn('groupScales', mod.id, 1));
    };
    for (const k of ['groupColors', 'groupBgs', 'groupScales']) on(k, paint);
    paint();

    const head = document.createElement('div'); head.className = 'g-head';
    const arrow = document.createElement('span'); arrow.className = 'g-arrow'; arrow.textContent = '▼';
    const title = document.createElement('span'); title.className = 'g-title'; title.textContent = mod.title;
    head.append(arrow, title);
    // Eine Regel für Settings, wie in teslacoil: RECHTSKLICK. Kein ⚙ an der Gruppe – das
    // ist der Knopf, den man sonst überall wieder unterbringen und erklären muss.
    head.title = 'Klick = ein-/ausklappen · Rechtsklick = Settings';
    head.onclick = () => {
        const c = state.get('closedGroups').slice();
        const i = c.indexOf(mod.id);
        if (i >= 0) c.splice(i, 1); else c.push(mod.id);
        state.set('closedGroups', c);
        g.classList.toggle('closed', i < 0);
    };
    head.addEventListener('contextmenu', (e) => { e.preventDefault(); openSettings(mod, g); });

    const body = document.createElement('div'); body.className = 'g-body';
    g.append(head, body);
    if (state.get('closedGroups').includes(mod.id)) g.classList.add('closed');

    for (const a of mod.actions || []) if (_actions[a]) body.appendChild(_actions[a]());

    // Körper-Controls (nicht `tech`, nicht ausgeblendet) — in EINER dichten Zeile, jedes mit
    // seinem 🎹-Icon (erscheint erst beim Überfahren, s. takt.css) → MIDI wirklich für ALLE.
    const row = document.createElement('div'); row.className = 'row';
    for (const c of mod.controls || []) if (!c.tech && !isHidden(c.key)) row.appendChild(withMidi(makeControl(c), c));
    if (row.children.length) body.appendChild(row);

    for (const a of mod.actions || []) if (_actions[a + ':after']) body.appendChild(_actions[a + ':after']());
    return g;
}

/** Alles neu bauen (nach Sichtbarkeits-Änderungen). Klapp-Zustand steckt im State. */
export function rebuild() {
    if (!_root) return;
    unbind(bound);
    _root.innerHTML = '';
    into(bound, () => { for (const mod of _mods) _root.appendChild(buildGroup(mod)); });
}

/**
 * @param {HTMLElement} root
 * @param {Array} mods    das Manifest (MODULES)
 * @param {Object} actions  id → () => HTMLElement; `id:after` hängt UNTER die Controls.
 * @param {import('./midi.js').Midi} [midi]  optional – schaltet MIDI-Learn frei.
 */
export function mount(root, mods, actions, midi) {
    _root = root; _mods = mods; _actions = actions;
    _midi = midi || null;
    if (_midi) _midi.onLearn(onLearn);
    rebuild();
}
