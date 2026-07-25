// Unit-Tests für den Tab-Tempo-Kern. Lauf: node test/tapTempo.test.mjs
import { TapTempo, foldBpm } from '../tapTempo.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${name} ${extra}`); }
}
function near(a, b, relTol = 0.03) { return Math.abs(a - b) / b <= relTol; }

// Hilfe: eine Serie Taps mit gegebenen Intervallen (ms) abspielen, Zeit ab 0.
function play(tt, intervals, start = 1000) {
  let t = start, last;
  last = tt.tap(t);
  for (const dt of intervals) { t += dt; last = tt.tap(t); }
  return last;
}

// 1) Gleichmäßig 120 BPM (500 ms) → ~120.
{
  const tt = new TapTempo({ mode: 1 });
  const r = play(tt, [500, 500, 500, 500, 500]);
  ok('120 BPM stabil', near(r.bpm, 120), `bpm=${r.bpm.toFixed(2)}`);
}

// 2) Jitter ±20 ms um 500 → global gemittelt nahe 120.
{
  const tt = new TapTempo({ mode: 1 });
  const r = play(tt, [520, 480, 510, 490, 505, 495]);
  ok('120 BPM mit Jitter rastet ein', near(r.bpm, 120, 0.04), `bpm=${r.bpm.toFixed(2)}`);
}

// 3) Ausgelassene Beats: man tappt nur jeden 2. (1000 ms) bei echtem 500-Grid.
//    Erste zwei Klicks setzen Referenz auf 1000 → das IST dann 60 BPM (kein Fehler,
//    da nichts anderes bekannt). Danach ein 500er-Tap muss als k=1 erkannt werden
//    und darf das Tempo nicht halbieren.
{
  const tt = new TapTempo({ mode: 1 });
  // Referenz 500 aufbauen, dann einen doppelt langen (1000) Klick = ausgelassener Beat.
  const r = play(tt, [500, 500, 1000, 500]);
  ok('ausgelassener Beat (2×) erkannt', near(r.bpm, 120, 0.05), `bpm=${r.bpm.toFixed(2)}`);
}

// 4) Dreifach ausgelassen (1500 bei 500-Grid) → k=3, Tempo bleibt ~120.
{
  const tt = new TapTempo({ mode: 1 });
  const r = play(tt, [500, 500, 1500, 500]);
  ok('ausgelassener Beat (3×) erkannt', near(r.bpm, 120, 0.05), `bpm=${r.bpm.toFixed(2)}`);
}

// 5) Fehlklick-Ausreißer in Mode 1 wird verworfen (Tempo bleibt).
{
  const tt = new TapTempo({ mode: 1 });
  const before = play(tt, [500, 500, 500]);
  const r = tt.tap(before ? undefined : 0); // ein Doppelklick-artiger Ausreißer:
  // gezielter: 120 BPM Serie, dann ein 120-ms-Zwischenklick.
  const tt2 = new TapTempo({ mode: 1 });
  let t = 0; tt2.tap(t); t += 500; tt2.tap(t); t += 500; tt2.tap(t); t += 500; const good = tt2.tap(t);
  t += 120; const out = tt2.tap(t); // Ausreißer (nicht ~500, nicht ~1000)
  ok('Ausreißer in Mode 1 verworfen', out.rejected === true && near(out.bpm, good.bpm, 0.001), `bpm=${out.bpm.toFixed(2)} rej=${out.rejected}`);
}

// 6) Mode 2 folgt einem Tempowechsel 120 → 100 BPM (500 → 600 ms).
{
  const tt = new TapTempo({ mode: 2, windowBeats: 3 });
  const r = play(tt, [500, 500, 600, 600, 600, 600, 600]);
  ok('Mode 2 folgt auf 100 BPM', near(r.bpm, 100, 0.06), `bpm=${r.bpm.toFixed(2)}`);
}

// 7) Mode 2 liefert ab dem 3. Klick live=true (für "!go"-Auto-Trigger).
{
  const tt = new TapTempo({ mode: 2 });
  let t = 0; const r1 = tt.tap(t); t += 500; const r2 = tt.tap(t); t += 500; const r3 = tt.tap(t);
  ok('Mode 2 live ab Tap 3', r1.live === false && r2.live === false && r3.live === true);
}

// 8) wait/Pause startet eine neue Serie (fresh=true, bpm wird zurückgesetzt).
{
  const tt = new TapTempo({ mode: 1, waitMs: 2000 });
  let t = 0; tt.tap(t); t += 500; tt.tap(t); t += 500; tt.tap(t);
  t += 5000; const r = tt.tap(t); // lange Pause > waitMs
  ok('Pause startet neue Serie', r.fresh === true && r.tapCount === 1 && r.bpm === null);
}

// 9) Zwei Klicks = sofort eine BPM-Schätzung (kein Warten auf Fenster).
{
  const tt = new TapTempo({ mode: 1 });
  let t = 0; tt.tap(t); t += 400; const r = tt.tap(t);
  ok('2 Klicks → BPM', near(r.bpm, 150), `bpm=${r.bpm.toFixed(2)}`);
}

// 10) foldBpm — das Maximum KLEMMT nicht, es halbiert (@dpa 20260717).
{
  // Genau @dpas Beispiel: „wenn man beispielsweise in 2216 bpm clickt kommt (bei max 400)
  // '277 BpM (*8)' heraus." 2216/8 = 277, und 277 ist die höchste Hälfte unter 400.
  const r = foldBpm(2216, 400);
  ok('2216 bei max 400 → 277 (*8)', near(r.bpm, 277, 0.001) && r.k === 8, `bpm=${r.bpm} k=${r.k}`);

  // Was schon passt, bleibt unangetastet — kein Falten „auf Verdacht".
  const u = foldBpm(120, 400);
  ok('120 bei max 400 bleibt 120 (k=1)', u.bpm === 120 && u.k === 1);

  // Die Grenze selbst gehört noch dazu (≤, nicht <): sonst hieße max 400 in Wahrheit 399.
  const e = foldBpm(400, 400);
  ok('genau das Maximum wird nicht gefaltet', e.bpm === 400 && e.k === 1);

  // Eine Stufe darüber → genau eine Halbierung.
  const o = foldBpm(401, 400);
  ok('401 bei max 400 → 200.5 (*2)', near(o.bpm, 200.5, 0.001) && o.k === 2);

  // Der Absturz-Fall: ein Doppelklick sind ~30 ms = 2000 BPM.
  const c = foldBpm(2000, 400);
  ok('2000 landet unter dem Maximum', c.bpm <= 400 && c.k === 8);

  // Unsinn rein → Unsinn unverändert raus, aber KEINE Endlosschleife.
  ok('0 BPM hängt nicht', foldBpm(0, 400).k === 1);
  ok('max 0 hängt nicht', foldBpm(120, 0).k === 1);
}

console.log(`\nTapTempo: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
