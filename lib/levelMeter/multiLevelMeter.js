/**
 * multiLevelMeter.js — Multi-LevelMeter-Manager (@dpa 20260804): LevelMeter von Singleton-ISM
 * zu vervielfältigbarem Instrument umgebaut. Wie multiRec.js (nicht wie multiEnv/multiScope)
 * braucht JEDE Instanz ihren EIGENEN Analyser-Tap — @dpa wörtlich: „da könnte ich mir
 * wünschen, dass sie an mehreren Stellen abgreifen". Jede Instanz bleibt trotzdem NUR eine
 * GroupHost-Gruppe innerhalb DES EINEN LevelMeter-ISMs (ein `.wb-bench wb-bare`, eine
 * `InstrumentSettings`-Instanz, ein gemeinsamer `mountGroups()`-Host) — keine N eigenen
 * ISM-Sektionen.
 *
 * Tap-Punkt = Input-„Port" (@dpa-Policy „alles bekommt seine Ein-/Ausgänge, Panel ODER
 * versteckt in Settings"): ein PickMenu 's:meterSrc_i' im Panel, 1:1 das Scope-„Quelle"-
 * Muster (multiScope.js), aber GEFILTERT auf `hasNode` (LevelMeter braucht einen ECHTEN
 * AnalyserNode-Tap, keinen reinen Zahlen-`read()`-Wert). Default für Instanz 0 ist EXPLIZIT
 * `'master.out'` (der immer vorhandene, in jeder Einstiegsdatei registrierte Master-Bus-
 * Output NACH Fader/Limiter, s. `registerModule('master', …)`) — das ist exakt der
 * Abgriffspunkt, den der alte Singleton hart über `getBusAnalyser()`/`getBusLimiter()`
 * verdrahtet hatte (kein Sound-/Anzeige-Unterschied nach dem Umbau).
 *
 * Limiter-Reduktionsanzeige (LevelMeter.js zweiter Konstruktor-Parameter) ist NUR am Master
 * sinnvoll (der Limiter sitzt fest in der Master-Kette, s. lib/audioBus.js) — eine Instanz,
 * die einen ANDEREN hasNode-Output abgreift (z.B. eine ADSR aus multiEnv.js), zeigt darum
 * keine Limiter-Spalte (LevelMeter.js kommt damit klar, `getLimiter` ist optional).
 *
 * Zapft ein gewählter Output KEINEN bereits fertigen AnalyserNode ab (z.B. eine ADSR-
 * ConstantSourceNode), baut `makeAnalyserResolver()` pro Instanz EINEN eigenen, lazy
 * angelegten Analyser und verbindet ihn nicht-invasiv an den Quell-Node (dasselbe Tap-Prinzip
 * wie SignalScope.js `_setupAnalyser()`/Scopes.js — „Reinklinken heißt LESEN, NICHT
 * VERKABELN").
 *
 * Migration (@dpa-Auftrag: bestehende Configs/Presets nicht brechen): der alte Singleton
 * hatte GENAU EINE Gruppe „Meter" mit EINEM Control 'u:meter' (unsuffixed). Instanz 0 behält
 * den GRUPPENNAMEN „Meter" (Gruppen-Optik braucht daher keine Migration); der CONTROL-Style
 * 'u:meter' wird einmalig auf 'u:meter_0' migriert (migrateLegacyIds()), damit ein
 * individuell eingestelltes Aussehen erhalten bleibt.
 */
import { LevelMeter } from '../LevelMeter.js';
import { PickMenu } from '../PickMenu.js';

const VALUE_KEYS = ['meterSrc'];
const MASTER_SRC = 'master.out';   // s. Datei-Kopf: Default-Tap, identisch zum alten Singleton

function meterName(i) { return i === 0 ? 'Meter' : 'Meter ' + (i + 1); }

/** Einmalige Migration alter unsuffixed Control-IDs (Singleton-Stand) auf 'id_0' — nur die
 *  flachen Optik-Maps ({id: wert}). */
function migrateLegacyIds(state, pairs) {
    for (const mapKey of ['ctrlStyles', 'keyBindings', 'midiBindings']) {
        const cur = state.get(mapKey);
        if (!cur) continue;
        let changed = false;
        const next = { ...cur };
        for (const [oldId, newId] of pairs) {
            if (oldId in next && !(newId in next)) { next[newId] = next[oldId]; delete next[oldId]; changed = true; }
        }
        if (changed) state.set(mapKey, next);
    }
}

/** Lazy Analyser-Tap für einen beliebigen hasNode-Output — liefert den Node UNVERÄNDERT
 *  zurück, wenn er selbst schon ein AnalyserNode ist (Master-Bus-Output, s. Datei-Kopf),
 *  sonst hängt sie EINMAL einen eigenen Analyser dran (nicht-invasiv, kein Umbau des
 *  bestehenden Signalwegs). Reconnectet automatisch, wenn sich die Quelle ändert. */
function makeAnalyserResolver() {
    let wrap = null, connectedTo = null;
    return (node) => {
        if (!node) return null;
        if (typeof AnalyserNode !== 'undefined' && node instanceof AnalyserNode) return node;
        if (!wrap) { wrap = node.context.createAnalyser(); wrap.fftSize = 512; }
        if (connectedTo !== node) {
            if (connectedTo) { try { connectedTo.disconnect(wrap); } catch { /* schon getrennt */ } }
            node.connect(wrap);
            connectedTo = node;
        }
        return wrap;
    };
}

/**
 * @param {object} o
 * @param {object} o.host   mountGroups()-Rückgabe des LevelMeter-ISMs
 * @param {object} o.state  LevelMeter-ISM-State (MiniState)
 * @param {object} o.routing Routing-Registry
 * @param {() => DynamicsCompressorNode|null} [o.getLimiter]  NUR für die Master-Instanz
 *        genutzt (s. Datei-Kopf) — optional, ohne Angabe bleibt die Limiter-Spalte leer.
 */
export function createLevelMeterManager({ host, state, routing, getLimiter }) {
    const meters = [];   // { meter, pickMenu, resolveAnalyser }
    let sourceCache = routing.outputSources().filter((t) => !!t.hasNode);

    function buildMeter(i) {
        const sfx = '_' + i;
        if (state.get('meterSrc' + sfx) === undefined) {
            // Instanz 0 defaultet auf den Master-Bus (Alt-Verhalten) — jede weitere neue
            // Instanz startet bewusst OHNE Quelle (Anzeige bleibt leer, bis @dpa eine wählt,
            // statt ungefragt nochmal den Master zu zeigen).
            state.set('meterSrc' + sfx, i === 0 ? MASTER_SRC : '');
        }

        host.addGroup({
            name: meterName(i),
            groupKind: 'LevelMeter',
            instanceSuffix: sfx,
            extraSoundKeys: VALUE_KEYS,
        });

        const resolveAnalyser = makeAnalyserResolver();
        const targetFor = (modPort) => sourceCache.find((t) => t.module + '.' + t.port === modPort) || null;
        const currentTarget = () => targetFor(state.get('meterSrc' + sfx));
        const getAnalyser = () => {
            const t = currentTarget();
            if (!t || !t.hasNode || typeof t.node !== 'function') return null;
            return resolveAnalyser(t.node());
        };
        const getLimiterForThis = () => {
            const t = currentTarget();
            return (t && t.module === 'master' && getLimiter) ? getLimiter() : null;
        };

        const meter = new LevelMeter(getAnalyser, getLimiterForThis);
        host.mountInGroup(meterName(i), meter.element, 'u:meter' + sfx);
        host.registerCtrlStyle('u:meter' + sfx, 'levelmeter', meter.element, (s) => meter.applyStyle(s), 'Level');

        const pm = new PickMenu({
            label: 'Quelle',
            empty: '— keine Quelle —',
            noContextOpen: true,
            tailAlign: true,
            title: 'Abgriffspunkt dieses Meters wählen — Fußzeile: Liste neu laden',
            list: () => sourceCache,
            current: () => { const t = currentTarget(); return t ? t.name : ''; },
            onPick: (idx, item) => { state.set('meterSrc' + sfx, item.module + '.' + item.port); },
            foot: [['load', '↪️ Neu laden', 'Liste der verfügbaren Abgriffspunkte neu aus dem Ensemble laden', () => {
                sourceCache = routing.outputSources().filter((t) => !!t.hasNode);
                pm.refresh();
            }]],
        });
        host.mountInGroup(meterName(i), pm.element, 's:meterSrc' + sfx);
        host.registerCtrlStyle('s:meterSrc' + sfx, 'select', pm.element, (s) => {
            const lab = pm.element.querySelector('.pm-label');
            if (lab) lab.textContent = s.label || 'Quelle';
            pm.element.classList.remove('sel-label-top', 'sel-label-left', 'sel-label-right', 'sel-label-bottom', 'sel-label-off');
            pm.element.classList.add('sel-label-' + (s.labelPos || 'top'));
            const btn = pm.element.querySelector('.pm-btn');
            if (btn) {
                btn.style.background = s.bg0 || '';
                btn.style.color = s.fg || '';
                btn.style.fontSize = s.size ? s.size + 'px' : '';
                btn.style.padding = s.pad != null ? s.pad + 'px' : '';
                btn.style.width = s.boxSize ? s.boxSize + 'px' : '';
                btn.style.minWidth = s.boxSize ? s.boxSize + 'px' : '';
            }
        }, 'Quelle');

        meters[i] = { meter, pickMenu: pm };
    }

    function teardownLast() {
        const i = meters.length - 1;
        if (i < 0) return;
        const sfx = '_' + i;
        if (meters[i].pickMenu) meters[i].pickMenu.close();
        meters.splice(i, 1);
        host.removeGroup(meterName(i));
        for (const k of VALUE_KEYS) state.remove(k + sfx);
    }

    function reconcile() {
        let want = state.get('meterCount');
        if (!(want >= 1)) want = 1;
        while (meters.length < want) buildMeter(meters.length);
        while (meters.length > want) teardownLast();
        state.set('meterCount', meters.length);
        return meters.length;
    }

    function init() {
        if (state.get('meterCount') == null) {
            migrateLegacyIds(state, [['u:meter', 'u:meter_0']]);
        }
        reconcile();
    }

    function addMeter() { state.set('meterCount', meters.length + 1); reconcile(); }
    function removeMeter() {
        if (meters.length <= 1) return false;
        state.set('meterCount', meters.length - 1); reconcile(); return true;
    }

    /** Aus dem Render-Loop: jedes Meter zeichnen. */
    function tick() {
        for (const m of meters) m.meter.tick();
    }

    return { init, addMeter, removeMeter, reconcile, meters, count: () => meters.length, tick };
}

/**
 * groupKindSettings-Hook fürs Gruppen-Rechtsklick-Panel (+➚/🚮) — LevelMeter hat KEINEN
 * Header (bewusst „kein Header", s. LevelMeter.js), darum sitzt die Vervielfältigung HIER
 * statt in einem Header-+/− wie bei Rec/Scope/ADSR (dasselbe Vorgehen wie ADSR/Scope
 * SONST, nur ohne die zusätzlichen Header-Buttons, weil dafür kein `<h2>` existiert).
 */
export function createLevelMeterSettingsHook({ meterManager }) {
    return (name, pop, st, row, sfx) => {
        if (!sfx) return;
        const sep = document.createElement('div'); sep.className = 'gs-sep'; pop.appendChild(sep);
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
        const addBtn = document.createElement('button'); addBtn.className = 'wb-help-btn'; addBtn.textContent = '+➚';
        addBtn.title = 'Weiteres Meter anlegen';
        addBtn.addEventListener('click', () => meterManager.addMeter());
        const delBtn = document.createElement('button'); delBtn.className = 'wb-help-btn'; delBtn.textContent = '🚮';
        delBtn.title = 'Letztes Meter löschen (mindestens eines bleibt)';
        delBtn.addEventListener('click', () => {
            if (meterManager.count() <= 1) return;
            if (confirm('Meter wirklich löschen?')) meterManager.removeMeter();
        });
        btnRow.append(addBtn, delBtn);
        pop.appendChild(btnRow);
    };
}
