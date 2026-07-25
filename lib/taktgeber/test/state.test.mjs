// Tests für die State-SSOT: Events, Trennung Werte/Settings. Lauf: node test/state.test.mjs
import { Store, DEFAULTS, SETTINGS_KEYS } from '../state.js';

let pass = 0, fail = 0;
const ok = (n, c) => c ? pass++ : (fail++, console.error('  ✗ ' + n));

// 1) set löst key- und any-Listener aus
{
  const s = new Store(DEFAULTS);
  let kv = null, any = null;
  s.on('bpm', v => kv = v); s.onAny((k, v) => any = [k, v]);
  s.set('bpm', 140);
  ok('key-Listener feuert', kv === 140);
  ok('any-Listener feuert', any && any[0] === 'bpm' && any[1] === 140);
}
// 2) Kein Event bei unverändertem Wert
{
  const s = new Store(DEFAULTS); let n = 0; s.on('metroLevel', () => n++);
  s.set('metroLevel', DEFAULTS.metroLevel); ok('kein Event bei gleichem Wert', n === 0);
  s.set('metroLevel', 0.9); ok('Event bei neuem Wert', n === 1);
}
// 3) exportValues enthält KEINE Settings-Keys; exportSettings nur diese
{
  const s = new Store(DEFAULTS);
  const val = s.exportValues(), set = s.exportSettings();
  ok('Werte ohne Settings-Keys', SETTINGS_KEYS.every(k => !(k in val)));
  ok('bpm in Werten', 'bpm' in val);
  ok('Settings vollständig', SETTINGS_KEYS.every(k => k in set));
  // Jeder Settings-Key MUSS es auch in die Defaults geschafft haben: ein Tippfehler in
  // SETTINGS_KEYS fiele sonst nirgends auf – er würde einen echten Wert still in den
  // Laufzeit-Snapshot rutschen lassen (teslacoils LAYOUT_KEYS-Regel).
  ok('jeder Settings-Key hat einen Default', SETTINGS_KEYS.every(k => k in DEFAULTS));
  ok('Optik nicht in Werten', !('groupColors' in val) && !('groupScales' in val));
}
// 4) reset stellt Default her
{
  const s = new Store(DEFAULTS); s.set('tapTol', 30); s.reset('tapTol');
  ok('reset → Default', s.get('tapTol') === DEFAULTS.tapTol);
}
// 5) off meldet ab — ohne das sammelt jeder UI-Neubau eine weitere Garnitur Horcher an
//    totem DOM an (s. ui.js, `bound`/`pBound`).
{
  const s = new Store(DEFAULTS); let n = 0;
  const fn = s.on('bpm', () => n++);
  s.set('bpm', 130); s.off('bpm', fn); s.set('bpm', 140);
  ok('off hält den Horcher an', n === 1);
  s.off('bpm', fn); s.off('nochNieGehoert', fn);   // darf nicht werfen
  ok('off auf Unbekanntes ist harmlos', true);
}

console.log(`\nState: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
