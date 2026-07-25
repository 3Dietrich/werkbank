20260717_140556
zunächst geht es um den Master für teslacoil
![teslacoil Start,sync,reset 20260717_13](image.png)
der Start/Stop soll so bleiben, der Sync kommt weg und wird durch die an startstop angebrachten "!" und "!!" ersetzt.
Das war's für teslacoil, es braucht kein tab tempo.
TeslaCoil ist damit dann durch.

Für alles andere: keine der Module dürfen bildschirmfüllend sein!
![schau dir teslacoil](image-1.png) als beispiel an: alles in Gruppen, Header(-Gruppen) und Settings. Alles platzsparend! Platzsparen/d ist mir wichtig! 

**Takt/Metronom**
kann zunächst von teslacoil 20260717 'Metronom' als Gruppe übernommen werden mit folgenden einschränkungen:
- ohne Quant & Bend

**Transport**
    - kleiner, platzsparend
    - als Gruppe(?)
    - Bpm via doppelclick setzbar
    - Settings
      - max. bpm
      - shortcuts: 
        - Start/stop [default: space]
        - Beats/Takt [b, n (n=1 - 9) ?
        - ! und !!
        - anschieben/bremsen [ '[' , ']' ]
    - ist das tempos bei anschieben/bremsen auch 2 BpM schneller, so wie es angezeigt wird? schien mir nicht so..

**Tempo**
alles was bisher unter Tempo ist, wird mal eine Einstellung, wo höchstens noch Tab erscheint (aber klein oder durch Shortcut gar nicht..)
erstmal aber noch:
    - button 'Tab'
    - Settings müssen getrennt werden:
      - die üblichen (farbe, größe..)
      - die technischen:
        - die wie Du sie hast, aber platzsparender als extra Fenster

Bug:
    - ich konnte es so schnell tabben dass es (crashte?) neu lud. es braucht einen maximum oben (400? 900?) mit der Funktion 'auf die höchste n*Hälfte gesetzt', mit genau diesem Hinweis.
    wenn man beispielsweise in 2216 bpm clickt kommt (bei max 400) "277 BpM (*8)" heraus.
    
Das ganze muss irgendwie mit der werkbank zusammenlaufen.. wie ein Netzteil an einer Werkbank. Wobei das Netzteil auch auf der Werkbank bearbeitet werden kann.. 

-- 
20260717_151145
Tempo:
    - Farbe: VG und BG, beides wie 
fürs tappen braucht es auch ein spontanes reset, was das vorherige Tempo ignoeriert und 'von vorne' anfängt. Dabei ist zu beachten dass wieder erst der 2.tab die Veränderung "durchwinkt".. verstehste? z.B. [irgendein Tempo läuft], man resetet [läuft unverändert weiter], man tab't einmal [läuft unverändert weiter], zweiter tab [neues tempo (bei mode 2: auch reset - wie üblich)]
-- 
"
**Noch offen:** kein Speicher (nichts überlebt einen Reload) — wo der Taktgeber am Ende hängt, ist offen, und dort liegt dann auch sein Speicher.
"
ok, wenn es am fehldenden "Elternsystem" liegt, aber die Grundlagen modular vorliegen, um in "Eltern" (wie teslacoil, oder u.U. Werkbank) vollständig zu recallen ist alles in Ordnung.

Transport Settings:
    - "Technik" kann mit einem einfachen sanften Strich ausgetauscht werden
    - max. BPM, Anschieben, Anlauf: ohne fader, aber draggable
    - jedes Einzelteil mit hint
    - shortcuts
        - bugs:
            -  für ein '!' muss ich shift+1 drücken. erscheint
               - ist: "shift"
               - soll: entweder "!" oder "shift+1"
            - '1' kommt nicht durch
            - aber "meta" - völlig sinnlos :)
        - ein kleines 'x' für löschen (auf 'nichts', also kein shortcut)
    - Midi Learn:
        - für alls Controls
        - damit die Liste nicht lang wird, vielleicht ein Icon an neben die Shortcut, die dann das Midilearn für dieses Control über dem Settingsfenster aufruft (direkt aktiver learn mode)?
        - der **Kanal/Ch** soll beim learn gesetzt werden, man kann ihn später dann versetzten. Nicht als Select sondern als simples 0 - 16 draggable value (wie 'Knob ohne Knob' :) 

Transport in **teslacoil** (Start/Stop/!/!!)
    - bitte updaten
    - es soll nicht der Gruppen Rahmen mit "Transport" hin, sondern optisch so bleiben wie es ist, aber die settings über rechte Mouse auf [Start, !, !!] erreichbar sein.
    - Ansicht bereich weg
    - der Rest s.o.

-- 
20260717_180719
getestet in Taktgeber:
nee..: shift + s (also S) kommt gerade als s an und es funktionieren beide (s und S).
und achte bei 'leer' auf die Zeilenhöhe die bleiben soll

Das Untermenu (s.B.) funktioniert nicht richtig, ist auch überflüssig - kann weg.

auf werkbank ist noch nicht.. ok, kein Problem
-- 
wenn in Shortcuts zwei mal das selbe angegeben wird soll ein kleines rotes Ausrufezeichen erscheinen wo das Mouse over direkt steht, welche (Gruppe,) Control das/die andere/n mit dem selben shortcut sind. Die Ausführung (alles auf einnmal, nur eins?) kann dann unklar bleiben.
Ginge auch ctl, alt/option, oder cmd? 

bei Midilearn.. 
    - ist das "Learnfenster" (LF) in der Bildschirmmitte. Es könnte näher an das Setting..?
    - die Midi Icons erscheinen (bei nicht gelernten) nur bei MouseOver. ok!
    - die Midi Icons müssten anzeigen ('selektiert'? oder besonderer Icon BG?) welches gerade ge-learned wird!
    - LF/löschen: schließt sich selbst und die Settings (beides nicht ok)
    - wenn löschen nicht schließt (will ich), brauchen wir das 'neu' nicht mehr :)