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

export class ElementSettings {
  // Control-Sorten-Namen (K8, @dpa 20260718). Der `type` ist die ElementSettings-Sicht,
  // nicht der data-ctrl-Präfix: `select` deckt auch die Segment-Sorte mit ab (die sich in
  // GroupHost als type:'select' registriert), `readout`→Text, `keyboard`→UNIKAT (u:-Sorte).
  static SORTE = {
    select: 'Select', toggle: 'Toggle', readout: 'Text', text: 'Text',
    note: 'Note', button: 'Button', keyboard: 'UNIKAT', beatview: 'UNIKAT', opener: 'UNIKAT',
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
          <!-- ON-Hintergrund (@dpa 20260718_203341: „Buttons brauchen zusätzlich eine ON
               Farbe. Also 'BG off', 'BG on' und 'Text'"). Nur beim Button sichtbar; greift,
               solange der Knopf „an" ist (z.B. Start, solange das Metronom läuft). -->
          <div class="kme-row" data-f="bgOn">
            <label>BG an</label>
            <input type="color" class="es-bgon" value="#5ad1ff" title="Hintergrundfarbe im aktiven (ON) Zustand" />
            <button class="es-bgon-clear kme-x" title="ON-Hintergrund entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="fg">
            <label>Text</label>
            <input type="color" class="es-fg" value="#dddddd" title="Vordergrund-/Textfarbe" />
            <button class="es-fg-clear kme-x" title="Vordergrundfarbe entfernen">✕</button>
          </div>
          <div class="kme-row" data-f="size">
            <label>Größe</label>
            <input type="number" class="es-size" min="7" max="28" step="1" title="Schriftgröße im Feld (px)" />
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
    const live = ['.es-label', '.es-labelon', '.es-labelpos', '.es-size', '.es-fontsize', '.es-boxsize', '.es-boxh', '.es-gap', '.es-beatsize', '.es-radius', '.es-pad', '.es-texton', '.es-textoff'];
    live.forEach((sel) => {
      const el = panel.querySelector(sel);
      const ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, () => this._apply());
    });
    panel.querySelector('.es-bg').addEventListener('input', () => { this._bgOn = true; this._apply(); });
    panel.querySelector('.es-fg').addEventListener('input', () => { this._fgOn = true; this._apply(); });
    panel.querySelector('.es-bg-clear').addEventListener('click', () => { this._bgOn = false; this._apply(); });
    panel.querySelector('.es-fg-clear').addEventListener('click', () => { this._fgOn = false; this._apply(); });
    // ON-Hintergrund (Button): eigener „aktiv"-Flag, sonst sammelt _collect die Farbe vor dem Flag.
    panel.querySelector('.es-bgon').addEventListener('input', () => { this._bgOnColor = true; this._apply(); });
    panel.querySelector('.es-bgon-clear').addEventListener('click', () => { this._bgOnColor = false; this._apply(); });
    // Takt-Anzeige-Farben (Haupt/Neben): eigene Flags wie bei bg/fg.
    panel.querySelector('.es-maincolor').addEventListener('input', () => { this._mainOn = true; this._apply(); });
    panel.querySelector('.es-maincolor-clear').addEventListener('click', () => { this._mainOn = false; this._apply(); });
    panel.querySelector('.es-subcolor').addEventListener('input', () => { this._subOn = true; this._apply(); });
    panel.querySelector('.es-subcolor-clear').addEventListener('click', () => { this._subOn = false; this._apply(); });
    // Select/Segment: BG0/BG1 (eigene Flags). Die Options-Umbenennfelder baut open() je
    // Control dynamisch (unten), inkl. eigener Live-Listener.
    panel.querySelector('.es-bg0').addEventListener('input', () => { this._bg0On = true; this._apply(); });
    panel.querySelector('.es-bg0-clear').addEventListener('click', () => { this._bg0On = false; this._apply(); });
    panel.querySelector('.es-bg1').addEventListener('input', () => { this._bg1On = true; this._apply(); });
    panel.querySelector('.es-bg1-clear').addEventListener('click', () => { this._bg1On = false; this._apply(); });
    panel.querySelector('.es-optlabels-help').addEventListener('click', (e) => { e.stopPropagation(); this._toggleContentHelp(); });
    // Hilfe-Text: geht NICHT durch _apply/ctrlStyles – er ist eine eigene Kategorie
    // (state.hintText), damit er sich unabhängig sichern und zurücksetzen lässt.
    panel.querySelector('.es-help').addEventListener('input', () => this._applyHelp());

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      // Enter übernimmt – wie im Regler-Editor. Die Felder wirken zwar ohnehin live, aber
      // die Fußzeile verspricht „Enter = Übernehmen" (@dpa 20260716_174111: „dann haben
      // wir noch Enter"), und ein Versprechen, das nur der andere Editor einlöst, ist eins
      // zu viel.
      else if (e.key === 'Enter') { e.preventDefault(); this._apply(); }
    }, true);
    // Außenklick schließt (nicht bei Klick auf ein Element-Settings-Ziel selbst).
    // Ausnahme: ein offener Farbwähler – der lebt außerhalb des DOM, s. colorPick.js.
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      if (panel.contains(e.target) || e.target.closest('[data-ctrl]')) return;
      if (colorPickerBusy(panel)) return;
      this.close();
    });

    document.body.appendChild(panel);
    upgradeColorInputs(panel);   // eigener kompakter Farbwähler statt des nativen (@dpa 20260719_120425)
    this._panel = panel;
    makeDraggable(panel, panel.querySelector('.kme-header'));
  }

  get isOpen() { return this._panel.style.display !== 'none'; }

  /** Welche Felder sind für welchen Typ sichtbar? */
  _fieldsFor(type) {
    // select (@dpa 20260715, „Menu Switches: fehlt noch Größe + Label On/Off"):
    // 'size' gab es schon, ging aber nur auf die SCHRIFTgröße – gemeint war offenbar die
    // Größe des Schalters selbst. Beides ist jetzt da: 'size' = Schrift, 'boxSize' = Breite.
    // Select/Segment (@dpa 20260719_030544): Label + Label-an; die Options-Namen als Reihe
    // von Umbenennfeldern (optLabels, eins pro Option); Farben BG0/BG1/VG; „Länge tut nichts,
    // kann weg — dafür Schriftgröße + Padding". (Formel + „letzten aus" sind raus/später.)
    if (type === 'select') return ['label', 'labelOn', 'optLabels', 'bg0', 'bg1', 'fg', 'size', 'pad'];
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
    if (type === 'button') return ['label', 'labelPos', 'textOn', 'textOff', 'size', 'fg', 'pad', 'bg', 'bgOn', 'boxSize', 'boxH'];
    // Sonderfenster-Opener (@dpa 20260719_040136: „einem Button ähnlich … dessen settings,
    // ohne Label & L.Pos"): wie der Button, aber ohne Label und Label-Position.
    if (type === 'opener') return ['textOn', 'textOff', 'size', 'fg', 'pad', 'bg', 'bgOn', 'boxSize', 'boxH'];
    // Keyboard (@dpa 20260716_031100: „muss ein (special) control werden: man muss die
    // Größe und Farben ändern können"). Kein Label – seine Tasten sind seine Beschriftung.
    // boxSize/boxH = Breite/Höhe EINER Taste (nicht des ganzen Bretts): so bleibt es bei
    // 12 Tasten gleichmäßig, statt dass eine Gesamtbreite krumme Tasten erzeugt.
    if (type === 'keyboard') return ['bg', 'fg', 'boxSize', 'boxH', 'gap'];
    // Takt-Anzeige (@dpa 20260718_203341): alle Farben (Haupt/Neben/BG), Beat-Größe, Abstände,
    // Radius (0-1), Padding, Breite/Höhe (0=auto).
    if (type === 'beatview') return ['mainColor', 'subColor', 'bg', 'beatSize', 'gap', 'radius', 'pad', 'boxSize', 'boxH'];
    return ['label'];
  }

  /**
   * @param {{id:string, type:'select'|'toggle'|'readout', el:HTMLElement,
   *          defLabel?:string, applyStyle:(style:object)=>void}} target
   */
  open(target) {
    this._target = target;
    const style = (this._state && (this._state.get('ctrlStyles') || {})[target.id]) || {};
    const fieldOrder = this._fieldsFor(target.type);
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

    this._panel.querySelector('.es-label').value = style.label ?? (target.defLabel || '');
    this._panel.querySelector('.es-labelon').checked = style.labelOn !== false;   // default an
    // Label-Position ohne „Mitte" mehr (@dpa 20260719_030544). Default: oben.
    this._panel.querySelector('.es-labelpos').value = style.labelPos || 'top';
    // Button-Texte an/aus (@dpa 20260719_040136): Default BEIDE gleich = Manifest-Label.
    this._panel.querySelector('.es-texton').value = style.textOn ?? (target.defLabel || '');
    this._panel.querySelector('.es-textoff').value = style.textOff ?? (target.defLabel || '');
    this._bgOn = !!style.bg;
    this._panel.querySelector('.es-bg').value = style.bg || '#222222';
    this._bgOnColor = !!style.bgOn;
    this._panel.querySelector('.es-bgon').value = style.bgOn || '#5ad1ff';
    this._fgOn = !!style.fg;
    this._panel.querySelector('.es-fg').value = style.fg || '#dddddd';
    this._panel.querySelector('.es-size').value = style.size || '';
    this._panel.querySelector('.es-fontsize').value = style.fontSize || '';
    this._panel.querySelector('.es-boxsize').value = style.boxSize || '';
    this._panel.querySelector('.es-boxh').value = style.boxH || '';
    this._panel.querySelector('.es-gap').value = style.gap ?? '';
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
    // Options-Umbenennfelder bauen (@dpa 20260719_030544): eins pro Option des Controls,
    // vorbefüllt mit dem aktuellen Namen (gespeicherter Override, sonst Manifest-Anzeige).
    this._buildOptLabels(target, style);
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

    const rect = target.el.getBoundingClientRect();
    this._panel.style.left = `${rect.right + 10}px`;
    this._panel.style.top = `${rect.top}px`;
    this._panel.style.display = 'block';
    requestAnimationFrame(() => {
      const pr = this._panel.getBoundingClientRect();
      if (pr.right > window.innerWidth) this._panel.style.left = `${rect.left - pr.width - 10}px`;
      if (pr.bottom > window.innerHeight) this._panel.style.top = `${window.innerHeight - pr.height - 10}px`;
    });
  }

  close() { this._panel.style.display = 'none'; this._target = null; this._closeContentHelp(); }

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
    const fields = new Set(this._fieldsFor(t.type));
    const s = {};
    const P = (sel) => this._panel.querySelector(sel);
    if (fields.has('label')) { const v = P('.es-label').value.trim(); if (v) s.label = v; }
    if (fields.has('labelOn')) s.labelOn = P('.es-labelon').checked;
    if (fields.has('labelPos')) s.labelPos = P('.es-labelpos').value;
    if (fields.has('bg') && this._bgOn) s.bg = P('.es-bg').value;
    if (fields.has('bgOn') && this._bgOnColor) s.bgOn = P('.es-bgon').value;
    if (fields.has('fg') && this._fgOn) s.fg = P('.es-fg').value;
    if (fields.has('bg0') && this._bg0On) s.bg0 = P('.es-bg0').value;
    if (fields.has('bg1') && this._bg1On) s.bg1 = P('.es-bg1').value;
    // Button-Texte an/aus (@dpa 20260719_030544).
    if (fields.has('textOn')) { const v = P('.es-texton').value.trim(); if (v) s.textOn = v; }
    if (fields.has('textOff')) { const v = P('.es-textoff').value.trim(); if (v) s.textOff = v; }
    // Options-Umbenennungen: Array index-gleich zu den Control-Optionen. Nur speichern, wenn
    // mind. eine gesetzt ist (leerer Eintrag = Standard-Name dieser Option).
    if (fields.has('optLabels') && this._optInputs && this._optInputs.length) {
        const arr = this._optInputs.map((i) => i.value.trim());
        if (arr.some((v) => v !== '')) s.optLabels = arr;
    }
    if (fields.has('size')) { const v = parseInt(P('.es-size').value); if (v) s.size = v; }
    if (fields.has('fontSize')) { const v = parseInt(P('.es-fontsize').value); if (v) s.fontSize = v; }
    if (fields.has('boxSize')) { const v = parseInt(P('.es-boxsize').value); if (v) s.boxSize = v; }
    if (fields.has('boxH')) { const v = parseInt(P('.es-boxh').value); if (v) s.boxH = v; }
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
    return s;
  }

  _apply() {
    if (!this._target) return;
    const style = this._collect();
    this._target.applyStyle(style);
    this._panel.querySelector('.kme-title').textContent = style.label || this._target.defLabel || 'Element';
    if (this.onApply) this.onApply(this._target.id, style);
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
