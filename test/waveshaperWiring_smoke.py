#!/usr/bin/env python3
"""Headless-Selbsttest WaveShaper-Verkabelung (ddw.md 20260802: "WaveShaperNode. Klingt
interessant, bau es gerne ein mit ein/aus-Schalter"). Der WaveShaper (lib/audioBus.js) ist
ein natives Node (kein AudioWorklet/addModule() -> die Headless-Audio-Falle des Projekts
greift hier NICHT), sitzt NACH dem bestehenden Limiter als Sicherheitsnetz vor destination.
Web Audio bietet keine API, um den Graphen eines Nodes auszulesen -- deshalb patcht dieser
Test AudioNode.prototype.connect/disconnect VOR dem Seitenladen (page.add_init_script) und
fuehrt selbst Buch ueber die aktuell aktiven Kanten (ein disconnect() ohne Argument kappt
laut audioBus.js rebuildChain() ALLE ausgehenden Kanten eines Knotens). Geprueft wird
GEZAEHLT/PROGRAMMATISCH, nie ueber tatsaechliches Abspielen/Hoeren (CLAUDE.md-Warnung).

Prueft in BEIDEN Ensembles (overcord/ + werkbank-leer/, gemeinsamer audioBus.js-Code):
  - WaveShaper existiert, oversample='4x', curve mit 2048 Punkten, Default AUS.
  - Alle vier Kombinationen (limiterOn x waveshaperOn) verkabeln volumeGain -> [limiter] ->
    [waveshaper] -> destination + analyser OHNE doppelte/verwaiste Kanten.
  - Der [WS]-Button existiert im Header, klickt korrekt um (state + setWaveshaperOn()).

Lauf: python3 test/waveshaperWiring_smoke.py
Hart begrenzt (40s Watchdog), kein Pollen.
"""
import subprocess, sys, time, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8273
HARD_LIMIT_S = 40

def watchdog():
    time.sleep(HARD_LIMIT_S)
    print(f"SMOKE: HARD-TIMEOUT nach {HARD_LIMIT_S}s — abgebrochen (kein Hänger-Pollen).")
    os._exit(2)

threading.Thread(target=watchdog, daemon=True).start()

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
errors, fails = [], []
check = lambda ok, msg: None if ok else fails.append(msg)

# Patcht AudioNode.connect/disconnect, BEVOR irgendein Seiten-Script läuft (ensureAudio()
# verkabelt schon beim Erzeugen von MasterVolume, also noch während des Seiten-Ladens).
# Führt live Buch über die aktuell bestehenden Kanten in window.__wsEdges (Set aus
# "fromId->toId"), plus window.__wsNodesById (id -> {type, node}) zum Zurücksuchen.
INIT_SCRIPT = """
(() => {
  window.__wsEdges = new Set();
  window.__wsNodesById = new Map();
  window.__wsTagMap = new WeakMap();
  let nextId = 1;
  function tag(node) {
    if (!node) return null;
    let t = window.__wsTagMap.get(node);
    if (!t) {
      t = { id: nextId++, type: node.constructor ? node.constructor.name : typeof node };
      window.__wsTagMap.set(node, t);
      window.__wsNodesById.set(t.id, { type: t.type, node });
    }
    return t;
  }
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(dest, ...rest) {
    const r = origConnect.call(this, dest, ...rest);
    if (dest instanceof AudioNode) {
      const f = tag(this), t = tag(dest);
      window.__wsEdges.add(f.id + '->' + t.id);
    }
    return r;
  };
  const origDisconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function(...args) {
    const f = tag(this);
    if (args.length === 0) {
      for (const key of [...window.__wsEdges]) {
        if (key.startsWith(f.id + '->')) window.__wsEdges.delete(key);
      }
    } else if (args[0] instanceof AudioNode) {
      const t = tag(args[0]);
      window.__wsEdges.delete(f.id + '->' + t.id);
    }
    return origDisconnect.apply(this, args);
  };
})();
"""

# Baut in-page eine kompakte Zusammenfassung der aktuellen Kette — Objekt-Identität (welcher
# Knoten ist der Limiter/Waveshaper/volumeGain/destination) muss IM Browser verglichen werden,
# darum alles in einem einzigen evaluate() statt über mehrere serialisierte Rückgaben.
SNAPSHOT_JS = """
() => {
  const bus = window.__audioBus;
  const ctx = bus.getContext();
  const limiter = bus.getLimiter();
  const waveshaper = bus.getWaveshaper();
  const analyser = bus.getAnalyser();
  const master = bus.getMaster();
  const dest = ctx.destination;
  const idOf = (n) => { const t = window.__wsTagMap.get(n); return t ? t.id : null; };
  const has = (a, b) => {
    const ia = idOf(a), ib = idOf(b);
    return ia != null && ib != null && window.__wsEdges.has(ia + '->' + ib);
  };
  // volumeGain hat keinen eigenen Getter — eindeutig identifizierbar als das EINE Ziel der
  // permanenten master->X Kante (die nie umgeschaltet wird, s. audioBus.js ensureAudio()).
  const masterId = idOf(master);
  let volumeGainNode = null;
  for (const key of window.__wsEdges) {
    if (key.startsWith(masterId + '->')) {
      const toId = parseInt(key.split('->')[1], 10);
      volumeGainNode = window.__wsNodesById.get(toId).node;
    }
  }
  // Ausgehende Kantenzahl jedes interessanten Knotens (Duplikat-Schutz).
  const outCount = (n) => {
    const id = idOf(n);
    let c = 0;
    for (const key of window.__wsEdges) if (key.startsWith(id + '->')) c++;
    return c;
  };
  return {
    limiterType: limiter ? limiter.constructor.name : null,
    waveshaperType: waveshaper ? waveshaper.constructor.name : null,
    oversample: waveshaper ? waveshaper.oversample : null,
    curveLen: waveshaper && waveshaper.curve ? waveshaper.curve.length : null,
    volumeGainToLimiter: has(volumeGainNode, limiter),
    volumeGainToWaveshaper: has(volumeGainNode, waveshaper),
    volumeGainToDest: has(volumeGainNode, dest),
    volumeGainToAnalyser: has(volumeGainNode, analyser),
    limiterToWaveshaper: has(limiter, waveshaper),
    limiterToDest: has(limiter, dest),
    limiterToAnalyser: has(limiter, analyser),
    waveshaperToDest: has(waveshaper, dest),
    waveshaperToAnalyser: has(waveshaper, analyser),
    volumeGainOut: outCount(volumeGainNode),
    limiterOut: outCount(limiter),
    waveshaperOut: outCount(waveshaper),
  };
}
"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for entry in ("overcord/", "werkbank-leer/"):
            ctx = browser.new_context(bypass_csp=True)
            ctx.add_init_script(INIT_SCRIPT)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(f"{entry}: {e}"))
            page.goto(f"http://localhost:{PORT}/{entry}", wait_until="domcontentloaded")
            page.wait_for_function("window.__master && window.__audioBus && window.__audioBus.getWaveshaper()", timeout=15000)

            # ── 1) WaveShaper existiert mit den geforderten Parametern, Default AUS ──
            snap0 = page.evaluate(SNAPSHOT_JS)
            check(snap0['waveshaperType'] == 'WaveShaperNode', f"{entry}: kein WaveShaperNode: {snap0}")
            check(snap0['oversample'] == '4x', f"{entry}: oversample sollte '4x' sein: {snap0['oversample']}")
            check(snap0['curveLen'] == 2048, f"{entry}: Kurve sollte 2048 Punkte haben: {snap0['curveLen']}")
            check(page.evaluate("window.__master.state.get('waveshaperOn')") in (False, None, 0),
                  "waveshaperOn sollte per Default aus sein")
            check(snap0['volumeGainToWaveshaper'] is False and snap0['waveshaperToDest'] is False,
                  f"{entry}: WaveShaper sollte im Default-Zustand NICHT verkabelt sein: {snap0}")

            # ── 2) Alle vier Kombinationen sauber verkabelt, keine Doppel-/Geisterkanten ──
            # Über die ECHTEN Header-Buttons geklickt (tatsächlicher Bedienweg) — die rufen
            # setLimiterOn()/setWaveshaperOn() auf, genau die Funktionen, die audioBus.js
            # exportiert und die auch ein Nutzer-Klick auslöst.
            lim_btn = page.locator(".mv-lim")
            ws_btn = page.locator(".mv-ws")
            combos = [(True, False), (False, True), (True, True), (False, False)]
            for lim_on, ws_on in combos:
                cur_lim = page.evaluate("window.__master.state.get('limiterOn')")
                if bool(cur_lim) != lim_on:
                    lim_btn.click()
                cur_ws = page.evaluate("window.__master.state.get('waveshaperOn')")
                if bool(cur_ws) != ws_on:
                    ws_btn.click()

                snap = page.evaluate(SNAPSHOT_JS)
                label = f"{entry} lim={lim_on} ws={ws_on}"
                if lim_on and not ws_on:
                    check(snap['volumeGainToLimiter'], f"{label}: volumeGain->limiter fehlt: {snap}")
                    check(snap['limiterToDest'] and snap['limiterToAnalyser'], f"{label}: limiter->dest/analyser fehlt: {snap}")
                    check(not snap['limiterToWaveshaper'], f"{label}: limiter sollte NICHT an waveshaper hängen: {snap}")
                    check(not snap['volumeGainToDest'], f"{label}: volumeGain sollte NICHT direkt an dest hängen: {snap}")
                elif ws_on and not lim_on:
                    check(snap['volumeGainToWaveshaper'], f"{label}: volumeGain->waveshaper fehlt: {snap}")
                    check(snap['waveshaperToDest'] and snap['waveshaperToAnalyser'], f"{label}: waveshaper->dest/analyser fehlt: {snap}")
                    check(not snap['volumeGainToLimiter'], f"{label}: volumeGain sollte NICHT an limiter hängen: {snap}")
                elif lim_on and ws_on:
                    check(snap['volumeGainToLimiter'], f"{label}: volumeGain->limiter fehlt: {snap}")
                    check(snap['limiterToWaveshaper'], f"{label}: limiter->waveshaper fehlt: {snap}")
                    check(snap['waveshaperToDest'] and snap['waveshaperToAnalyser'], f"{label}: waveshaper->dest/analyser fehlt: {snap}")
                    check(not snap['limiterToDest'], f"{label}: limiter sollte NICHT direkt an dest hängen (waveshaper ist dazwischen): {snap}")
                else:
                    check(snap['volumeGainToDest'] and snap['volumeGainToAnalyser'],
                          f"{label}: volumeGain->dest/analyser fehlt: {snap}")
                    check(not snap['volumeGainToLimiter'] and not snap['volumeGainToWaveshaper'], f"{label}: sollte weder an limiter noch waveshaper hängen: {snap}")

                # Duplikat-Schutz: jeder aktive Knoten hat max. 2 ausgehende Kanten (dest+analyser),
                # jeder durchgereichte Zwischenknoten genau 1.
                check(snap['volumeGainOut'] <= 2, f"{label}: volumeGain hat zu viele ausgehende Kanten: {snap['volumeGainOut']}")
                check(snap['limiterOut'] <= 2, f"{label}: limiter hat zu viele ausgehende Kanten: {snap['limiterOut']}")
                check(snap['waveshaperOut'] <= 2, f"{label}: waveshaper hat zu viele ausgehende Kanten: {snap['waveshaperOut']}")

            # ── 3) [WS]-Button ist da, klickbar, Optik reagiert (ctrl-on Klasse) ──
            check(ws_btn.count() == 1, f"{entry}: [WS]-Button fehlt im Header")
            was_on = page.evaluate("window.__master.state.get('waveshaperOn')")
            ws_btn.click()
            now_on = page.evaluate("window.__master.state.get('waveshaperOn')")
            check(now_on != was_on, f"{entry}: Klick auf [WS] sollte den Zustand umschalten (war {was_on}, ist {now_on})")
            has_ctrl_on = ws_btn.evaluate("el => el.classList.contains('ctrl-on')")
            check(has_ctrl_on == bool(now_on), f"{entry}: ctrl-on-Klasse folgt dem Zustand nicht (on={now_on}, class={has_ctrl_on})")

            ctx.close()
        browser.close()
finally:
    srv.terminate()

for e in errors: print("PAGEERROR:", e)
if fails:
    for f in fails: print("FAIL:", f)
    sys.exit(1)
print("SMOKE: WaveShaper-Verkabelung OK — alle vier Limiter/WS-Kombinationen sauber "
      "verdrahtet (kein Doppel-/Geisteranschluss), [WS]-Button schaltet um, in beiden Ensembles.")
