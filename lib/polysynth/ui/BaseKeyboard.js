/**
 * BaseKeyboard.js – 12-Ton-Brett für die Base-Frq-Gruppe (@dpa 20260716_031100).
 *
 * Bewusst NICHT das Skaler-Keyboard: dort ist jede Taste ein Schalter in einer Maske
 * (beliebig viele an), hier gibt es immer genau EINEN Ton – die Basis.
 *
 *   • Quelle 'Ton'  : die Tasten sind bedienbar, Klick wählt die Tonklasse
 *                     (single on/off – ein neuer Ton löst den alten ab).
 *   • sonst (Freq/Tempo): reine ANZEIGE – die tatsächlich klingende BaseFrq wird als
 *                     Tonklasse hervorgehoben. Man sieht also, wo eine frei eingestellte
 *                     Frequenz im Tonraum landet, ohne sie umrechnen zu müssen.
 *
 * Optik teilt es sich mit dem Skaler-Keyboard (.keyboard/.kb-key), inklusive der
 * Größen-/Farb-Variablen aus den Element-Settings. CSS dafür ist in werkbank/css/main.css
 * bereits vorhanden (.keyboard/.kb-key/.base-keyboard.kb-readonly).
 *
 * Port aus teslacoil (js/ui/BaseKeyboard.js), Poly-Synth-Instrument Schritt 1, @dpa
 * 20260721: NOTE_NAMES kommt jetzt aus dem getrimmten polysynth/pitch/Scaler.js statt
 * aus teslacoils ScaleModel.js (die volle Skala-Maske wird hier nicht gebraucht,
 * s. Scaler.js-Kopfkommentar); `hint` ist werkbanks Pendant aus lib/i18n.js.
 */
import { NOTE_NAMES, freqToMidi } from '../pitch/Scaler.js';
import { hint } from '../../i18n.js';

const BLACK = new Set([1, 3, 6, 8, 10]);

export class BaseKeyboard {
    /**
     * @param {import('../core/State.js').State} state
     * @param {() => number} getBaseFreq – die effektive BaseFrq (engine.baseFreq)
     */
    constructor(state, getBaseFreq) {
        this.state = state;
        this.getBaseFreq = getBaseFreq;
        this._lastPc = -1;
        this._lastSrc = null;

        this.element = document.createElement('div');
        this.element.className = 'keyboard base-keyboard';

        const row = document.createElement('div');
        row.className = 'kb-keys';
        this._keys = NOTE_NAMES.map((name, i) => {
            const key = document.createElement('button');
            key.className = 'kb-key ' + (BLACK.has(i) ? 'kb-black' : 'kb-white');
            key.type = 'button';
            const ind = document.createElement('div'); ind.className = 'kb-ind';
            const id = document.createElement('div'); id.className = 'kb-id'; id.textContent = name;
            key.appendChild(ind); key.appendChild(id);
            key.addEventListener('click', () => {
                // Nur im Ton-Modus bedienbar; sonst ist das Brett eine Anzeige.
                if (this.state.get('baseSrc') !== 'Ton') return;
                this.state.set('baseNote', name);
            });
            row.appendChild(key);
            return key;
        });
        this.element.appendChild(row);

        this.refresh();
        state.subscribe((key) => {
            if (key === '*' || key === 'baseSrc' || key === 'baseNote') this.refresh();
        });

        // Eigener, unabhängiger Web-MIDI-Zugriff (@dpa 20260722_155726, ddw.md: „Noten per
        // MIDI direkt die Basis-Tonklasse setzen lassen") — wie PlayKeyboards Performance-MIDI
        // NICHT das Control-Learn aus keymidi/Midi.js (das bindet eine EINZELNE gelernte Note/
        // CC an EIN Control; hier soll dagegen JEDE eingehende Note live die Tonklasse setzen).
        this._armLearn = false;
        this._initMidi();
    }

    /** Button „MIDI lernen": die NÄCHSTE eingehende Note legt die Oktave fest, die bei
     *  „Bereich" AN allein zählt (@dpa: „die Oktave, in der man Midi gelernt hat, ist die
     *  aktive Oktave — darunter und darüber ist dann ignoriert"). */
    armMidiLearn() { this._armLearn = true; }

    _initMidi() {
        if (!navigator.requestMIDIAccess) return;
        navigator.requestMIDIAccess().then((access) => {
            // addEventListener statt der onmidimessage-PROPERTY (@dpa-Bug, entdeckt 20260722):
            // dieselben MIDIInput-Objekte teilen sich Midi.js (3× über GroupHost/mountGroups)
            // UND PlayKeyboard.js' eigenen Roh-Zugriff — mit `.onmidimessage =` überschreibt
            // die zuletzt attachte Stelle alle anderen. `attached` verhindert Doppel-Listener,
            // wenn `attach()` erneut auf onstatechange läuft.
            const attached = new Set();
            const attach = () => {
                for (const inp of access.inputs.values()) {
                    if (attached.has(inp)) continue;
                    attached.add(inp);
                    inp.addEventListener('midimessage', (m) => this._onMidiMessage(m));
                }
            };
            attach(); access.onstatechange = attach;
        }).catch(() => { /* verweigert/nicht verfügbar */ });
    }

    /** Nur Quelle „Ton" ist bedienbar (wie beim Mausklick), Note-on setzt die Tonklasse
     *  (Note mod 12). „MIDI lernen" armiert: die nächste Note legt statt der Tonklasse die
     *  Anker-Oktave fest. Bei `baseMidiRange` AN zählen nur Noten aus genau dieser Oktave. */
    _onMidiMessage(msg) {
        const [status, d1, d2] = msg.data, cmd = status & 0xf0;
        if (cmd !== 0x90 || d2 <= 0) return;   // nur Note-on mit Anschlagstärke
        if (this._armLearn) { this._armLearn = false; this.state.set('baseMidiOctave', Math.floor(d1 / 12)); return; }
        if (this.state.get('baseSrc') !== 'Ton') return;
        if (this.state.get('baseMidiRange') && Math.floor(d1 / 12) !== this.state.get('baseMidiOctave')) return;
        this.state.set('baseNote', NOTE_NAMES[d1 % 12]);
    }

    /** Bedienbar oder Anzeige? Hängt allein an der Quelle. */
    refresh() {
        const src = this.state.get('baseSrc');
        this.element.classList.toggle('kb-readonly', src !== 'Ton');
        // Über die Hilfe-Blase (data-hint), nicht per title – sonst stünde neben der Blase
        // ein zweiter Tooltip, den der Schalter in der Kopfzeile nicht abschalten kann.
        // Zwei ganze Literale statt einem zusammengesetzten Satz: der deutsche Text IST
        // der i18n-Schlüssel (s. js/core/i18n.js).
        hint(this.element, src === 'Ton'
            ? 'Basis-Tonklasse wählen (←/→ schalten sie ebenfalls durch)'
            : 'Zeigt, auf welchem Ton die aktuelle BaseFrq liegt (wählbar nur bei Quelle „Ton")');
        this._lastSrc = src;
        this._lastPc = -1;   // Markierung im nächsten tick() neu setzen
        this.tick();
    }

    /** Läuft im Render-Loop: die klingende Basis wandert (Tempo-Quelle, Band, Glide …). */
    tick() {
        const src = this.state.get('baseSrc');
        if (src !== this._lastSrc) this.refresh();
        // Im Ton-Modus zeigt das Brett die GEWÄHLTE Klasse (die Basis ist per Definition
        // dieser Ton); sonst die, auf der die tatsächliche Frequenz liegt.
        const pc = src === 'Ton'
            ? Math.max(0, NOTE_NAMES.indexOf(this.state.get('baseNote')))
            : ((Math.round(freqToMidi(Math.max(1e-9, this.getBaseFreq()))) % 12) + 12) % 12;
        if (pc === this._lastPc) return;   // nur bei echtem Wechsel ins DOM fassen
        this._lastPc = pc;
        this._keys.forEach((k, i) => k.classList.toggle('kb-on', i === pc));
    }

    mount(parent) { parent.appendChild(this.element); }
}
