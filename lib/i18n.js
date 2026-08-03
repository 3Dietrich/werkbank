/**
 * i18n.js – Deutsch/Englisch umschalten (@dpa 20260716_164359: „Es soll sowohl für einen
 * deutschen, als auch english speaker alles Verständlich sein … Auf jeden Fall sollen alle
 * Help-Hints englisch / deutsch umgeschaltet werden").
 *
 * ZWEI Regeln, die dieses Modul trägt:
 *
 * 1. Der DEUTSCHE TEXT IST DER SCHLÜSSEL. Kein `t('hint.sync.title')`-Umbau: im Code steht
 *    weiter der lesbare deutsche Satz, EN[] übersetzt ihn. Fehlt eine Übersetzung, erscheint
 *    Deutsch – nie ein nackter Schlüssel. Der Preis: ändert jemand den deutschen Text, greift
 *    seine Übersetzung nicht mehr (sie fällt still auf Deutsch zurück). Dagegen steht der
 *    Wächter in test/logic.test.mjs, der EN[] gegen die im Code gefundenen Hints prüft.
 *
 * 2. Selbst ernannte Labels bleiben unangetastet (@dpa: „Die selbst ernennbaren Labels und
 *    Controls NICHT umbenennen"). Übersetzt wird nur, was das Instrument selbst sagt –
 *    Hints, Knöpfe, Settings-Beschriftungen. Was der User in `knobMeta`/`ctrlStyles`
 *    getippt hat, geht hier nie durch.
 *
 * Live-Umschaltung: `hint(el, text)` merkt sich das Element samt deutschem Original;
 * `setLang()` zeichnet alle gemerkten neu. Elemente, die aus dem DOM verschwinden, fallen
 * beim nächsten Durchlauf aus der Liste (kein Leak).
 */

export const LANGS = ['de', 'en'];

/**
 * DE → EN. Schlüssel = exakt der deutsche Text aus dem Code.
 * Kurz und im Ton des Instruments, nicht wörtlich rückübersetzt.
 */
const EN = {
    // ── Transport ──
    'Leertaste = Start/Stop': 'Spacebar = start/stop',
    'Sync: der nächste Trigger wird zur 1 – der Takt läuft unbeirrt weiter':
        'Sync: the next trigger becomes the 1 – the clock keeps running undisturbed',
    'Sofort-Sync: die 1 fällt jetzt – der Takt beginnt hier neu':
        'Instant sync: the 1 lands now – the clock restarts here',
    'Audio-Panik: alle Töne, Filter- und Hall-Fahnen sofort abwürgen (nur nötig, wenn nach dem Stop etwas hängt – knackt hörbar)':
        'Audio panic: kill all notes, filter and reverb tails at once (only needed if something hangs after stop – clicks audibly)',
    'Start': 'Start', 'Stop': 'Stop', 'Sync': 'Sync', 'Reset': 'Reset',

    // ── Kopfzeile ──
    'Einstellungen': 'Settings',
    'Einstellungen für die ganze Werkbank (Sprache, Darstellung, Daten)':
        'Settings for the whole workbench (language, appearance, data)',

    // ── Einstellungs-Fenster (lib/SettingsWindow.js + lib/mainSettings.js, @dpa dd.md
    // 20260802). Die Erklärungen hinter den i-Icons sind Markdown und werden als EIN
    // Literal übersetzt – zusammengesetzte Strings verlören still ihre Übersetzung.
    'Erklärung anzeigen': 'Show explanation',
    'gilt überall': 'applies everywhere',
    'nur dieser Einstieg': 'this entry point only',
    'Anzeigesprache': 'Display language',
    'Wert-Hintergrund': 'Value background',
    'Farbe ALLER Beschriftungen und Werte-Anzeigen': 'Colour of ALL labels and value readouts',
    'Farbe': 'Colour',
    'Gruppen-Kopf': 'Group header',
    'Höhe': 'Height',
    'Daten': 'Data',
    '✕ Vorgabe entfernen': '✕ Remove default',
    '⭳ Export': '⭳ Export',
    '⭱ Import': '⭱ Import',
    '↺ Reset': '↺ Reset',
    '+ Neu': '+ New',
    'Neues Projekt aus der leeren Werkbank vorbereiten: Name abfragen, Kollision prüfen, fertigen Terminalbefehl zeigen':
        'Prepare a new project from the empty workbench: ask for a name, check for collisions, show the finished terminal command',
    '+ Neu legt keinen Ordner selbst an — zeigt nur den fertigen Terminalbefehl zum Kopieren.':
        '+ New does not create a folder itself — it only shows the finished terminal command to copy.',
    // Auslagern-Modus (ddw.md 20260803_122138 Punkt 3): derselbe Ablauf wie "+ Neu", aber in
    // einem bereits geklonten Einstieg (dessen gewachsener Stand wird die Kopier-Quelle statt
    // der leeren werkbank-leer-Vorlage) — s. lib/newEntryFlow.js + lib/mainSettings.js.
    'Auslagern': 'Extract',
    'Neues Projekt starten: eigenes Fenster mit Name-Eingabe und fertigem Terminalbefehl':
        'Start a new project: its own window with name entry and the finished terminal command',
    'Diesen gewachsenen Stand als eigenes, neues Projekt auslagern: eigenes Fenster mit Name-Eingabe und fertigem Terminalbefehl':
        'Extract this grown state as its own, new project: its own window with name entry and the finished terminal command',
    '+ Neu öffnet ein eigenes Fenster für den Ablauf (kein einzelner Klick — ein paar Schritte im Terminal).':
        '+ New opens its own window for the flow (not a single click — a few steps in the terminal).',
    'Auslagern öffnet ein eigenes Fenster für den Ablauf (kein einzelner Klick — ein paar Schritte im Terminal).':
        'Extract opens its own window for the flow (not a single click — a few steps in the terminal).',
    'Datentopf: ': 'Data store: ',
    'Anordnen-Modus (Taste „e"): Elemente frei ziehen · Klick/Tab wählt aus · Pfeiltasten verschieben (10px, Shift = 1px) · hier wird nichts bedient':
        'Arrange mode (key “e”): drag elements freely · click/tab selects · arrow keys move (10px, shift = 1px) · nothing is operated here',
    'Ausgangspegel (dBFS, Peak-Hold)': 'Output level (dBFS, peak hold)',
    'Master Vol': 'Master vol',
    // Lim-Button (lib/MasterVolume.js) — WaveShaper wohnt seit ddw.md 20260802_234615 Punkt 1
    // in seinem Popover mit, kein eigener Header-Button/Hint mehr dafür.
    'Limiter — begrenzt den Ausgang hart bei 0dB, verhindert Übersteuern. Rechtsklick: Attack/Release/WaveShaper/Optik.':
        'Limiter — hard-limits the output at 0dB, prevents clipping. Right-click: attack/release/waveshaper/appearance.',
    // Ensemble-Badge (overcord/werkbank.js + werkbank-leer.js) — Rechtsklick-Hinweis ergänzt
    // (ddw.md 20260802_234615 Punkt 4: Farbe gab es technisch schon, war nur nicht auffindbar).
    'Zustand mehrerer Instrumente zusammen speichern/laden (Master-Fader bleibt außen vor) · Rechtsklick = Einstellungen (Farbe/Größe)':
        'Save/load the state of several instruments together (master fader stays out of it) · right-click = settings (colour/size)',

    // ── Kette ──
    'Alles zeigen (umbrechen statt scrollen)': 'Show all (wrap instead of scroll)',
    'Effekt – ziehen zum Umsortieren': 'Effect – drag to reorder',
    'Quelle Metronom – ziehen; Position bestimmt, wo es in die Kette einspeist (ganz hinten = parallel)':
        'Metronome source – drag; its position sets where it feeds into the chain (last = parallel)',
    'Kette': 'Chain',

    // ── Snapshot/Skala/P2/Combo-Menüs ──
    'Snapshot wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a snapshot · picking the marked one again reloads it',
    'Skala wählen · die markierte erneut wählen lädt sie erneut':
        'Pick a scale · picking the marked one again reloads it',
    'Slot-Satz wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a slot set · picking the marked one again reloads it',
    'Farb-Combo wählen · den markierten erneut wählen wendet ihn erneut an':
        'Pick a colour combo · picking the marked one again reapplies it',
    'Sound + Control-Settings dieser Gruppe als neuen Snapshot speichern':
        'Save this group\'s sound + control settings as a new snapshot',
    'Gruppen-Snapshot wählen · den markierten erneut wählen lädt ihn erneut':
        'Pick a group snapshot · picking the marked one again reloads it',
    'Neu…': 'New…', 'Export': 'Export', 'Import': 'Import',
    'Aktuellen Zustand als neuen Snapshot speichern (gleicher Name = überschreiben)':
        'Save the current state as a new snapshot (same name = overwrite)',
    'Geladenen Snapshot als JSON-Datei sichern': 'Save the loaded snapshot as a JSON file',
    'Snapshot aus Datei laden (JSON) – gleicher Name überschreibt':
        'Load a snapshot from a file (JSON) – same name overwrites',
    'Aktuelle Maske als neue Skala speichern': 'Save the current mask as a new scale',
    'Die 12 Slots als neues P2 speichern': 'Save the 12 slots as a new P2',
    'Aktuelle Farben als neuen Combo speichern': 'Save the current colours as a new combo',
    'Aktuelle Farbe + Hintergrund als Preset speichern':
        'Save the current colour + background as a preset',
    'Gespeicherte Regler-Farbe wählen (Standard = Farbe verwerfen)':
        'Pick a saved knob colour (Default = discard colour)',

    // ── Layout-Cluster ──
    'Layout laden (Recall)': 'Load layout (recall)',
    'Ausgewähltes Layout mit aktueller Optik überschreiben (Update)':
        'Overwrite the selected layout with the current look (update)',
    'Als neues Layout speichern': 'Save as a new layout',
    'Layout exportieren (JSON)': 'Export layout (JSON)',
    'Ausgewähltes Layout löschen': 'Delete the selected layout',

    // ── Gruppen / Controls ──
    'Ein-/Ausklappen': 'Collapse/expand',
    'Ziehen zum Verschieben · Rechtsklick = Einstellungen': 'Drag to move · right-click = settings',
    'Klick = auswählen (dann Pfeiltasten), Doppelklick = Wert eingeben':
        'Click = select (then arrow keys), double-click = type a value',
    'Hintergrund der Anzeige': 'Display background',

    // ── Beschriftung, global (@dpa 20260716_204921) ──
    'Beschriftung': 'Labels',
    'Gilt für ALLE Beschriftungen und Werte-Anzeigen auf einmal. Leer bzw. ✕ = wie ausgeliefert. Einzelne Regler-Farben bleiben davon unberührt (Rechtsklick auf den Regler).':
        'Applies to ALL labels and value readouts at once. Empty or ✕ = as shipped. Individual knob colours stay untouched (right-click the knob).',
    'Vorgabe entfernen (wieder wie ausgeliefert)': 'Remove the setting (back to as shipped)',
    'Schrift': 'Text',
    'Wert-BG': 'Value BG',
    'Größe': 'Size',
    'Schriftgröße der Beschriftungen (6–12 px, leer = wie ausgeliefert)':
        'Font size of the labels (6–12 px, empty = as shipped)',

    // ── Hilfe-Blasen (@dpa 20260716_174111) ──
    // Die Hilfetexte der Controls selbst stehen NICHT hier, sondern als {de,en}-Paar in
    // js/data/hints.js – sie hängen an der Control-Kennung statt am Wortlaut, damit ein
    // umformulierter Text seine Übersetzung nicht verliert. Hier steht nur die Bedienung
    // des Hilfe-Systems.
    'Hilfe': 'Help',
    'Hilfe-Blasen ein-/ausschalten (die Verzögerung steht in den Einstellungen)':
        'Turn help bubbles on/off (the delay lives in the settings)',
    'Wie lange die Maus stillstehen muss, bis die Hilfe-Blase erscheint. Den Text jedes Controls ändert man in dessen Einstellungen (Rechtsklick), „Alle zurücksetzen" holt die mitgelieferten Texte zurück.':
        'How long the mouse must rest before the help bubble appears. Each control’s text is edited in its own settings (right-click); “Reset all” brings the shipped texts back.',
    'Verzögerung der Hilfe-Blase in Millisekunden (0 = sofort)':
        'Delay of the help bubble in milliseconds (0 = instantly)',
    'Alle zurücksetzen': 'Reset all',
    'Alle selbst geschriebenen Hilfetexte verwerfen (die mitgelieferten gelten wieder)':
        'Discard all self-written help texts (the shipped ones apply again)',
    'Alle eigenen Hilfetexte verwerfen?': 'Discard all your own help texts?',
    'Es sind keine eigenen Hilfetexte gespeichert.': 'There are no self-written help texts stored.',
    'Hilfetexte sichern': 'Save help texts',
    'Nur die selbst geschriebenen Hilfetexte als eigene JSON-Datei herunterladen':
        'Download only the self-written help texts as their own JSON file',
    'Hilfetexte laden': 'Load help texts',
    'Hilfetexte aus einer teslacoil-Hilfetext-Datei einlesen (ersetzt nur die Texte, sonst nichts)':
        'Read help texts from a teslacoil help-text file (replaces only the texts, nothing else)',
    'Hilfetexte laden?': 'Load help texts?',
    'Die eigenen Hilfetexte werden ersetzt. Sound, Optik und Snapshots bleiben unberührt.':
        'Your own help texts will be replaced. Sound, look and snapshots stay untouched.',
    'Import nicht möglich:': 'Import not possible:',
    'Standard': 'Default',
    'Eigene Farbe verwerfen (Regler nimmt wieder die Grundfarbe)':
        'Discard the custom colour (knob returns to the base colour)',
    'Schließen': 'Close',
    'Anzeige an/aus': 'Display on/off',

    // ── Step-Sequenzer ──
    'Fill: sichtbares Muster über den unsichtbaren Rest wiederholen':
        'Fill: repeat the visible pattern across the hidden remainder',
    'set0: der nächste Trigger startet wieder bei Step 1':
        'set0: the next trigger starts at step 1 again',

    // ── Skaler-Keyboard ──
    'Klick: Skala auf der Frequenzachse verschieben (Anker)':
        'Click: shift the scale along the frequency axis (anchor)',
    'Anker: Skala auf der Frequenzachse verschieben (Transponier-Modus).':
        'Anchor: shift the scale along the frequency axis (transpose mode).',
    'base=c: Skala relativ zur Basis (do re mi); der Klang folgt der BaseFreq.':
        'base=c: scale relative to the base (do re mi); the sound follows the base freq.',
    'skal2: die 12 Tasten als abrufbare Skala-Slots (P2). Bleibt auch im Anker-Modus aktiv.':
        'skal2: the 12 keys as recallable scale slots (P2). Stays active in anchor mode too.',

    // ── Debug (lib/debugPanel/, @dpa ddw.md 20260802) ──
    // Tap-Punkt ist hier bewusst der Analyser (tatsächlicher Ausgangspegel wie der
    // LevelMeter), NICHT der rohe Master wie in teslacoil — s. DebugPanel.js-Kopf.
    'Audio am Analyser-Tap abgreifen (derselbe Punkt wie der LevelMeter, also der tatsächliche Ausgangspegel) – Start/Stop':
        'Tap audio at the analyser point (same spot as the level meter, i.e. the actual output level) – start/stop',
    'Zweite Aufnahme zum Vergleich (vorher/nachher) – Start/Stop':
        'Second take for comparison (before/after) – start/stop',
    'Beide Aufnahmen verwerfen (Rec und Rec2 leeren)': 'Discard both takes (clear Rec and Rec2)',
    'Audio (WAV, beide Aufnahmen) + Screenshot (PNG) + Zustand (JSON) + Prompt (TXT) einzeln herunterladen':
        'Download audio (WAV, both takes) + screenshot (PNG) + state (JSON) + prompt (TXT) separately',
    'Debug speichern': 'Save debug bundle',
    'Begleit-Prompt an die KI': 'Prompt for the AI',

    // ── Einstellungen ──
    'Auto-Restore ist aktiv: Sound- und Optik-Zustand werden automatisch gesichert und beim Neuladen/Aktualisieren wiederhergestellt.':
        'Auto-restore is on: sound and layout state are saved automatically and restored when you reload or refresh.',
    'Entfernt den Gleichanteil aus dem Ausgangssignal (Lautsprecherschutz). Ein Puls-Synth erzeugt ihn zwangsläufig – aus lassen nur, wenn man ihn wirklich braucht.':
        'Removes the DC offset from the output signal (speaker protection). A pulse synth inevitably produces one – only switch this off if you really need to.',
    'Automatisch nach jeder Ruhephase gesichert (max. 2/Min, 5/Std, 1/Tag, 1/Woche). Ein Backup zu laden ersetzt den KOMPLETTEN Zustand (Sound, Optik, Snapshots, Skalen, Layouts).':
        'Saved automatically after every idle phase (max. 2/min, 5/hour, 1/day, 1/week). Loading a backup replaces the COMPLETE state (sound, look, snapshots, scales, layouts).',
    'Den kompletten Zustand als Datei sichern oder von einer Datei einlesen – unabhängig vom Browserspeicher, übertragbar auf andere Rechner. Einlesen ersetzt ebenfalls ALLES.':
        'Save the complete state to a file or read it back from one – independent of browser storage, portable to other machines. Reading also replaces EVERYTHING.',
    'Datei': 'File',
    'Als Datei sichern': 'Save as file',
    'Auf Werkseinstellung zurücksetzen': 'Reset to factory settings',
    '— keine Backups —': '— no backups —',
    '— Backup wählen —': '— pick a backup —',
    'Fertig': 'Done',
    'Anordnen-Modus – Element klicken/ziehen (10px-Raster · Shift 1px · Pfeiltasten)':
        'Arrange mode – click/drag an element (10px grid · shift 1px · arrow keys)',
    'Gewähltes Backup wiederherstellen (ersetzt alles) und neu laden':
        'Restore the selected backup (replaces everything) and reload',
    'Sofort ein Backup des aktuellen Zustands anlegen': 'Take a backup of the current state now',
    'Kompletten Zustand (Sound, Optik, Snapshots, Skalen, Layouts) als JSON-Datei herunterladen':
        'Download the complete state (sound, look, snapshots, scales, layouts) as a JSON file',
    'Zustand aus einer teslacoil-Backup-Datei wiederherstellen (ersetzt alles)':
        'Restore the state from a teslacoil backup file (replaces everything)',
    'ALLES verwerfen und die ausgelieferte Werkseinstellung laden (vorher wird automatisch gesichert)':
        'Discard EVERYTHING and load the shipped factory settings (a backup is taken first)',
    'Backups': 'Backups',
    'Laden': 'Load',
    'Datei laden': 'Load file',
    'Jetzt sichern': 'Back up now',
    'Als Datei sichern': 'Save as file',
    'Sprache': 'Language',
    'Sprache der Hinweise und Beschriftungen (selbst vergebene Namen bleiben unverändert)':
        'Language of hints and labels (names you gave yourself stay untouched)',
    'Ausgang': 'Output',

    // ── Element-/Regler-Settings ──
    // Panel-Umschalter (@dpa dd.md 20260801): "Control ist NICHT auf dem Panel, sondern in
    // den settings" - eigener Toggle, hat nichts mit der Knob-Gestalt "Ohne" zu tun.
    'Control sitzt auf dem Panel – klicken, um es stattdessen nur in die Gruppen-Settings zu legen.':
        'Control sits on the panel – click to move it into the group settings only.',
    'Control liegt nur in den Gruppen-Settings – klicken, um es zurück aufs Panel zu holen.':
        'Control lives only in the group settings – click to bring it back onto the panel.',
    'Breite EINER Taste (10–999 px)': 'Width of ONE key (10–999 px)',
    'Höhe EINER Taste (10–500 px)': 'Height of ONE key (10–500 px)',
    'Breite des Feldes (px)': 'Width of the field (px)',
    'Höhe des Feldes (px)': 'Height of the field (px)',

    // ── Control-Labels aus den defs.js (@dpa ddw.md 20260724, main Config „Deutsch/Englisch"):
    // Knob-/Toggle-/Select-/Button-Beschriftungen + Gruppennamen. Rein englische/technische
    // Wörter (BPM, PW, FM, Poly, Reso, Attack/Decay/Sustain/Release, Trigger, Engine, Hold,
    // Detune, Cutoff, Level, Band, Base-Frq …) tauchen hier bewusst NICHT auf — ohne Eintrag
    // zeigt t() unverändert dasselbe Wort, das ist für sie schon die richtige Übersetzung.
    // ── Takt/Metronom ──
    'Anschieben ±': 'Push ±',
    'Anlauf': 'Ramp',
    '±Fenster': '±Window',
    'Fenster (M2)': 'Window (M2)',
    'Latenz': 'Latency',
    'Beats/Takt': 'Beats/bar',
    'Teil 2 ×': 'Part 2 ×',
    'Modus': 'Mode',
    'aktiv': 'on',
    'Takt-Anzeige': 'Beat display',
    'Transport / Tempo': 'Transport / tempo',
    'Takt / Metronom': 'Beat / metronome',
    // ── Aufnahme (recInstrument) ──
    'Dateiname': 'File name',
    'Aufnahme': 'Recording',
    // ── Stepsequenzer ──
    'Multiplikator': 'Multiplier',
    'Teiler': 'Divider',
    'An': 'On',
    'Step-Zahl': 'Step count',
    'Stepsequenzer': 'Step sequencer',
    // ── Poly-Synth ──
    'Kammerton': 'Concert pitch',
    'Höhen-Dämpf': 'Treble damp',
    'Oktav-Start': 'Octave start',
    'Oktaven': 'Octaves',
    'MIDI-Okt-Off': 'MIDI oct. offset',
    'BaseFrq-Quelle': 'Base freq. source',
    'Audio-Osz': 'Audio osc.',
    'Amp-Env': 'Amp env.',
    'BaseFreq-Ton': 'Base freq. note',
    'Speicher-Slot': 'Memory slot',

    // ── Hilfstexte der Controls (@dpa ddw.md 20260724_153349, „die Hilfstexte auch! vorallem!"):
    // taktmetro/polysynth/stepseq/rec-Controls hängen ihren Hilfetext direkt als `title`/`info`
    // in der jeweiligen defs.js — der läuft über genau denselben hint()/t()-Weg wie alles
    // andere hier (DE-Text = Schlüssel), NICHT über die separate hints.js-Kennung (die trägt
    // nur den alten, aktuell ungenutzten Teslacoil-DSP-Block). ──
    // Transport/Tempo (taktmetro/defs.js BUTTONS/TOGGLES/DISPLAYS/SPECIALS)
    'Start von vorne: Takt auf die 1, Sequenzer auf Step 0 (avv). Nochmal drücken = Stop.':
        'Start from the top: beat to the 1, sequencers to step 0 (avv). Press again = stop.',
    'Weiter ohne Sync: Takt-Phase und Sequenzer-Position laufen von dort weiter, wo sie standen. Nochmal drücken = Stop.':
        'Continue without sync: beat phase and sequencer position carry on from where they were. Press again = stop.',
    'Der nächste Schlag wird zur 1.': 'The next beat becomes the 1.',
    'Die 1 fällt sofort.': 'The 1 lands right now.',
    'Bremsen, solange gedrückt.': 'Slow down while held.',
    'Anschieben, solange gedrückt.': 'Push forward while held.',
    'Mittippen.': 'Tap along.',
    'Tap-Serie verwerfen (laufendes Tempo bleibt).': 'Discard the tap series (current tempo stays).',
    'Metronom-Klick an/aus.': 'Metronome click on/off.',
    'Quant': 'Quant',
    'Rundet die Metro-Cutoffs auf das nächste Vielfache der Base-Frq (Klick „stimmt" auf die Basis).':
        'Rounds the metro cutoffs to the nearest multiple of the base freq (click "tunes" to the base).',
    'Schläge im Takt – der aktuelle leuchtet.': 'Beats in the bar – the current one lights up.',
    'Tab/Tempo-Sondereinstellungen öffnen': 'Open tap/tempo special settings',
    'Tap-Tempo & Timing: oben mit „Tab" mittippen, hier feineinstellen. Der Modus legt fest, wie aus den Antippern ein Tempo wird — der Rest formt das Timing.':
        'Tap tempo & timing: tap along with “Tab” above, fine-tune it here. The mode decides how the taps become a tempo — the rest shapes the timing.',
    'Obergrenze fürs Antippen. Wird schneller getippt, halbiert sich der Wert so oft, bis er wieder ins Tempofenster passt.':
        'Upper limit for tapping. If tapped faster, the value keeps halving until it fits the tempo window again.',
    '±max: die Tiefe, um die + und − das Tempo biegen, solange sie gedrückt sind (der gespeicherte Wert bleibt).':
        '±max: how far + and − bend the tempo while held (the stored value stays untouched).',
    'Zeit, bis + / − auf ±max kommen — und beim Loslassen genauso wieder zurück.':
        'Time for + / − to reach ±max — and the same time back when released.',
    'So lange denkt der Timingmesser nach dem letzten Antippen noch mit. Größere Pause = neue Tap-Serie.':
        'How long the timing meter keeps listening after the last tap. A longer gap starts a new tap series.',
    'Toleranz um das laufende Tempo: liegt ein Antipper darin, zählt seine Abweichung mit, sonst gilt er als Ausreißer.':
        'Tolerance around the running tempo: a tap inside it counts toward the average, otherwise it counts as an outlier.',
    'Nur im Modus „folgend": gleitendes Mittelungs-Fenster in Schlägen. Klein = folgt Tempo-Drifts schnell, groß = ruhiger.':
        'Only in “following” mode: sliding averaging window in beats. Small = follows tempo drifts fast, large = steadier.',
    'Schiebt Klick + Anzeige gegen einen externen Klick: − = früher (schluckt die Ausgabelatenz), + = später.':
        'Shifts the click + display against an external click: − = earlier (absorbs output latency), + = later.',
    'wait (Pause ab)': 'wait (idle gap)',
    '„Konstant" mittelt über alle Antipper und rastet auf ein stabiles Tempo ein. „Folgend" nimmt nur die jüngsten Schläge (Fenster) und synct sich live mit jedem gültigen Schlag — folgt so Tempo-Drifts.':
        '“Constant” averages over all taps and settles on a stable tempo. “Following” only uses the most recent beats (window) and syncs live with every valid beat — so it follows tempo drifts.',
    'Über alle Klicks mitteln (stabil).': 'Average over all clicks (stable).',
    'Gleitendes Fenster, folgt Tempo-Drifts (ab Tap 3 live).': 'Sliding window, follows tempo drifts (live from tap 3).',

    // Poly-Synth (polysynth/defs.js KNOBS/TOGGLES/BUTTONS/WECHSEL)
    'Grundfrequenz bei Quelle „Freq" (Hz) — der Bezugston, von dem aus alle Stimmen gespielt werden.':
        'Base frequency for source “Freq” (Hz) — the reference pitch all voices are played from.',
    'Register: die Grundfrequenz wird in dieses Hz-Band gefaltet (30 → 30–60 Hz), egal welche Quelle sie liefert.':
        'Register: the base frequency is folded into this Hz band (30 → 30–60 Hz), whichever source supplies it.',
    'Referenz-Frequenz A4 — wirkt auf ALLE Frequenzberechnungen dieses Instruments.':
        'Reference frequency A4 — affects ALL frequency calculations of this instrument.',
    'Zieht die gespielten Töne von roh (0) auf ganzzahlige Vielfache der Basis (1) — aus Akkorden wird Obertonreihe.':
        'Pulls the played notes from raw (0) onto integer multiples of the base (1) – chords become a harmonic series.',
    'LP-Glide der Oszillator-Frequenz, wenn Base-Frq/Harmonize live eine gehaltene Note verschiebt. 0 = harter Sprung.':
        'LP glide of the oscillator frequency when base freq/harmonize shifts a held note live. 0 = hard jump.',
    'Pulsweite: Anteil der Periode im oberen Zustand. 0.5 = Rechteck, kleine Werte = dünn und nasal. Nur bei Engine Square-PW.':
        'Pulse width: share of the period in the high state. 0.5 = square, small values = thin and nasal. Engine Square-PW only.',
    'Wie stark der Sinus sich selbst moduliert — von rein (0) bis rau (1). Nur bei Engine Sine-FM.':
        'How strongly the sine modulates itself — from pure (0) to gritty (1). Engine Sine-FM only.',
    'Wie viele Stimmen gleichzeitig klingen dürfen.': 'How many voices may sound at once.',
    'Verstimmung in Cent zwischen Osc1/Osc2 (±Detune/2), erzeugt Schwebung. Wirkt nur bei Osc2 an.':
        'Detune in cents between Osc1/Osc2 (±detune/2), creates beating. Only effective with Osc2 on.',
    'Dämpft hohe Noten gegenüber der Base-Frq: 0 = unverändert, 100 = Pegel folgt 1/Verhältnis, darüber exponentiell leiser.':
        'Attenuates high notes relative to the base freq: 0 = unchanged, 100 = level follows 1/ratio, beyond that exponentially quieter.',
    'Anstiegszeit der Lautstärke (s), linear. 0 = senkrechter Einsatz.':
        'Attack time of the level (s), linear. 0 = vertical onset.',
    'Abfallzeit vom Attack-Peak zum Sustain-Pegel (s), exponentiell.':
        'Decay time from the attack peak to the sustain level (s), exponential.',
    'Haltepegel, solange die Note gehalten wird — Anteil vom Attack-Peak.':
        'Hold level while the note is held — a share of the attack peak.',
    'Ausklingzeit NACH dem Loslassen der Note (s), exponentiell.':
        'Fade-out time AFTER the note is released (s), exponential.',
    'Oktave der untersten Taste des Keyboards.': 'Octave of the keyboard’s lowest key.',
    'Anzahl der Oktaven, aufwärts ab Oktav-Start.': 'Number of octaves, upward from octave start.',
    'Verschiebt jede eingehende MIDI-Note um N Oktaven, bevor sie geprüft/gespielt wird.':
        'Shifts every incoming MIDI note by N octaves before it is checked/played.',
    'Zweiter Oszillator pro Stimme, symmetrisch um ±Detune/2 Cent verstimmt (Schwebung). Aus = nur Osc1 exakt auf der Note, ohne zweiten Node.':
        'Second oscillator per voice, detuned symmetrically by ±detune/2 cents (beating). Off = only Osc1 exactly on the note, no second node.',
    'Bei voller Polyphonie (Poly): AN = älteste gehaltene Note sanft stehlen, AUS = neue Note ignorieren. Finaler Default noch @dpa nach dem Hören.':
        'At full polyphony (Poly): ON gently steals the oldest held note, OFF ignores the new one.',
    'AN: losgelassene Tasten klingen weiter, NoteOffs laufen erst nach, wenn Hold wieder ausgeschaltet wird. Gilt für Maus UND MIDI-Eingang gleichermaßen.':
        'ON: released keys keep sounding, note-offs only catch up once Hold is switched off again. Applies to mouse AND MIDI input alike.',
    'Aktuell klingenden Akkord live einen Halbton nach unten.': 'Shift the currently sounding chord live one semitone down.',
    'Aktuell klingenden Akkord live einen Halbton nach oben.': 'Shift the currently sounding chord live one semitone up.',
    'Normales Speicher-Verhalten: leerer Slot merkt den aktuellen Akkord, belegter Slot ist ein Gate (halten = klingt, loslassen = Release).':
        'Normal memory behaviour: an empty slot remembers the current chord, a filled slot is a gate (hold = sounds, release = release).',
    'Jeder Klick überschreibt den geklickten Slot sofort mit dem aktuellen Akkord — auch schon belegte Slots, ohne Gate.':
        'Every click immediately overwrites the clicked slot with the current chord — even already-filled slots, no gate.',
    'Jeder Klick löscht einen belegten Slot sofort, ohne Gate.':
        'Every click immediately clears a filled slot, no gate.',

    // Step-Sequenzer (stepseq/defs.js, multiSq.js, StepSeqGrid.js)
    'Step-Muster: Klick schaltet einen Step an/aus, vertikales Ziehen setzt seine Env-Höhe (Velocity). Läuft die Basisclock („An" + Multiplikator/Teiler), triggert jeder aktive Step die gewählte Output-Quelle.':
        'Step pattern: click toggles a step on/off, dragging vertically sets its envelope height (velocity). While the base clock runs (“On” + multiplier/divider), every active step triggers the chosen output.',
    'Sq-Ausgabeziel wählen — Fußzeile: Zielliste aus dem Ensemble neu laden':
        'Pick the Sq output target — footer: reload the target list from the ensemble',
    'Scharf — läuft nur bei laufendem Transport (Takt/Metronom). Jeder aktive Step triggert dann die gewählte Output-Quelle, im Takt-Tempo (Beat × Multiplikator ÷ Teiler).':
        'Armed — only runs while transport is running (beat/metronome). Every active step then triggers the chosen output, at clock tempo (beat × multiplier ÷ divider).',
    '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = schneller/vervielfacht.':
        '1/1 = exactly one beat (seqMult=1, seqDiv=1). Higher = faster/multiplied.',
    '1/1 = exakt ein Beat (seqMult=1, seqDiv=1). Höher = langsamer/geteilt.':
        '1/1 = exactly one beat (seqMult=1, seqDiv=1). Higher = slower/divided.',
    'Sichtbare/aktive Steps (1–64).': 'Visible/active steps (1–64).',

    // Aufnahme (recInstrument/defs.js)
    'Nimmt alle Instrumente zusammen auf — Klick startet, nochmal Klick stoppt (je auf dem nächsten Takt-Downbeat) und lädt herunter.':
        'Records all instruments together — click starts, click again stops (each on the next beat downbeat) and downloads.',
    'Dateiname für den Download, ohne Dateiendung — die kommt automatisch je nach Format.':
        'File name for the download, without extension — that is added automatically depending on the format.',

    // Sondereinstellungen-Fenster: Live-Audio-Zeile (GroupHost.js makeSpecial/refreshAudio)
    'Audio: — (bereit nach dem ersten Klick)': 'Audio: — (ready after the first click)',
    'Basis': 'Base',
    'Ausgabe': 'Output',
    'Samplerate': 'Sample rate',

    // Poly-Synth: freistehende Unikat-Controls (werkbank.js, Base-Frq/Keyboard-Gruppe)
    'Nur bei Quelle „Ton" bedienbar: wählt die Tonklasse der Basis. Sonst reine Anzeige, wo die klingende Base-Frq liegt.':
        'Only operable with source “Ton”: picks the base’s pitch class. Otherwise a plain readout of where the sounding base freq sits.',
    'Spiel-Tastatur — klicken oder MIDI spielt eine Note. Bereich/Oktaven in den Settings.':
        'Play keyboard — click or MIDI plays a note. Range/octaves in the settings.',
    'Akkord-Speicher: leerer Slot merkt den gerade gespielten Akkord, belegter Slot ist ein Gate (halten = klingt). [R] schaltet das Verhalten um.':
        'Chord memory: an empty slot remembers the chord just played, a filled slot is a gate (hold = sounds). [R] switches the behaviour.',
    'Ausgangspegel des gesamten Ensembles (dBFS, Peak-Hold).': 'Output level of the whole ensemble (dBFS, peak hold).',
    'Tonklasse + Oktave der aktuell klingenden Base-Frq (z.B. „C-1").':
        'Pitch class + octave of the currently sounding base freq (e.g. “C-1”).',
    'Die aktuell klingende Base-Frq in Hz.': 'The currently sounding base freq in Hz.',

    // ── PickMenu (Speicher/Combo/Snapshot-Listen) + Gruppen-Settings-Fußzeile
    // (@dpa ddw.md 20260724_183901, "die Hilfen im Speicher sind noch deutsch") ──
    'mit dem aktuellen Zustand überschreiben': 'overwrite with the current state',
    'umbenennen': 'rename',
    'löschen': 'delete',
    'noch nichts gespeichert': 'nothing saved yet',
    'Neuer Name für': 'New name for',
    'Name schon vergeben.': 'Name already taken.',
    'Auswählen · erneut wählen lädt erneut': 'Pick · picking it again reloads it',
    'Enter = Übernehmen · ESC = Verlassen': 'Enter = apply · ESC = leave',
    'Übernehmen': 'Apply',
    'Verlassen': 'Leave',
    // Off-Panel-Liste in den Gruppen-Settings (@dpa dd.md 20260801).
    'Nicht auf dem Panel': 'Not on the panel',
    // ISM-Sichtbarkeits-Umschalter (ddw.md 20260803_135251) – lib/InstrumentSettings.js
    // (Panel?-Knopf eine Ebene höher) + die Unterrubrik in lib/mainSettings.js.
    'Instrument ist ausgeblendet — nur noch über die Haupt-Settings (⚙) erreichbar. Klicken, um es wieder anzuzeigen.':
        'Instrument is hidden — only reachable via the main settings (⚙) now. Click to show it again.',
    'Instrument ist sichtbar. Klicken, um es auszublenden (bleibt über die Haupt-Settings (⚙) erreichbar).':
        'Instrument is visible. Click to hide it (stays reachable via the main settings (⚙)).',
    'Ausgeblendet – klicken, um es wieder anzuzeigen.': 'Hidden – click to show it again.',
    'Aktuell ist kein Standard-Instrument ausgeblendet.': 'No standard instrument is currently hidden.',
    // Aufnahme-Format-Sektion in den Haupt-Settings (ddw.md 20260803_135251 Punkt B).
    'Format': 'Format',
    'Bitrate': 'Bitrate',
    'Kanäle': 'Channels',
    'Bittiefe': 'Bit depth',
};

let _lang = 'de';
/** Elemente, deren Hint übersetzt wird: el → deutscher Originaltext. */
const _hints = new Map();
/** Elemente, deren sichtbarer Text übersetzt wird: el → deutscher Originaltext. */
const _texts = new Map();
const _subs = new Set();

/** Aktuelle Sprache. */
export function lang() { return _lang; }

/** Übersetzen. Unbekanntes bleibt deutsch – lieber der Originalsatz als ein Schlüssel. */
export function t(de) {
    if (_lang === 'de' || de == null) return de;
    return EN[de] ?? de;
}

/**
 * Hint setzen und für die Live-Umschaltung merken.
 *
 * Seit 20260716_174111 steht der Text in `data-hint` statt in `title`: die Hilfe-Blase
 * (ui/HintBubble.js) zeigt ihn an, damit @dpa sie global abschalten und ihre Verzögerung
 * einstellen kann – beides gibt ein natives `title` nicht her. Ein zurückgebliebenes
 * `title` würde zusätzlich als zweiter, unabschaltbarer Tooltip erscheinen.
 *
 * `aria-label` bleibt: das ist der Weg zur Vorlesehilfe, nicht zur Optik.
 */
export function hint(el, de) {
    if (!el) return el;
    _hints.set(el, de);
    el.dataset.hint = t(de);
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(de));
    return el;
}

/** Sichtbaren Text setzen und merken (nur INSTRUMENT-Texte, nie User-Labels!). */
export function text(el, de) {
    if (!el) return el;
    _texts.set(el, de);
    el.textContent = t(de);
    return el;
}

/** Element aus der Übersetzungs-Merkliste nehmen (@dpa ddw.md 20260724, main Config: ein
 *  selbst vergebenes Label darf ein späterer Sprachwechsel NIE überschreiben). Aufrufen,
 *  bevor ein Custom-Text direkt per textContent gesetzt wird — sonst würde setLang() das
 *  Element beim nächsten Wechsel auf den zuletzt per `text()` gemerkten Shipped-Text
 *  zurückdrehen, obwohl der User es umbenannt hat. */
export function stopText(el) { if (el) _texts.delete(el); }

/** Bei Sprachwechsel benachrichtigt werden (für Texte, die neu gebaut werden müssen). */
export function onLangChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }

/** Sprache setzen und ALLES gemerkte neu zeichnen. */
export function setLang(l) {
    const next = LANGS.includes(l) ? l : 'de';
    if (next === _lang) return;
    _lang = next;
    for (const [el, de] of _hints) {
        if (!el.isConnected) { _hints.delete(el); continue; }   // aufgeräumt statt geleakt
        el.dataset.hint = t(de);
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(de));
    }
    for (const [el, de] of _texts) {
        if (!el.isConnected) { _texts.delete(el); continue; }
        el.textContent = t(de);
    }
    _subs.forEach((fn) => { try { fn(_lang); } catch { /* ein Abonnent darf den Rest nicht reißen */ } });
}

/** Nur für den Test-Wächter: die Schlüssel, die EN kennt. */
export const EN_KEYS = Object.keys(EN);
export function hasTranslation(de) { return Object.prototype.hasOwnProperty.call(EN, de); }
