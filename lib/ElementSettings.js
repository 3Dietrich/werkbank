/**
 * ElementSettings.js – Schwebendes Settings-Panel für die Nicht-Knob-Controls.
 *
 * @dpa 20260714: „Es müssen nun alle Elemente Settings kriegen." Knobs haben ihren
 * KnobMetaEditor; hier bekommen die anderen Kategorien per Rechtsklick eigene Optik-
 * Settings – typ-abhängige Felder:
 *   • select   (MultiSchalter, z.B. Pitch-Wave / BaseFrq-Quelle): Label, Label an/aus,
 *              BG-Farbe, VG-Farbe, Größe (Schrift), Feldbreite.
 *   • toggle   (Schalter wie aktiv/hold): Label, Label-Position (oben/links/rechts/unten).
 *   • readout  (pure Texte, z.B. base-readout): Label, Label an/aus, Textgröße,
 *              Textfeld-Größe, Textfarbe.
 *   • text     (Schrift-Eingabe, z.B. Debug-Name/-Prompt): wie select + Feldhöhe.
 *              Breite/Höhe teilt sie sich mit dem Vergrößerungs-Zipfel der textarea –
 *              beide schreiben denselben ctrlStyles-Eintrag.
 *   • note     (reines Text-Element): sein Inhalt IST das Label.
 *   • button   (Rec/Debug speichern …): Label, Label-Position (Mitte = Default),
 *              VG/BG, Breite/Höhe.
 *
 * Das Panel ist rein optisch – es verstellt NIE einen Control-Wert (@dpa: „RM darf keine
 * Control Values verstellen."). Die eigentliche DOM-Anwendung liegt beim Aufrufer
 * (target.applyStyle) – so bleibt das Panel generisch. Persistenz über onApply(id, style)
 * → state.ctrlStyles (Optik-Ebene, LAYOUT_KEYS).
 */
import { makeDraggable } from './dragPanel.js';
import { hint, lang } from './i18n.js';
import { colorPickerBusy, upgradeColorInputs } from './colorPick.js';
import { factoryHint } from './hints.js';
import { PickMenu } from './PickMenu.js';

// Design-Speicher (@dpa 20260722_013727, ddw.md Control-Abschnitt: „alle Controls ihre
// Einstellungen in deren Settings speichern könnten und die Designs damit dann für andere,
// gleiche Controls zur Verfügung stehen. Gespeichert wird das ganze Aussehen ohne die Text-
// Eingaben (Label, Hilfstext,..)"). Dieselbe Idee wie die Farb-Presets im KnobMetaEditor
// (PickMenu, „teslacoils Ausarbeitung"), nur aufs GANZE Aussehen ausgeweitet und PRO TYP
// gelistet (ein Button-Design passt nicht auf ein Select). Text-Felder bewusst raus, sonst
// würde ein „Design" ein fremdes Label über einen Control stülpen.
const DESIGN_TEXT_FIELDS = new Set(['label', 'labelOn', 'textOn', 'textOff', 'textBlink', 'optLabels']);

export class ElementSettings {
  // Control-Sorten-Namen (K8, @dpa 20260718). Der `type` ist die ElementSettings-Sicht,
  // nicht der data-ctrl-Präfix: `select` deckt auch die Segment-Sorte mit ab (die sich in
  // GroupHost als type:'select' registriert), `readout`→Text, `keyboard`→UNIKAT (u:-Sorte).
  static SORTE = {
    select: 'Select', toggle: 'Toggle', readout: 'Text', text: 'Text',
    note: 'Note', button: 'Button', keyboard: 'UNIKAT', beatview: 'UNIKAT', opener: 'UNIKAT',
    wechsel: 'Wechsel', stepseq: 'UNIKAT',
  };

  constructor(state) {
    this._state = state || null;
    this._target = null;
    this._build();
  }

  _build() {
    const panel = document.createElement('div');
    panel.className = 'knob-meta-editor elem-settings';   // teilt die Optik des Knob-Editors
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="kme-header">
        <span class="kme-title">Element-Einstellungen</span>
        <!-- Sorten-Name (K8, @dpa 20260718): klein/monospace oben rechts, unauffällig –
             welche Control-Sorte dieses Panel gerade bedient. Text setzt open() je Typ. -->
        <span class="kme-sorte" title="Control-Sorte"></span>
        <button class="kme-close" title="Schließen">✕</button>
      </div>
      <div class="kme-body">
        <!-- Design-Speicher (@dpa 20260722_013727): ganzes Aussehen (ohne Texte) als
             benanntes Preset merken/abrufen — für andere Controls DERSELBEN Sorte. -->
        <div class="kme-row kme-wide es-design-row">
          <label>Design</label>
          <div class="es-design-menu"></div>
        </div>
        <div class="kme-row kme-wide" data-f="label">
          <label>Label</label>
          <input type="text" class="es-label" maxlength="24" />
        </div>
        <!-- Zweispaltig wie der Regler-Editor (@dpa 20260716_011222: „bitte bei allen
             Controls prüfen und Platz sparen"). Versteckte Felder fallen aus dem Raster,
             die übrigen rücken auf – jeder Typ bekommt so ein dichtes Panel. -->
        <div class="kme-grid">
          <div class="kme-row" data-f="labelOn">
            <label>Label an</label>
            <input type="checkbox" class="es-labelon" />
          </div>
          <div class="kme-row" data-f="labelPos">
            <label>Label-Pos</label>
            <!-- Kein „Mitte" mehr (@dpa 20260719_030544: „hat eh nicht funktioniert … kann raus"). -->
            <select class="es-labelpos">
              <option value="top">Oben</option>
              <option value="left">Links</option>
              <option value="right">Rechts</option>
              <option value="bottom">Unten</option>
              <!-- „Ohne": Label bleibt gespeichert, wird im Panel nur nicht gezeigt (@dpa 20260719). -->
              <option value="off">Ohne</option>
            </select>
          </div>
          <!-- Button-Modus (@dpa 20260719, 'nix' ergänzt 20260724): Trigger=Impuls (Farbe
               fadet an→aus), Gate=an solange gedrückt, Umschalter=an/aus je Klick,
               nix=feuert wie Trigger, aber ganz ohne ON-Anzeige (BG bleibt aus). Default
               kommt aus den defs. -->
          <div class="kme-row" data-f="btnMode">
            <label>Modus</label>
            <select class="es-btnmode" title="Trigger (Impuls) · Gate (solange gedrückt) · Umschalter (an/aus) · nix (feuert ohne ON-Anzeige)">
              <option value="trigger">Trigger</option>
              <option value="gate">Gate</option>
              <option value="toggle">Umschalter</option>
              <option value="nix">nix</option>
            </select>
          </div>
          <div class="kme-row" data-f="bg">
            <label>BG</label>
            <input type="color" class="es-bg" value="#222222" title="Hintergrundfarbe" />
            <button class="es-bg-clear kme-x" title="Hintergrundfarbe entfernen">✕</button>
          </div>
          <!-- Select/Segment-Farben (@dpa 20260718_234247: „Farben: BG0, BG1, VG"). BG0 =
               Grund-Hintergrund, BG1 = Hintergrund der aktiven Stufe (bei Segmenten der
               gewählte Knopf), VG (= Text) teilt sich das Feld mit 'fg'. -->
          <div class="kme-row" data-f="bg0">
            <label>BG0</label>
            <input type="color" class="es-bg0" value="#232833" title="Grund-Hintergrund" />
            <button class="es-bg0-clear kme-x" title="entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="bg1">
            <label>BG1</label>
            <input type="color" class="es-bg1" value="#5ad1ff" title="Hintergrund der aktiven/gewählten Stufe" />
            <button class="es-bg1-clear kme-x" title="entfernen">✕</button>
          </div>
          <!-- Caption (@dpa 20260719_120425): der Text AUF dem Knopf, getrennt nach
               Zustand: „Caption an" (solange der Knopf aktiv ist), „Caption aus" (sonst).
               Der LABEL sitzt außen und wird via labelPos positioniert. -->
          <div class="kme-row" data-f="textOn">
            <label>Caption an</label>
            <input type="text" class="es-texton" maxlength="24" title="Beschriftung auf dem Knopf im aktiven (ON) Zustand" />
          </div>
          <div class="kme-row" data-f="textOff">
            <label>Caption aus</label>
            <input type="text" class="es-textoff" maxlength="24" title="Beschriftung auf dem Knopf im Ruhezustand" />
          </div>
          <!-- Dritter Zustand über den Blink-Wartezustand (@dpa 20260722_152438, ddw.md „R":
               „unterschiedliche Farben … für jede Selektion eine andere BG-Farbe und eigenen
               Caption-Text") — für Controls mit mehr als zwei Zuständen (z.B. ChordMemory-
               Zyklus). Leer/nicht gesetzt = fällt auf Caption/BG „an" zurück (rückwärtskompatibel). -->
          <div class="kme-row" data-f="textBlink">
            <label>Caption blink</label>
            <input type="text" class="es-textblink" maxlength="24" title="Beschriftung im dritten (blinkenden) Zustand — leer = wie Caption an" />
          </div>
          <!-- ON-Hintergrund (@dpa 20260718_203341: „Buttons brauchen zusätzlich eine ON
               Farbe. Also 'BG off', 'BG on' und 'Text'"). Nur beim Button sichtbar; greift,
               solange der Knopf „an" ist (z.B. Start, solange das Metronom läuft). -->
          <div class="kme-row" data-f="bgOn">
            <label>BG an</label>
            <input type="color" class="es-bgon" value="#5ad1ff" title="Hintergrundfarbe im aktiven (ON) Zustand" />
            <button class="es-bgon-clear kme-x" title="ON-Hintergrund entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="bgBlink">
            <label>BG blink</label>
            <input type="color" class="es-bgblink" value="#ff9f5a" title="Hintergrundfarbe im dritten (blinkenden) Zustand — leer = wie BG an" />
            <button class="es-bgblink-clear kme-x" title="Blink-Hintergrund entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="fg">
            <label>Text</label>
            <input type="color" class="es-fg" value="#dddddd" title="Vordergrund-/Textfarbe" />
            <button class="es-fg-clear kme-x" title="Vordergrundfarbe entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="size">
            <label>Größe</label>
            <input type="number" class="es-size" min="6" max="28" step="1" title="Schriftgröße im Feld (px)" />
          </div>
          <div class="kme-row" data-f="fontSize">
            <label>Textgr.</label>
            <input type="number" class="es-fontsize" min="7" max="28" step="1" title="Textgröße (px)" />
          </div>
          <!-- 'Breite' wird beim Menü-Schalter zu 'Länge' und beim Keyboard zu 'Taste ↔'
               (s. open()); die Grenzen setzt open() gleich mit, weil eine Taste einen
               anderen Bereich braucht als ein Textfeld. -->
          <div class="kme-row" data-f="boxSize">
            <label>Breite</label>
            <input type="number" class="es-boxsize" min="20" max="1200" step="2" />
          </div>
          <div class="kme-row" data-f="boxH">
            <label>Höhe</label>
            <input type="number" class="es-boxh" min="16" max="1200" step="2" />
          </div>
          <!-- Nur beim Keyboard: Abstand ZWISCHEN den Tasten. Bei kleinen Tasten wirkte
               der feste Abstand viel zu groß (@dpa 20260716_132014). -->
          <div class="kme-row" data-f="gap">
            <label>Abstand</label>
            <input type="number" class="es-gap" min="0" max="10" step="1" title="Abstand zwischen den Tasten (0–10 px)" />
          </div>
          <!-- Anordnung (@dpa 20260721_205531): Oktaven-Zeilen gestapelt (Standard, wie
               ein Piano-Roll) vs. eine durchgehende horizontale Reihe. Icon-Knopf statt
               Checkbox, weil er die Zielansicht selbst zeigt (Klick = Wechsel dorthin). -->
          <div class="kme-row" data-f="horiz">
            <label>Anordnung</label>
            <button type="button" class="es-horiz kme-icon-toggle" title="Zwischen gestapelten Oktaven-Zeilen und einer durchgehenden horizontalen Reihe wechseln"></button>
          </div>
          <!-- Takt-Anzeige (@dpa 20260718_203341): Haupt-/Nebenbeat-Farbe, Beat-Größe, Radius
               (0=eckig…1=rund), Padding. BG/Abstand/Breite/Höhe teilen sich die Felder oben. -->
          <div class="kme-row" data-f="mainColor">
            <label>Hauptbeat</label>
            <input type="color" class="es-maincolor" value="#5ad1ff" title="Farbe des Taktschlags (die 1)" />
            <button class="es-maincolor-clear kme-x" title="zurück zum Standard">✕</button>
          </div>
          <div class="kme-row" data-f="subColor">
            <label>Nebenbeat</label>
            <input type="color" class="es-subcolor" value="#ff9f5a" title="Farbe der übrigen Beats" />
            <button class="es-subcolor-clear kme-x" title="zurück zum Standard">✕</button>
          </div>
          <div class="kme-row" data-f="beatSize">
            <label>Beat-Größe</label>
            <input type="number" class="es-beatsize" min="4" max="48" step="1" title="Durchmesser eines Beat-Punkts (px)" />
          </div>
          <div class="kme-row" data-f="radius">
            <label>Radius</label>
            <input type="number" class="es-radius" min="0" max="1" step="0.05" title="0 = eckig … 1 = rund" />
          </div>
          <div class="kme-row" data-f="pad">
            <label>Padding</label>
            <input type="number" class="es-pad" min="0" max="40" step="1" title="Innenabstand zur Hintergrundfläche (px)" />
          </div>
          <!-- Akkord-Speicher (@dpa 20260722_004312): Rastermaße (Spalten×Zeilen) + Slot-Größe
               + Farben. BG (oben) = Rasterfläche; VG1 = leerer Slot, VG2 = belegter Slot,
               VG3 = aktiver (zuletzt abgerufener) Slot. „nur in und als Settings Eingabe". -->
          <div class="kme-row" data-f="memCols">
            <label>Spalten</label>
            <input type="number" class="es-memcols" min="1" max="12" step="1" title="Anzahl Speicher-Spalten" />
          </div>
          <div class="kme-row" data-f="memRows">
            <label>Zeilen</label>
            <input type="number" class="es-memrows" min="1" max="12" step="1" title="Anzahl Speicher-Zeilen" />
          </div>
          <div class="kme-row" data-f="slotSize">
            <label>Slot</label>
            <input type="number" class="es-slotsize" min="12" max="80" step="1" title="Kantenlänge eines Slot-Quadrats (px)" />
          </div>
          <div class="kme-row" data-f="vg1">
            <label>VG1 leer</label>
            <input type="color" class="es-vg1" value="#232833" title="Farbe leerer Slots" />
            <button class="es-vg1-clear kme-x" title="zurück zum Standard">✕</button>
          </div>
          <div class="kme-row" data-f="vg2">
            <label>VG2 belegt</label>
            <input type="color" class="es-vg2" value="#2e6e8e" title="Farbe belegter Slots" />
            <button class="es-vg2-clear kme-x" title="zurück zum Standard">✕</button>
          </div>
          <div class="kme-row" data-f="vg3">
            <label>VG3 aktiv</label>
            <input type="color" class="es-vg3" value="#b0672e" title="Farbe des aktiven (zuletzt abgerufenen) Slots" />
            <button class="es-vg3-clear kme-x" title="zurück zum Standard">✕</button>
          </div>
          <!-- Data-Sektion (Punkt 1, ddw.md, Sequenzer-Steps — @dpa wörtlich): Werte-Skala
               des Step-Grids, Default kommt vom gewählten Sq-Ziel, hier überschreibbar.
               'An/Aus' AN (Standard, @dpa ddw.md 20260724_153349 umbenannt von 'Aus') = wie
               bisher: Klick schaltet Steps an/aus, ein gesetzter Wert wird beim Ausschalten
               gemerkt. 'An/Aus' AUS = kein Sonderfall mehr, jeder Wert inkl. 0 ist ein echter
               Wert, Klick/Zug setzen ihn direkt. -->
          <!-- Scope-Genauigkeit (ddw.md 20260727, Grill-Runde @dpa): frame (Default, einmal
               pro Anzeige-Frame) vs. sample (echter AnalyserNode, audio-rate — nur möglich,
               wenn die gewählte Quelle einen echten AudioNode hat, s. open()-Ausgrauen). Das
               "!" warnt statisch bei 'sample' vor dem Mehr-CPU-Kosten (Hover-Tooltip, kein
               Bestätigungsdialog — Grill-Ergebnis). -->
          <div class="kme-row" data-f="accuracy">
            <label>Genauigkeit</label>
            <select class="es-accuracy" title="frame: einmal pro Anzeige-Frame (Default) · sample: audio-rate über einen echten AnalyserNode — nur bei Quellen mit AudioNode wählbar">
              <option value="frame">Frame</option>
              <option value="sample">Sample</option>
            </select>
            <span class="es-accuracy-warn" title="Sample-genau kann deutlich mehr CPU kosten (AnalyserNode läuft audio-rate)">!</span>
          </div>
          <div class="kme-row" data-f="seqOff">
            <label>An/Aus</label>
            <input type="checkbox" class="es-seqoff" title="AN: Step an/aus schaltbar (wie bisher). AUS: kein Ausschalten mehr — jeder Wert inkl. 0 ist gültig, Klick/Zug setzen ihn direkt." />
          </div>
          <div class="kme-row" data-f="seqMin">
            <label>Min</label>
            <input type="number" class="es-seqmin" step="1" title="Unterer Wert des Step-Grids" />
          </div>
          <div class="kme-row" data-f="seqMax">
            <label>Max</label>
            <input type="number" class="es-seqmax" step="1" title="Oberer Wert des Step-Grids" />
          </div>
          <div class="kme-row" data-f="seqStep">
            <label>Stepsize</label>
            <input type="number" class="es-seqstep" min="0" step="1" title="Rasterung der Werte (0 = stufenlos)" />
          </div>
        </div>
        <!-- Hilfe-Text dieses Controls (@dpa 20260716_174111: „diese hints sollten
             (zumindest das deutsche) editierbar sein"). Leer = die Auslieferung gilt;
             ✕ stellt sie wieder her. Eine bewusst leere Hilfe ist auch eine Ansage –
             deshalb unterscheidet das Feld zwischen „nichts eingetragen" und „leer". -->
        <!-- Optionen umbenennen (@dpa 20260719_030544): statt einer Formel eine Reihe schmaler
             Textfelder — EINS pro Option, direkt umbenennbar. Die Anzahl ist fest (kommt aus
             dem Code: „so viel wie modi vorgegeben sind"). open() baut die Felder je Control. -->
        <div class="kme-row kme-wide es-optlabels-row" data-f="optLabels">
          <label>Optionen <button type="button" class="es-optlabels-help kme-qbtn" title="Was hier steht">?</button></label>
          <div class="es-optlabels"></div>
        </div>
        <!-- Wechsel-Button (@dpa 20260722_194404, Fein­schliff 20260722_203201: „n brauchts
             nicht, das ist Background" — die Stufenzahl steuert sich rein über die Tabelle
             selbst): eine Zeile pro Stufe, umsortierbar (▲▼), „+" hängt eine neue Stufe an,
             ✕ entfernt eine — Caption/Farbe/Kurzbeschreibung je Stufe. -->
        <div class="kme-row kme-wide es-wechsel-row" data-f="wechselTable">
          <label>Stufen <button type="button" class="es-wechsel-add kme-qbtn" title="Neue Stufe anhängen">+</button></label>
          <div class="es-wechsel-rows"></div>
        </div>
        <!-- ~3 Zeilen, volle Breite, x/y-resizable, OHNE ✕ (@dpa 20260719_120425). -->
        <div class="kme-row kme-wide kme-help-row">
          <label>Hilfe</label>
          <textarea class="es-help" rows="3" title="Hilfe-Blase dieses Controls. Leeren = wieder der Auslieferungstext."></textarea>
        </div>
      </div>
    `;
    panel.querySelector('.kme-close').addEventListener('click', () => this.close());

    // Alle Felder wenden sofort an (live), wie beim Knob-Editor die Farbe/Ansicht.
    // Die Farbfelder brauchen dedizierte Handler: erst „aktiv"-Flag setzen, DANN _apply –
    // sonst sammelt _apply die Farbe noch vor dem Flag ein (Reihenfolge-Bug).
    const live = ['.es-label', '.es-labelon', '.es-labelpos', '.es-btnmode', '.es-size', '.es-fontsize', '.es-boxsize', '.es-boxh', '.es-gap', '.es-beatsize', '.es-radius', '.es-pad', '.es-texton', '.es-textoff', '.es-textblink', '.es-memcols', '.es-memrows', '.es-slotsize', '.es-seqoff', '.es-seqmin', '.es-seqmax', '.es-seqstep', '.es-accuracy'];
    live.forEach((sel) => {
      const el = panel.querySelector(sel);
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => this._apply());
    });
    // "!"-Hinweis (ddw.md 20260727): statisch neben dem Toggle, nur sichtbar solange 'sample'
    // gewählt ist — kein Bestätigungsdialog (Grill-Ergebnis @dpa).
    panel.querySelector('.es-accuracy').addEventListener('change', () => this._syncAccuracyWarn());
    panel.querySelector('.es-bg').addEventListener('input', () => { this._bgOn = true; this._apply(); });
    panel.querySelector('.es-fg').addEventListener('input', () => { this._fgOn = true; this._apply(); });
    panel.querySelector('.es-bg-clear').addEventListener('click', () => { this._bgOn = false; this._apply(); });
    panel.querySelector('.es-fg-clear').addEventListener('click', () => { this._fgOn = false; this._apply(); });
    // ON-Hintergrund (Button): eigener „aktiv"-Flag, sonst sammelt _collect die Farbe vor dem Flag.
    panel.querySelector('.es-bgon').addEventListener('input', () => { this._bgOnColor = true; this._apply(); });
    panel.querySelector('.es-bgon-clear').addEventListener('click', () => { this._bgOnColor = false; this._apply(); });
    // Blink-Hintergrund (Button, dritter Zustand): gleiches Muster wie BG an.
    panel.querySelector('.es-bgblink').addEventListener('input', () => { this._bgBlinkColor = true; this._apply(); });
    panel.querySelector('.es-bgblink-clear').addEventListener('click', () => { this._bgBlinkColor = false; this._apply(); });
    // Takt-Anzeige-Farben (Haupt/Neben): eigene Flags wie bei bg/fg.
    panel.querySelector('.es-maincolor').addEventListener('input', () => { this._mainOn = true; this._apply(); });
    panel.querySelector('.es-maincolor-clear').addEventListener('click', () => { this._mainOn = false; this._apply(); });
    panel.querySelector('.es-subcolor').addEventListener('input', () => { this._subOn = true; this._apply(); });
    panel.querySelector('.es-subcolor-clear').addEventListener('click', () => { this._subOn = false; this._apply(); });
    // Select/Segment: BG0/BG1 (eigene Flags). Die Options-Umbenennfelder baut open() je
    // Control dynamisch (unten), inkl. eigener Live-Listener.
    // Anordnung-Icon (Keyboard): eigener Flag statt live-Liste, weil der Button keinen
    // Wert trägt — er zeigt/togglet nur den Zielzustand (s. _syncHorizBtn).
    panel.querySelector('.es-horiz').addEventListener('click', () => { this._horiz = !this._horiz; this._syncHorizBtn(); this._apply(); });
    panel.querySelector('.es-bg0').addEventListener('input', () => { this._bg0On = true; this._apply(); });
    panel.querySelector('.es-bg0-clear').addEventListener('click', () => { this._bg0On = false; this._apply(); });
    panel.querySelector('.es-bg1').addEventListener('input', () => { this._bg1On = true; this._apply(); });
    panel.querySelector('.es-bg1-clear').addEventListener('click', () => { this._bg1On = false; this._apply(); });
    // Akkord-Speicher: VG1/VG2/VG3 (eigene Flags wie bg0/bg1).
    panel.querySelector('.es-vg1').addEventListener('input', () => { this._vg1On = true; this._apply(); });
    panel.querySelector('.es-vg1-clear').addEventListener('click', () => { this._vg1On = false; this._apply(); });
    panel.querySelector('.es-vg2').addEventListener('input', () => { this._vg2On = true; this._apply(); });
    panel.querySelector('.es-vg2-clear').addEventListener('click', () => { this._vg2On = false; this._apply(); });
    panel.querySelector('.es-vg3').addEventListener('input', () => { this._vg3On = true; this._apply(); });
    panel.querySelector('.es-vg3-clear').addEventListener('click', () => { this._vg3On = false; this._apply(); });
    panel.querySelector('.es-optlabels-help').addEventListener('click', (e) => { e.stopPropagation(); this._toggleContentHelp(); });
    // Hilfe-Text: geht NICHT durch _apply/ctrlStyles – er ist eine eigene Kategorie
    // (state.hintText), damit er sich unabhängig sichern und zurücksetzen lässt.
    panel.querySelector('.es-help').addEventListener('input', () => this._applyHelp());

    // Design-Presets als PickMenu (@dpa 20260722_013727) – Liste/Auswahl hängen am jeweils
    // OFFENEN Controls-Typ (this._target.type), deshalb hier über Funktionen statt fixer
    // Werte, und die Liste pro Typ in state.designPresets.
    this._designSel = {};   // type → zuletzt gewählter Design-Name (nur UI-Hervorhebung, nicht persistiert)
    this._designMenu = new PickMenu({
      empty: '— keins —',
      title: 'Gespeichertes Design wählen (nur fürs Aussehen – Label/Hilfe bleiben unberührt)',
      list: () => this._designPresets(),
      current: () => (this._target && this._designSel[this._target.type]) || '',
      onPick: (i, p) => {
        if (!this._target) return;
        this._designSel[this._target.type] = p.name;
        this._applyDesign(p.style);
      },
      onUpdate: (i) => {
        if (!this._target) return;
        const list = this._designPresets().slice();
        list[i] = { ...list[i], style: this._currentDesignStyle() };
        this._state.set('designPresets', { ...(this._state.get('designPresets') || {}), [this._target.type]: list });
      },
      onRename: (i, p, nm) => {
        const list = this._designPresets().slice();
        if (list.some((x, idx) => idx !== i && x.name === nm)) return 'Name schon vergeben.';
        list[i] = { ...list[i], name: nm };
        this._state.set('designPresets', { ...(this._state.get('designPresets') || {}), [this._target.type]: list });
        if (this._target && this._designSel[this._target.type] === p.name) this._designSel[this._target.type] = nm;
        return '';
      },
      onDelete: (i, p) => {
        if (!confirm('Design „' + p.name + '" löschen?')) return;
        const list = this._designPresets().slice(); list.splice(i, 1);
        this._state.set('designPresets', { ...(this._state.get('designPresets') || {}), [this._target.type]: list });
        if (this._target && this._designSel[this._target.type] === p.name) this._designSel[this._target.type] = '';
      },
      foot: [
        ['plus', 'Neu…', 'Aktuelles Aussehen (ohne Label/Hilfe) als Design speichern', () => this._saveDesignPreset()],
      ],
    });
    panel.querySelector('.es-design-menu').appendChild(this._designMenu.element);

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      // Enter übernimmt – wie im Regler-Editor. Die Felder wirken zwar ohnehin live, aber
      // die Fußzeile verspricht „Enter = Übernehmen" (@dpa 20260716_174111: „dann haben
      // wir noch Enter"), und ein Versprechen, das nur der andere Editor einlöst, ist eins
      // zu viel.
      // In der Hilfe-textarea braucht Enter einen Zeilenumbruch (@dpa 20260720) → nicht abfangen.
      else if (e.key === 'Enter') { if (e.target && e.target.tagName === 'TEXTAREA') return; e.preventDefault(); this._apply(); }
    }, true);
    // Außenklick schließt (nicht bei Klick auf ein Element-Settings-Ziel selbst).
    // Ausnahmen: ein offener Farbwähler (lebt außerhalb des DOM, s. colorPick.js) UND das
    // Design-PickMenu (dieselbe Bauart, ebenfalls an <body> gehängt, @dpa 20260722_013727) –
    // ohne diese Ausnahme schloss der mousedown-Klick auf „Neu…"/eine Design-Zeile das Panel
    // VOR dem Klick-Handler und _saveDesignPreset() griff ins Leere (this._target war schon
    // null; derselbe historische Bug wie beim Farb-Speicher, @dpa 20260716_174111).
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      if (panel.contains(e.target) || e.target.closest('[data-ctrl]')) return;
      if (colorPickerBusy(panel)) return;
      if (this._designMenu && this._designMenu.contains(e.target)) return;
      this.close();
    });

    document.body.appendChild(panel);
    upgradeColorInputs(panel);   // eigener kompakter Farbwähler statt des nativen (@dpa 20260719_120425)
    this._panel = panel;
    // Position merken (ddw.md 20260726): wie groupSettingsPos in GroupHost.js.
    makeDraggable(panel, panel.querySelector('.kme-header'), (pos) => {
      if (this._state) this._state.set('elementSettingsPos', pos);
    });
  }

  get isOpen() { return this._panel.style.display !== 'none'; }
  /** Das Panel-DOM-Element (Singleton, wird bei jedem open() wiederverwendet) — für
   *  Erweiterungen von außen, z.B. den Größen-Änderungs-Hinweis (@dpa 20260721). */
  get panel() { return this._panel; }

  /** Welche Felder sind für welchen Typ sichtbar? */
  _fieldsFor(type, hasBlink) {
    // select (@dpa 20260715, „Menu Switches: fehlt noch Größe + Label On/Off"):
    // 'size' gab es schon, ging aber nur auf die SCHRIFTgröße – gemeint war offenbar die
    // Größe des Schalters selbst. Beides ist jetzt da: 'size' = Schrift, 'boxSize' = Breite.
    // Select/Segment (@dpa 20260719_030544): Label + Label-an; die Options-Namen als Reihe
    // von Umbenennfeldern (optLabels, eins pro Option); Farben BG0/BG1/VG; „Länge tut nichts,
    // kann weg — dafür Schriftgröße + Padding". (Formel + „letzten aus" sind raus/später.)
    // @dpa 20260723_857ff: 'Label' bekommt dieselbe Positions-Wahl wie beim Knob/Toggle
    // (Oben/Links/Rechts/Unten/Ohne statt nur an/aus) + 'Länge' (des Auswahlmenüs, 0=auto
    // Default, >0=feste Breite) — boxSize existierte als Feld schon (open() relabelt „Breite"
    // bereits zu „Länge" bei type==='select', s. dort), stand aber noch nicht in dieser Liste.
    if (type === 'select') return ['label', 'labelPos', 'optLabels', 'bg0', 'bg1', 'fg', 'size', 'pad', 'boxSize'];
    if (type === 'toggle') return ['label', 'labelPos'];
    // Readouts tragen Live-Text (textContent wird laufend gesetzt) → nur Optik ohne
    // Struktur-Umbau: Textgröße, Feldbreite, Textfarbe. (Label/Label-an/aus würde jeden
    // Readout-Update umbauen – bewusst weggelassen, s. Commit.)
    if (type === 'readout') return ['fontSize', 'boxSize', 'fg'];
    // Schrift-Eingabe: wie ein Select, dazu die Höhe – Breite/Höhe schreibt auch der
    // Vergrößerungs-Zipfel hierher, das Panel ist der zweite Weg zur selben Größe.
    if (type === 'text') return ['label', 'labelOn', 'bg', 'fg', 'size', 'boxSize', 'boxH'];
    // Reines Text-Element: sein Inhalt IST das Label (@dpa 20260715_223000).
    if (type === 'note') return ['label', 'fontSize', 'boxSize', 'fg'];
    // Button (@dpa 20260719_120425): Label (außen) + LabelPos / Caption an/aus / Größe/Farbe/Padding
    // / BG aus/an / Button-Breite/Höhe. labelPos positioniert das ÄUSSERE Label, Caption ist
    // immer zentriert IM Button.
    // textBlink/bgBlink (dritter, blinkender Zustand) nur bei Buttons, die das auch NUTZEN
    // (hasBlink, aus BUTTONS-defs, z.B. Speicher-„R") — @dpa 20260722_172315: „es ist ein
    // besonderer Button, das hat nichts in anderen Buttons zu tun". Ohne hasBlink verhält
    // sich ein Button also wieder wie vor dem Blink-Feature.
    if (type === 'button') {
        const base = ['label', 'labelPos', 'btnMode', 'textOn', 'textOff', 'size', 'fg', 'pad', 'bg', 'bgOn', 'boxSize', 'boxH'];
        return hasBlink ? ['label', 'labelPos', 'btnMode', 'textOn', 'textOff', 'textBlink', 'size', 'fg', 'pad', 'bg', 'bgOn', 'bgBlink', 'boxSize', 'boxH'] : base;
    }
    // Sonderfenster-Opener (@dpa 20260719_040136: „einem Button ähnlich … dessen settings,
    // ohne Label & L.Pos"): wie der Button, aber ohne Label und Label-Position.
    if (type === 'opener') return ['textOn', 'textOff', 'size', 'fg', 'pad', 'bg', 'bgOn', 'boxSize', 'boxH'];
    // Keyboard (@dpa 20260716_031100: „muss ein (special) control werden: man muss die
    // Größe und Farben ändern können"). Kein Label – seine Tasten sind seine Beschriftung.
    // boxSize/boxH = Breite/Höhe EINER Taste (nicht des ganzen Bretts): so bleibt es bei
    // 12 Tasten gleichmäßig, statt dass eine Gesamtbreite krumme Tasten erzeugt.
    if (type === 'keyboard') return ['bg', 'fg', 'boxSize', 'boxH', 'gap', 'horiz'];
    // Takt-Anzeige (@dpa 20260718_203341): alle Farben (Haupt/Neben/BG), Beat-Größe, Abstände,
    // Radius (0-1), Padding, Breite/Höhe (0=auto).
    if (type === 'beatview') return ['mainColor', 'subColor', 'bg', 'beatSize', 'gap', 'radius', 'pad', 'boxSize', 'boxH'];
    // Akkord-Speicher (@dpa 20260722_004312): Rastermaße + Slot-Größe + Farben (BG=Fläche,
    // VG1=leer, VG2=belegt, VG3=aktiv). Kein Label — die Slots beschriften sich selbst
    // (Nummern ab 1 bzw. Kürzel via Doppelklick, nicht hier).
    if (type === 'speicher') return ['memCols', 'memRows', 'slotSize', 'bg', 'vg1', 'vg2', 'vg3'];
    // LevelMeter (@dpa 20260722): Balkenfarbe + Größe, sonst nichts — kein Label (die
    // Balken-Zonen sprechen für sich), keine Struktur-Felder.
    if (type === 'levelmeter') return ['fg', 'bg', 'boxSize', 'boxH'];
    // Stepsequenzer-Muster (@dpa 20260722_203201, neues ISM): kein Label — die Steps
    // sprechen für sich (wie Speicher/LevelMeter). bg = Grundfläche, fg = Balkenfarbe,
    // boxSize/boxH = Breite/Höhe der Canvas.
    if (type === 'stepseq') return ['bg', 'fg', 'boxSize', 'boxH', 'seqOff', 'seqMin', 'seqMax', 'seqStep'];
    // Wechsel-Button (@dpa 20260722_194404, Feinschliff 20260722_203201: „Settings wie beim
    // normalen Button — von Button alles außer Modus" — Caption/BG stecken schon je Stufe in
    // der Tabelle, darum ohne textOn/textOff/textBlink/bg/bgOn/bgBlink UND ohne btnMode, den
    // gibt's beim Wechsel-Button nicht (er zyklet immer)).
    if (type === 'wechsel') return ['label', 'labelPos', 'size', 'fg', 'pad', 'boxSize', 'boxH', 'wechselTable'];
    // Signal-Scope (ddw.md 20260727): bisher nur 'label' (Auslieferungs-Default hier unten) —
    // 'accuracy' ergänzt den frame/sample-Toggle aus der Grill-Runde. bufferMs/minVal/maxVal/
    // Farben haben noch KEINE UI hier (vorbestehende Lücke, nicht Teil dieser Änderung).
    if (type === 'scope') return ['label', 'accuracy'];
    return ['label'];
  }

  /**
   * @param {{id:string, type:'select'|'toggle'|'readout', el:HTMLElement,
   *          defLabel?:string, applyStyle:(style:object)=>void}} target
   */
  open(target) {
    this._target = target;
    const style = (this._state && (this._state.get('ctrlStyles') || {})[target.id]) || {};
    const fieldOrder = this._fieldsFor(target.type, target.hasBlink);
    const show = new Set(fieldOrder);
    this._panel.querySelectorAll('.kme-row[data-f]').forEach((row) => {
      row.style.display = show.has(row.dataset.f) ? '' : 'none';
    });
    // Die _fieldsFor-Reihenfolge IST die Panel-Ordnung (@dpa 20260719_120425: Button-Felder
    // in vorgegebener Folge) — die sichtbaren Zeilen im Grid entsprechend umsortieren.
    const grid = this._panel.querySelector('.kme-grid');
    fieldOrder.forEach((f) => {
      const row = grid.querySelector(`.kme-row[data-f="${f}"]`);
      if (row) grid.appendChild(row);
    });

    const esLabel = this._panel.querySelector('.es-label');
    // NUR Platzhalter, nicht Wert (@dpa 20260724_122929 aufgefallen: Reset/Fill-Buttons mit
    // defLabel != eigentlicher Caption — jede Änderung an IRGENDEINEM Feld schrieb defLabel
    // unbeabsichtigt als echten Wert fest, weil _apply() jedes Feld immer mit ausliest, auch
    // unberührte). Leer bleibt leer, bis der Mensch wirklich etwas einträgt; das jeweilige
    // Control fällt zur Laufzeit ohnehin selbst auf sein eigenes Label/defText zurück.
    esLabel.value = style.label ?? '';
    // Label temporär löschen → das Ur-Label (Manifest) bzw. die Control-ID erscheint als
    // Platzhalter (@dpa 20260720, Punkt H): so sieht man, wie ein Control ursprünglich heißt.
    esLabel.placeholder = target.defLabel || target.id || '';
    this._panel.querySelector('.es-labelon').checked = style.labelOn !== false;   // default an
    // Label-Position ohne „Mitte" mehr (@dpa 20260719_030544). Default: oben.
    this._panel.querySelector('.es-labelpos').value = style.labelPos || 'top';
    // Button-Modus: gespeicherter Wert, sonst der Default aus den defs (via target.defMode).
    this._panel.querySelector('.es-btnmode').value = style.btnMode || target.defMode || 'toggle';
    // Button-Texte an/aus (@dpa 20260719_040136): Default BEIDE gleich = Manifest-Label — als
    // Platzhalter (s.o.), nicht als Wert.
    const esTexton = this._panel.querySelector('.es-texton'); esTexton.value = style.textOn ?? ''; esTexton.placeholder = target.defLabel || '';
    const esTextoff = this._panel.querySelector('.es-textoff'); esTextoff.value = style.textOff ?? ''; esTextoff.placeholder = target.defLabel || '';
    // Dritter (Blink-)Zustand (s.o.): Default LEER, nicht das Label — leer heißt „fällt auf
    // Caption/BG an zurück", ein erzwungener Default-Text wäre für Buttons mit nur zwei
    // Zuständen (die meisten) irreführend.
    this._panel.querySelector('.es-textblink').value = style.textBlink ?? '';
    this._bgOn = !!style.bg;
    this._panel.querySelector('.es-bg').value = style.bg || '#222222';
    this._bgOnColor = !!style.bgOn;
    this._panel.querySelector('.es-bgon').value = style.bgOn || '#5ad1ff';
    this._bgBlinkColor = !!style.bgBlink;
    this._panel.querySelector('.es-bgblink').value = style.bgBlink || '#ff9f5a';
    this._fgOn = !!style.fg;
    this._panel.querySelector('.es-fg').value = style.fg || '#dddddd';
    this._panel.querySelector('.es-size').value = style.size || '';
    this._panel.querySelector('.es-fontsize').value = style.fontSize || '';
    this._panel.querySelector('.es-boxsize').value = style.boxSize || '';
    this._panel.querySelector('.es-boxh').value = style.boxH || '';
    this._panel.querySelector('.es-gap').value = style.gap ?? '';
    this._horiz = !!style.horiz;
    this._syncHorizBtn();
    // Takt-Anzeige-Felder (@dpa 20260718_203341).
    this._mainOn = !!style.mainColor;
    this._panel.querySelector('.es-maincolor').value = style.mainColor || '#5ad1ff';
    this._subOn = !!style.subColor;
    this._panel.querySelector('.es-subcolor').value = style.subColor || '#ff9f5a';
    this._panel.querySelector('.es-beatsize').value = style.beatSize || '';
    this._panel.querySelector('.es-radius').value = style.radius ?? '';
    this._panel.querySelector('.es-pad').value = style.pad ?? '';
    // Select/Segment-Felder (@dpa 20260718_234247).
    this._bg0On = !!style.bg0;
    this._panel.querySelector('.es-bg0').value = style.bg0 || '#232833';
    this._bg1On = !!style.bg1;
    this._panel.querySelector('.es-bg1').value = style.bg1 || '#5ad1ff';
    // Akkord-Speicher-Felder (@dpa 20260722_004312): Maße + Slot-Größe + VG1/2/3-Farben.
    this._panel.querySelector('.es-memcols').value = style.memCols || '';
    this._panel.querySelector('.es-memrows').value = style.memRows || '';
    this._panel.querySelector('.es-slotsize').value = style.slotSize || '';
    this._vg1On = !!style.vg1;
    this._panel.querySelector('.es-vg1').value = style.vg1 || '#232833';
    this._vg2On = !!style.vg2;
    this._panel.querySelector('.es-vg2').value = style.vg2 || '#2e6e8e';
    this._vg3On = !!style.vg3;
    this._panel.querySelector('.es-vg3').value = style.vg3 || '#b0672e';
    // Scope-Genauigkeit (ddw.md 20260727): 'sample' nur wählbar, wenn die AKTUELL gewählte
    // Quelle einen echten AudioNode hat (target.sampleCapable() — live-Funktion, s.
    // multiScope.js). Ohne Node bleibt der Toggle auf 'frame' UND ausgegraut, statt einen
    // Wert zu zeigen, der ohnehin nicht greifen würde (Grill-Runde: „automatisch still auf
    // frame zurückfallen, keine Fehlermeldung").
    const accSel = this._panel.querySelector('.es-accuracy');
    const capable = typeof target.sampleCapable === 'function' ? !!target.sampleCapable() : false;
    accSel.value = capable ? (style.accuracy || 'frame') : 'frame';
    accSel.disabled = !capable;
    accSel.title = capable
      ? 'frame: einmal pro Anzeige-Frame (Default) · sample: audio-rate über einen echten AnalyserNode'
      : 'Die gewählte Quelle hat keinen echten Audio-Node — sample-genau ist hier nicht möglich, bleibt bei frame.';
    this._syncAccuracyWarn();
    // Data-Sektion (Punkt 1, ddw.md): leer = kein Override, das Grid fällt dann auf die
    // Default-Werte des GEWÄHLTEN Sq-Ziels zurück (StepSeqGrid._target, via
    // setTargetDefaults() von multiSq.js gesetzt) — hier zeigt ein leeres Feld genau das.
    this._panel.querySelector('.es-seqoff').checked = style.seqOff !== false;
    this._panel.querySelector('.es-seqmin').value = style.seqMin ?? '';
    this._panel.querySelector('.es-seqmax').value = style.seqMax ?? '';
    this._panel.querySelector('.es-seqstep').value = style.seqStep ?? '';
    // Options-Umbenennfelder bauen (@dpa 20260719_030544): eins pro Option des Controls,
    // vorbefüllt mit dem aktuellen Namen (gespeicherter Override, sonst Manifest-Anzeige).
    this._buildOptLabels(target, style);
    this._buildWechselTable(target, style);
    this._closeContentHelp();
    // Beim Menü-Schalter heißt die Feldbreite 'Länge' (@dpa 20260716_011222, „z.B. bei
    // Filter Typ wichtig") – dasselbe Wort wie beim Fader, denn es ist dieselbe Geste:
    // wie lang darf das Ding werden. Wo es eine Feldhöhe daneben gibt (Text/Button),
    // bleibt das Paar Breite/Höhe – dort wäre 'Länge' mehrdeutig.
    const boxLab = this._panel.querySelector('.kme-row[data-f="boxSize"] label');
    if (boxLab) boxLab.textContent = target.type === 'select' ? 'Länge' : 'Breite';
    // Beim Button heißt der normale Hintergrund „BG aus" (Gegenstück zu „BG an"), @dpa 20260718_203341.
    const bgLab = this._panel.querySelector('.kme-row[data-f="bg"] label');
    if (bgLab) bgLab.textContent = target.type === 'button' ? 'BG aus' : 'BG';
    // Beat-Anzeige darf mehr Abstand als Tasten (0–40) – die Tasten bleiben bei 0–10.
    const gapIn = this._panel.querySelector('.es-gap');
    if (gapIn) gapIn.max = target.type === 'beatview' ? 40 : 10;
    // Beim Keyboard geht es um EINE Taste – das muss dranstehen, sonst tippt man eine
    // Gesamtbreite ein und bekommt ein 12× so breites Brett. Und es braucht eigene
    // Grenzen (@dpa 20260716_132014: „Taste ↔ minimum 10, maximum 999 · Taste ↕ min 10,
    // max 500") – die Textfeld-Grenzen (20/1200) ließen 12 Tasten ins Uferlose wachsen
    // und verboten zugleich die schmalen, die @dpa in seiner 194px-Gruppe braucht.
    const wIn = this._panel.querySelector('.es-boxsize');
    const hIn = this._panel.querySelector('.es-boxh');
    const hLab = this._panel.querySelector('.kme-row[data-f="boxH"] label');
    const fgLab = this._panel.querySelector('.kme-row[data-f="fg"] label');
    if (target.type === 'keyboard') {
      if (boxLab) boxLab.textContent = 'Taste ↔';
      if (hLab) hLab.textContent = 'Taste ↕';
      if (fgLab) fgLab.textContent = 'Ton an';
      wIn.min = 10; wIn.max = 999; wIn.step = 1; hint(wIn, 'Breite EINER Taste (10–999 px)');
      hIn.min = 10; hIn.max = 500; hIn.step = 1; hint(hIn, 'Höhe EINER Taste (10–500 px)');
    } else {
      if (hLab) hLab.textContent = 'Höhe';
      if (fgLab) fgLab.textContent = 'Text';
      wIn.min = 20; wIn.max = 1200; wIn.step = 2; hint(wIn, 'Breite des Feldes (px)');
      hIn.min = 16; hIn.max = 1200; hIn.step = 2; hint(hIn, 'Höhe des Feldes (px)');
    }
    this._panel.querySelector('.kme-title').textContent = style.label ?? target.defLabel ?? 'Element';
    // Sorten-Name oben rechts (K8): die decided-Namen aus UMBAU_KONFLIKTE.md. `readout`
    // ist optisch ein Text, `keyboard` das Paradebeispiel für die u:-Sorte → „UNIKAT".
    this._panel.querySelector('.kme-sorte').textContent = ElementSettings.SORTE[target.type] || 'Text';
    this._loadHelp(target.id);
    this._designMenu.refresh();

    const rect = target.el.getBoundingClientRect();
    // Gemerkte Position (ddw.md 20260726) schlägt die Anker-Berechnung neben dem Element.
    const savedPos = this._state && this._state.get('elementSettingsPos');
    if (savedPos) {
      this._panel.style.left = savedPos.x + 'px';
      this._panel.style.top = savedPos.y + 'px';
    } else {
      this._panel.style.left = `${rect.right + 10}px`;
      this._panel.style.top = `${rect.top}px`;
    }
    this._panel.style.display = 'block';
    requestAnimationFrame(() => {
      const pr = this._panel.getBoundingClientRect();
      if (pr.right > window.innerWidth) this._panel.style.left = `${rect.left - pr.width - 10}px`;
      if (pr.bottom > window.innerHeight) this._panel.style.top = `${window.innerHeight - pr.height - 10}px`;
    });
  }

  close() { this._panel.style.display = 'none'; this._target = null; this._closeContentHelp(); }

  /** Icon + aktiv-Optik des Anordnung-Knopfs: zeigt die ZIEL-Ansicht (wohin ein Klick
   *  führt), nicht den aktuellen Zustand — wie bei einem Umschalt-Symbol üblich. */
  _syncHorizBtn() {
    const btn = this._panel.querySelector('.es-horiz');
    btn.textContent = this._horiz ? '⬍' : '⬌';
    btn.title = this._horiz
      ? 'Zu gestapelten Oktaven-Zeilen wechseln'
      : 'Zu einer durchgehenden horizontalen Reihe wechseln';
    btn.classList.toggle('kme-icon-toggle-on', this._horiz);
  }

  /** "!"-Hinweis (ddw.md 20260727): nur sichtbar, solange 'sample' im Toggle steht. */
  _syncAccuracyWarn() {
    const warn = this._panel.querySelector('.es-accuracy-warn');
    const sel = this._panel.querySelector('.es-accuracy');
    if (warn) warn.style.display = sel && sel.value === 'sample' ? '' : 'none';
  }

  /** Die Options-Umbenennfelder bauen (@dpa 20260719_030544): eine Reihe schmaler Textfelder,
   *  EINS pro Option des Controls, mit dünnen Trennern. Die Anzahl kommt aus dem Code
   *  (target.defOptions) — hier wird nur umbenannt, nicht hinzugefügt/entfernt. */
  _buildOptLabels(target, style) {
    const box = this._panel.querySelector('.es-optlabels');
    box.innerHTML = '';
    this._optInputs = [];
    const defOptions = target.defOptions || [];
    if (!defOptions.length) return;
    const saved = style.optLabels || [];
    defOptions.forEach((o, i) => {
      if (i > 0) { const sep = document.createElement('span'); sep.className = 'es-optsep'; box.appendChild(sep); }
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'es-optlabel';
      inp.value = saved[i] != null && saved[i] !== '' ? saved[i] : (o.l ?? '');
      inp.placeholder = o.l ?? '';
      hint(inp, `Name der Option ${i + 1}`);
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      inp.addEventListener('input', () => this._apply());
      box.appendChild(inp); this._optInputs.push(inp);
    });
  }

  /** Wechsel-Button-Tabelle (@dpa 20260722_194404, Feinschliff 20260722_203201): eine Zeile
   *  pro Stufe — ▲▼ (umsortieren), Caption, Farbe (Werkbank-eigener Farbwähler, s.
   *  upgradeColorInputs), Kurzbeschreibung (resizable Textarea statt einzeiligem Feld — die
   *  Beschreibung ist zugleich der ECHTE Mouseover-Text des Knopfs, GroupHost.makeWechsel
   *  paint() setzt ihn 1:1, s. dort), ✕ (entfernen). Die Stufenzahl hat KEIN eigenes Zahlen-
   *  feld mehr („n brauchts nicht, das ist Background") — „+" hängt eine neue Stufe an, ✕
   *  nimmt eine weg. defModes (target.defModes) sind die vom Aufrufer/„KI" vorgefertigten
   *  Stufen fürs Erstbefüllen; ein gespeicherter Style (style.modes) überschreibt sie. */
  _buildWechselTable(target, style) {
    const addBtn = this._panel.querySelector('.es-wechsel-add');
    const box = this._panel.querySelector('.es-wechsel-rows');
    box.innerHTML = ''; this._wechselModes = null;
    if (target.type !== 'wechsel') return;
    const defModes = target.defModes || [];
    const modes = (style.modes && style.modes.length ? style.modes : defModes).map((m) => ({ ...m }));
    this._wechselModes = modes;
    const render = () => {
      box.innerHTML = '';
      modes.forEach((m, i) => {
        const row = document.createElement('div'); row.className = 'es-wechsel-line';
        const order = document.createElement('div'); order.className = 'es-wechsel-order';
        const up = document.createElement('button'); up.type = 'button'; up.textContent = '▲';
        up.title = 'Stufe nach oben'; up.disabled = i === 0;
        up.addEventListener('click', () => { [modes[i - 1], modes[i]] = [modes[i], modes[i - 1]]; render(); this._apply(); });
        const down = document.createElement('button'); down.type = 'button'; down.textContent = '▼';
        down.title = 'Stufe nach unten'; down.disabled = i === modes.length - 1;
        down.addEventListener('click', () => { [modes[i], modes[i + 1]] = [modes[i + 1], modes[i]]; render(); this._apply(); });
        order.append(up, down);
        const cap = document.createElement('input'); cap.type = 'text'; cap.className = 'es-wechsel-caption';
        cap.value = m.caption || ''; cap.placeholder = 'Caption'; hint(cap, `Beschriftung der Stufe ${i + 1}`);
        cap.addEventListener('keydown', (e) => e.stopPropagation());
        cap.addEventListener('input', () => { m.caption = cap.value; this._apply(); });
        const col = document.createElement('input'); col.type = 'color'; col.value = m.color || '#5ad1ff';
        hint(col, `Hintergrundfarbe der Stufe ${i + 1}`);
        col.addEventListener('input', () => { m.color = col.value; this._apply(); });
        const desc = document.createElement('textarea'); desc.rows = 1; desc.className = 'es-wechsel-desc';
        desc.value = m.desc || ''; desc.placeholder = 'Kurzbeschreibung (= Mouseover-Text des Knopfs in dieser Stufe)';
        desc.addEventListener('keydown', (e) => e.stopPropagation());
        desc.addEventListener('input', () => { m.desc = desc.value; this._apply(); });
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'es-wechsel-remove'; rm.textContent = '✕';
        rm.title = 'Stufe entfernen'; rm.disabled = modes.length <= 1;
        rm.addEventListener('click', () => { modes.splice(i, 1); render(); this._apply(); });
        row.append(order, cap, col, desc, rm);
        box.appendChild(row);
      });
      upgradeColorInputs(this._panel);   // neue Farbfelder auf den Werkbank-eigenen Wähler umleiten
    };
    render();
    addBtn.onclick = () => {
      if (modes.length >= 12) return;
      modes.push({ caption: 'Modus ' + (modes.length + 1), color: '', desc: '' });
      render(); this._apply();
    };
  }

  /* ── ?-Popover: erklärt die Options-Umbenennung (@dpa 20260719_030544: vollständig, jeder
   *    Part sichtbar — nicht als Kürzel). ── */
  _toggleContentHelp() {
    if (this._contentHelp) { this._closeContentHelp(); return; }
    const pop = document.createElement('div'); pop.className = 'es-help-pop';
    pop.innerHTML = `
      <b>Optionen umbenennen</b>
      <p>Für jede Auswahl-Stufe dieses Controls gibt es <b>ein Feld</b> — trag dort den Namen ein,
         der auf dem Knopf/in der Liste stehen soll.</p>
      <ul>
        <li>Die <b>Anzahl der Stufen ist fest</b> (kommt aus dem Modul-Code) — hier wird nur
            <b>umbenannt</b>, nicht hinzugefügt oder entfernt.</li>
        <li>Ein <b>leeres Feld</b> = der <b>Standard-Name</b> dieser Stufe.</li>
        <li>Das <b>Label</b> (oben) ist die Überschrift des Controls und etwas anderes als
            diese Stufen-Namen.</li>
      </ul>
    `;
    const btn = this._panel.querySelector('.es-optlabels-help');
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
    pop.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(pop);
    this._contentHelp = pop;
    setTimeout(() => document.addEventListener('mousedown', this._contentHelpOutside = (e) => {
      if (this._contentHelp && !this._contentHelp.contains(e.target) && e.target !== btn) this._closeContentHelp();
    }, true), 0);
  }
  _closeContentHelp() {
    if (this._contentHelp) { this._contentHelp.remove(); this._contentHelp = null; }
    if (this._contentHelpOutside) { document.removeEventListener('mousedown', this._contentHelpOutside, true); this._contentHelpOutside = null; }
  }

  /** Aktuelle Felder → Style-Objekt (nur die für den Typ relevanten + gesetzten). */
  _collect() {
    const t = this._target; if (!t) return {};
    const fields = new Set(this._fieldsFor(t.type, t.hasBlink));
    const s = {};
    const P = (sel) => this._panel.querySelector(sel);
    // KEIN .trim() (@dpa 20260724): nachgestellte/mehrfache Leerzeichen sind ein bewusster
    // Platzhalter-Trick ("/     " soll breiter wirken als "/") — nur eine LEERE Eingabe
    // (Länge 0) zählt als "kein eigenes Label".
    if (fields.has('label')) { const v = P('.es-label').value; if (v.length) s.label = v; }
    if (fields.has('labelOn')) s.labelOn = P('.es-labelon').checked;
    if (fields.has('labelPos')) s.labelPos = P('.es-labelpos').value;
    if (fields.has('btnMode')) s.btnMode = P('.es-btnmode').value;
    if (fields.has('bg') && this._bgOn) s.bg = P('.es-bg').value;
    if (fields.has('bgOn') && this._bgOnColor) s.bgOn = P('.es-bgon').value;
    if (fields.has('bgBlink') && this._bgBlinkColor) s.bgBlink = P('.es-bgblink').value;
    if (fields.has('fg') && this._fgOn) s.fg = P('.es-fg').value;
    if (fields.has('bg0') && this._bg0On) s.bg0 = P('.es-bg0').value;
    if (fields.has('bg1') && this._bg1On) s.bg1 = P('.es-bg1').value;
    // Button-Texte an/aus (@dpa 20260719_030544) + blink (@dpa 20260722_152438, dritter Zustand).
    if (fields.has('textOn')) { const v = P('.es-texton').value.trim(); if (v) s.textOn = v; }
    if (fields.has('textOff')) { const v = P('.es-textoff').value.trim(); if (v) s.textOff = v; }
    if (fields.has('textBlink')) { const v = P('.es-textblink').value.trim(); if (v) s.textBlink = v; }
    // Options-Umbenennungen: Array index-gleich zu den Control-Optionen. Nur speichern, wenn
    // mind. eine gesetzt ist (leerer Eintrag = Standard-Name dieser Option).
    if (fields.has('optLabels') && this._optInputs && this._optInputs.length) {
        const arr = this._optInputs.map((i) => i.value.trim());
        if (arr.some((v) => v !== '')) s.optLabels = arr;
    }
    // Wechsel-Button-Tabelle (@dpa 20260722_194404): die ganze Stufen-Liste (Reihenfolge,
    // Caption/Farbe/Beschreibung) ist der Style — anders als optLabels (nur Umbenennen) kann
    // sie sich in Länge UND Ordnung vom Code-Default unterscheiden.
    if (fields.has('wechselTable') && this._wechselModes) s.modes = this._wechselModes.map((m) => ({ ...m }));
    if (fields.has('size')) { const v = parseInt(P('.es-size').value); if (v) s.size = v; }
    if (fields.has('fontSize')) { const v = parseInt(P('.es-fontsize').value); if (v) s.fontSize = v; }
    if (fields.has('boxSize')) { const v = parseInt(P('.es-boxsize').value); if (v) s.boxSize = v; }
    if (fields.has('boxH')) { const v = parseInt(P('.es-boxh').value); if (v) s.boxH = v; }
    if (fields.has('horiz') && this._horiz) s.horiz = true;
    // Abstand 0 ist eine gültige Ansage („Tasten auf Stoß") – deshalb hier NICHT auf
    // Wahrheit prüfen wie oben, sonst fiele genau die 0 durchs Raster. Obergrenze großzügig
    // (Beat-Anzeige darf mehr Abstand als Tasten) – die UI-Grenze bremst pro Typ.
    if (fields.has('gap')) { const v = parseInt(P('.es-gap').value); if (Number.isFinite(v)) s.gap = Math.max(0, Math.min(999, v)); }
    // Takt-Anzeige: Farben nur mit Flag; Größe/Radius/Padding als Zahl (Radius 0 = eckig gültig).
    if (fields.has('mainColor') && this._mainOn) s.mainColor = P('.es-maincolor').value;
    if (fields.has('subColor') && this._subOn) s.subColor = P('.es-subcolor').value;
    if (fields.has('beatSize')) { const v = parseInt(P('.es-beatsize').value); if (v) s.beatSize = v; }
    if (fields.has('radius')) { const v = parseFloat(P('.es-radius').value); if (Number.isFinite(v)) s.radius = Math.max(0, Math.min(1, v)); }
    if (fields.has('pad')) { const v = parseInt(P('.es-pad').value); if (Number.isFinite(v)) s.pad = Math.max(0, v); }
    // Akkord-Speicher (@dpa 20260722_004312): Maße als Zahl (geklemmt), VG1/2/3-Farben nur mit Flag.
    if (fields.has('memCols')) { const v = parseInt(P('.es-memcols').value); if (v) s.memCols = Math.max(1, Math.min(12, v)); }
    if (fields.has('memRows')) { const v = parseInt(P('.es-memrows').value); if (v) s.memRows = Math.max(1, Math.min(12, v)); }
    if (fields.has('slotSize')) { const v = parseInt(P('.es-slotsize').value); if (v) s.slotSize = Math.max(12, Math.min(80, v)); }
    if (fields.has('vg1') && this._vg1On) s.vg1 = P('.es-vg1').value;
    if (fields.has('vg2') && this._vg2On) s.vg2 = P('.es-vg2').value;
    if (fields.has('vg3') && this._vg3On) s.vg3 = P('.es-vg3').value;
    // Data-Sektion (Punkt 1, ddw.md): seqOff ist wie labelOn eine definitive Checkbox (immer
    // geschrieben). seqMin/Max/Step bleiben leer = KEIN Override → StepSeqGrid fällt auf die
    // Default-Werte des gewählten Ziels zurück (Number.isFinite statt Wahrheits-Check, sonst
    // fiele ein legitimer 0-Override durchs Raster wie bei 'pad'/'radius').
    if (fields.has('seqOff')) s.seqOff = P('.es-seqoff').checked;
    if (fields.has('seqMin')) { const v = parseFloat(P('.es-seqmin').value); if (Number.isFinite(v)) s.seqMin = v; }
    if (fields.has('seqMax')) { const v = parseFloat(P('.es-seqmax').value); if (Number.isFinite(v)) s.seqMax = v; }
    if (fields.has('seqStep')) { const v = parseFloat(P('.es-seqstep').value); if (Number.isFinite(v)) s.seqStep = Math.max(0, v); }
    // Scope-Genauigkeit (ddw.md 20260727): disabled-Select (Quelle ohne AudioNode) schreibt
    // NICHT 'sample' fest — sonst würde ein Toggle-Wert persistiert, der bei DIESER Quelle
    // ohnehin nie greift (SignalScope._effectiveAccuracy() würde ihn zwar auch ignorieren,
    // aber „frame ausgegraut anzeigen, sample speichern" wäre trotzdem irreführend).
    if (fields.has('accuracy')) { const el = P('.es-accuracy'); if (!el.disabled) s.accuracy = el.value; }
    return s;
  }

  _apply() {
    if (!this._target) return;
    const style = this._collect();
    this._target.applyStyle(style);
    this._panel.querySelector('.kme-title').textContent = style.label || this._target.defLabel || 'Element';
    if (this.onApply) this.onApply(this._target.id, style);
  }

  /* ── Design-Presets (Optik-Ebene, geteiltes Aussehen je Control-Sorte, @dpa 20260722_013727) ── */

  _designPresets() {
    if (!this._state || !this._target) return [];
    return (this._state.get('designPresets') || {})[this._target.type] || [];
  }

  /** Aktuelles Aussehen OHNE Text-Felder (Label/Button-Texte/Options-Namen) – ein Design
   *  darf ein fremdes Label nie über einen Control stülpen, s. Kopf-Kommentar. */
  _currentDesignStyle() {
    const full = this._collect();
    const out = {};
    for (const k in full) if (!DESIGN_TEXT_FIELDS.has(k)) out[k] = full[k];
    return out;
  }

  /** Ein Design auf den offenen Control anwenden: mit dem gespeicherten Stand mergen (Text-
   *  Felder bleiben unberührt, ein Design enthält nie welche), persistieren, Panel aus dem
   *  neuen Stand neu aufbauen – spart eine zweite Feld-für-Feld-Schreibroutine, weil open()
   *  das schon aus ctrlStyles kann. */
  _applyDesign(designStyle) {
    if (!this._target || !this._state) return;
    const cur = (this._state.get('ctrlStyles') || {})[this._target.id] || {};
    const merged = { ...cur, ...designStyle };
    this._target.applyStyle(merged);
    if (this.onApply) this.onApply(this._target.id, merged);
    this.open(this._target);
  }

  _saveDesignPreset() {
    if (!this._state || !this._target) return;
    const style = this._currentDesignStyle();
    const name = prompt('Design-Name?', '');
    if (name === null || !name.trim()) return;
    const nm = name.trim();
    const type = this._target.type;
    const list = this._designPresets().slice();
    const at = list.findIndex((p) => p.name === nm);
    if (at >= 0) list[at] = { name: nm, style }; else list.push({ name: nm, style });
    this._state.set('designPresets', { ...(this._state.get('designPresets') || {}), [type]: list });
    this._designSel[type] = nm;
    this._designMenu.refresh();
  }

  /* ── Hilfe-Text (eigene Kategorie: state.hintText) ── */

  /** Feld füllen: eigener Text, sonst der Auslieferungstext als Ausgangspunkt. */
  _loadHelp(id) {
    const own = (this._state && (this._state.get('hintText') || {})[id]);
    const help = this._panel.querySelector('.es-help');
    help.value = own != null ? own : factoryHint(id, lang());
    // Ist es (noch) der Auslieferungstext, sagt das der Platzhalter – sonst weiß man nicht,
    // ob man gerade sein eigenes liest oder das mitgelieferte.
    help.placeholder = factoryHint(id, lang()) || 'keine Hilfe hinterlegt';
  }

  /** Leeres Feld = Override LÖSCHEN → wieder der Auslieferungstext (der ✕-Knopf ist weg,
   *  @dpa 20260719_120425: „ohne 'x' daneben"; Leeren ist jetzt der Weg zurück — so bekommt
   *  der Text spätere Verbesserungen und die Übersetzung weiterhin mit). */
  _applyHelp() {
    if (!this._target || !this._state) return;
    const txt = this._panel.querySelector('.es-help').value;
    const all = { ...this._state.get('hintText') };
    if (txt) all[this._target.id] = txt; else delete all[this._target.id];
    this._state.set('hintText', all);
  }
}
