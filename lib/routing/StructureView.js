/**
 * StructureView.js — read-only Struktur-Ansicht der Routing-Registry (Phase 3,
 * PLAN_OPERA.md Z. 128-135 / PHASE3_SPEC.md). Factory `createStructureView()` — keine
 * Klasse, gleiche Naht wie die Registry/die ISM-Engines.
 *
 * Zweck (@dpa 20260723, der eigentliche Grund für diese Phase): Phase 2 war bewusst
 * unsichtbar/unhörbar verkabelt — dieses Fenster macht sie endlich sichtbar. Liest
 * AUSSCHLIESSLICH über die Registry (`modules()`/`connections()`/`onActivity()`), kennt kein
 * einzelnes ISM direkt — das ist die Entkopplung, die Phase 2 erkauft hat.
 *
 * Hülle aus der `special-pop`-Familie (GroupHost.js makeSpecial/css .special-pop): schwebendes
 * Panel, am Kopf verschiebbar (lib/dragPanel.js), ESC/Außenklick schließt, sanfter Rahmen,
 * kleiner Radius. READ-ONLY heißt: das FENSTER ist verschiebbar, die Kästen darin NICHT.
 */
import { makeDraggable } from '../dragPanel.js';

/**
 * @param {ReturnType<typeof import('./Registry.js').createRoutingRegistry>} registry
 * @param {{ button?: HTMLElement }} opts  `button` = der Header-Opener (für den Außenklick-Skip,
 *   dasselbe Muster wie makeSpecial: ein Klick auf den Opener selbst darf nicht sofort wieder
 *   schließen, was ein Toggle-Handler dort auslöst).
 */
export function createStructureView(registry, opts = {}) {
    let pop = null, boxesEl = null, svg = null;
    let latencyTimer = 0, offActivity = null, resizeObs = null;

    function isOpen() { return !!pop; }

    function fmtLatency(ms) {
        if (ms == null || !isFinite(ms)) return '—';
        return (ms < 0.05 ? 0 : ms).toFixed(1) + ' ms';
    }

    function buildPort(moduleId, port, dir) {
        const cell = document.createElement('div');
        cell.className = 'structure-port structure-port--' + dir;
        if (!port) { cell.classList.add('structure-port--empty'); return cell; }
        cell.dataset.module = moduleId;
        cell.dataset.port = port.id;
        cell.title = port.type;
        const dot = document.createElement('span'); dot.className = 'structure-port-dot';
        const label = document.createElement('span'); label.className = 'structure-port-label';
        label.textContent = port.label || port.id;
        const type = document.createElement('span'); type.className = 'structure-port-type';
        type.textContent = port.type;
        // inputs: Punkt außen (links) → Label → Typ. outputs: Typ → Label → Punkt außen (rechts).
        if (dir === 'in') { cell.append(dot, label, type); } else { cell.append(type, label, dot); }
        return cell;
    }

    function buildBox(mod) {
        const box = document.createElement('div');
        box.className = 'structure-box';
        box.dataset.module = mod.id;

        const head = document.createElement('div'); head.className = 'structure-box-head';
        const title = document.createElement('span'); title.className = 'structure-box-title'; title.textContent = mod.label;
        const lat = document.createElement('span'); lat.className = 'structure-box-lat';
        lat.dataset.latencyFor = mod.id;
        lat.textContent = fmtLatency(mod.latency);
        head.append(title, lat);
        box.appendChild(head);

        const rows = document.createElement('div'); rows.className = 'structure-box-rows';
        const rowCount = Math.max(mod.inputs.length, mod.outputs.length, 1);
        for (let i = 0; i < rowCount; i++) {
            const row = document.createElement('div'); row.className = 'structure-box-row';
            row.appendChild(buildPort(mod.id, mod.inputs[i], 'in'));
            row.appendChild(buildPort(mod.id, mod.outputs[i], 'out'));
            rows.appendChild(row);
        }
        box.appendChild(rows);
        return box;
    }

    function refreshLatencies() {
        if (!pop) return;
        for (const m of registry.modules()) {
            const el = pop.querySelector(`.structure-box-lat[data-latency-for="${m.id}"]`);
            if (el) el.textContent = fmtLatency(m.latency);
        }
    }

    // ── Kabel (SVG-Overlay über den Kästen) — Schritt 3, PHASE3_SPEC.md 3.2/3.4 ────────────
    function portEl(ref) {
        return boxesEl && boxesEl.querySelector(`.structure-port[data-module="${ref.module}"][data-port="${ref.port}"] .structure-port-dot`);
    }
    /** Mittelpunkt eines Buchsen-Punkts relativ zum SVG-Koordinatensystem (= boxesEl-Ursprung). */
    function dotCenter(el) {
        const r = el.getBoundingClientRect();
        const host = boxesEl.getBoundingClientRect();
        return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top };
    }
    function wireEl(c) {
        return svg && svg.querySelector(`path[data-src="${c.src.module}:${c.src.port}"][data-dst="${c.dst.module}:${c.dst.port}"]`);
    }
    function drawWires() {
        if (!svg || !boxesEl) return;
        svg.innerHTML = '';
        const box = boxesEl.getBoundingClientRect();
        svg.setAttribute('width', box.width);
        svg.setAttribute('height', box.height);
        for (const c of registry.connections()) {
            const sEl = portEl(c.src), dEl = portEl(c.dst);
            if (!sEl || !dEl) continue;   // Port gerade nicht sichtbar (sollte nicht vorkommen, robust statt crashen)
            const a = dotCenter(sEl), b = dotCenter(dEl);
            const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
            const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('data-src', `${c.src.module}:${c.src.port}`);
            path.setAttribute('data-dst', `${c.dst.module}:${c.dst.port}`);
            // registry.connections() liefert den src-Port-Typ schon mit (c.type) — kein
            // erneutes Nachschlagen über modules() nötig.
            const isEvent = EVENT_TYPES.has(c.type);
            path.setAttribute('class', 'wire ' + (c.active === false ? 'wire--declared' : (isEvent ? 'wire--event' : 'wire--value')));
            svg.appendChild(path);
        }
    }
    // Welche Typen sind Event-Ports (blitzen bei Aktivität) vs. Value-Ports (ruhig „aktiv").
    // Dieselbe Tabelle wie lib/routing/types.js TYPES[type].kind, hier ohne Import dupliziert
    // wäre unnötig gekoppelt — die Ansicht braucht nur die zwei Namen, die aktuell als event
    // gelten (AmpEnv, Keyboard, Keyboard-Speicher); s. types.js für die Quelle der Wahrheit.
    const EVENT_TYPES = new Set(['AmpEnv', 'Keyboard', 'Keyboard-Speicher']);

    function onActivityPulse({ src, dst }) {
        const el = wireEl({ src, dst });
        if (!el) return;
        el.classList.remove('wire--pulse');
        // Reflow erzwingen, damit ein zweiter Puls kurz nach dem ersten die Transition erneut startet.
        void el.getBoundingClientRect();
        el.classList.add('wire--pulse');
        setTimeout(() => el.classList.remove('wire--pulse'), 220);
    }

    function open() {
        if (pop) return;
        pop = document.createElement('div'); pop.className = 'structure-pop';

        const head = document.createElement('div'); head.className = 'structure-head';
        const t = document.createElement('span'); t.textContent = '⧉ Struktur';
        const x = document.createElement('button'); x.className = 'kme-x'; x.textContent = '✕';
        x.addEventListener('click', close);
        head.append(t, x);
        pop.appendChild(head);

        const body = document.createElement('div'); body.className = 'structure-body';
        const stage = document.createElement('div'); stage.className = 'structure-stage';
        boxesEl = document.createElement('div'); boxesEl.className = 'structure-boxes';
        for (const mod of registry.modules()) boxesEl.appendChild(buildBox(mod));
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'structure-wires');
        stage.append(svg, boxesEl);
        body.appendChild(stage);
        pop.appendChild(body);

        document.body.appendChild(pop);
        const r = (opts.button && opts.button.getBoundingClientRect()) || { left: 0, bottom: 60 };
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
        makeDraggable(pop, head);

        drawWires();
        resizeObs = new ResizeObserver(drawWires);
        resizeObs.observe(boxesEl);

        latencyTimer = setInterval(refreshLatencies, 1000);
        offActivity = registry.onActivity(onActivityPulse);

        setTimeout(() => {
            document.addEventListener('mousedown', onOutside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    }
    function onOutside(e) {
        if (!pop || pop.contains(e.target)) return;
        if (opts.button && (e.target === opts.button || opts.button.contains(e.target))) return;
        close();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function close() {
        if (!pop) return;
        if (latencyTimer) { clearInterval(latencyTimer); latencyTimer = 0; }
        if (offActivity) { offActivity(); offActivity = null; }
        if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        pop.remove();
        pop = null; boxesEl = null; svg = null;
    }

    return { open, close, isOpen };
}
