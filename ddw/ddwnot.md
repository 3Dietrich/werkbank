ADSR:
Die Settings sind zwar alle da, aber funktionieren teils noch nicht teils will ich die Struktur klären:
    Logik und Funktion: Gate Länge
        diesbezüglich vorhanden:
            `Control`s
                `knob` Len (beat länge?)
                `knob` GateLen (zeit lange?)
                `Button` (Gate/Trigger in)
            `Setting`s
                Modus[Gate,Trig]
                Len-Einheit
            `Ziel` bzw 'Moduleingang' von z.B. Seq (btw: funktioniert noch nicht)

        es braucht noch:
            Control `Button` 'Len: fest oder offen' (zwischen Control-ierter Len und "live" GateOff- gate ende)
        
        Der Controls Len und GateLen sollen nur erscheinen, wenn der 'Len..offen?'=fest ist. Dann werden die Gates mit der Zeit geschlossen, die man auf dem Panel angeben muss. 
        Es gibt aber zwei Controls für die Zeitlänge: 'beat' und 'time'. Von denen soll auch nur der Aktive (der wohl schon beide vorhandenen) erscheinen.. verstanden die Logik? das Panel frei räumen von inaktiven Elementen. 

-- 
Entweder kriegt die Env noch einen extra "Nullpunktversatz", oder Pitch reagiert mit *(1+Modulation)

"Nullpunktversatz":
    diei Env dreht sich immer um den Nullpunkt, um *ihren* Nullpunkt. Wenn jetzt ein Ziel aber um 1 herum arbeitet, zum Bsp. bei Frequenzen, dann braucht man einen Env-Nullpunkt von 1. Verstehste?

Bug:
    'Fest' schaltet noch nicht die Regler um (GateLen/*beatLen). es ist nur GateLen zu sehen

die Positionen der aller verschiebbarer Fenster sollen ihre Position merken wenn sie geschlossen werden. 

-- 
Bug: (der ist noch! das ist kein übrigbleibsel!!)
    'Fest' schaltet noch nicht die Regler um (GateLen/*beatLen). es ist nur GateLen zu sehen
    /Users/dpa/Downloads/Bildschirmfoto 2026-07-27 um 09.55.45.png
Bug2: lt. deinem Aktueller Stand ist das "+1" für Pitch ist fest in engine.js verdrahtet. Das past nicht, denn wenn man die Env zu ende laufen lässt landet man wieder bei 0! ABER:  dieser buggy Bereich kann wieder rückgängig gemacht werden, denn ich entscheide mich für 
Deine Empfehlung: Nullpunktversatz als eigenen Knob bauen (Default 0) aber!: --> als `Setting` (was man später vielleicht auf das Panel schalten kann.. siehe todos).

--
sauber! , jetzt kann ich die anderen feinheiten finden..
schau mal hier
/Users/dpa/Downloads/werkbank-config-20260727084922.json
das Release ist sehr kurz und das ende kommt oft **nicht** bei seinem Ziel (PostQuantMod) an. es blebt irgendwo dazwischen hängen..

Desweiteren habe ich ja den Seq 6 auf die erste ADSR geschaltet. Diese Sequenz sendet [1.5,0,1,0], bei ADSR scheint nur 1,0,1,0 anzukommen? jedenfals ist jeder Ausschlag gleich. es soll aber alles durchkommen:
envout = (EnvForm * (SeqOut >0) * Peak ) +Nullpunktversatz

Die ![Darstellung](image.png) scheint mir hin und wieder auch etwwas ungenau: hier sieht man eine sehr kurze Env. sie zeigt bei jedem trigger anders, meist vergleichsweise lange Attaks, das Dec auch, ist kaum von lin zu unterscheiden..
und neben her wäre ein sync button, der bei den beat schlägen eine schwache senkrechte linie anzeigt und auch auf diese synchronisiert werden kann (extra Panel button: 'sync' und ein freeze button, der, wenn an, die aktuelle Ansicht des scopes einfriert und via moouse over alle werte auslesen kann..

im osm 'Rec' könnte man noch mit debug möglichkeit erweitern: aus teslacoil in werkbank rüber kopieren, und im bisherigen Rec ISM die Gruppe 'Aufname' (erstmal) raus und mit Debug ersetzen (aber selbstverstandlich mit den Werkbank elementen controls, gruppen, ism.. das ist hoffentlich klar?)

--
also die trigger kommen bei A≈0, D=0.01, nur ca. 7von 10 triggern durch, bei D=0.008 noch viel weniger. Das ist für die Env zu ungenau!

zum Scope: frame vs. samplegenau
ok, dann soll es beide versionen geben. In den Scopes Settings ein toggle 'Genauigkeit' [frame, sample] umschalten, mit einem "!" Icon hinweis bei Sample wenn es (viel)mehr CPU kostet. Die framebasierte Ansicht blebit default.
grill-me für offene Fragen

Bug
Der > Button triggert (plötzlich?) bei "release" ?? man drückt ihn - nichts passiert, man released ihn - trigger.. [in diesem config](../../../Downloads/werkbank-config-20260727094003.json)

-- 
"Offene Punkte, die dabei aufgefallen sind (nicht angefasst, da außerhalb des Auftrags):
test/adsrLenFest_smoke.py schlägt bereits vor diesen Änderungen fehl (vorbestehend).
signalScope_smoke.py und phase2_routing_smoke.py haben vorbestehende, unabhängige Fails."

tja.. da musst Du nochmal ran.. oder was meinst Du? wozu hast Du angehalten?

desweiteren:
ADR sind immer linear
die Kurven lin bei skew >1 (z.B. =2) sollen übrigens wie die Rampe [1 - 0]² verlaufen. bei kleiner (z.B.=0.5) wie ramp[0,1]^1/2. 
Bei log sieht es so aus, als würde es sehr steil auf die 0 zulaufen.. es ist mir klar dass bei sehr kleinen Werten auf 0 abgerundet werden muss wegen bitungenauigkeiten - das ist klar und erst bei sehr kleinen Werten 'korrekt'. Aber.. das sieht gerade nicht danach aus.. ?
Frage: machen skew bei 'log' Sinn? Wenn nicht, dann sollen sie nicht erscheinen wenn entsprechende Abschnitte auf log gestellt sind.

"ADR sind immer linear" war ungenau, sorry. Ich meinte: ADR waren auch auf log immer linear geblieben. So klarer?
Das ist noch immer so! trotz Deiner genauen beschreibung was log macht - release auf log ist noch immer gleich der lin; geradlinig herunter. linear.. wtf??

-- 20260727_135331
besser!
    bug: 
        - Peak ist noch gelimmittet, was mich befürchten lässt, dass alles mögliche noch derart gelimmitet ist ("zur sicherheit lieber auf default max wert limiten") **DAS IST FALSCH!!! Und soll so nicht mehr verbaut werden!!!!** es soll stattdessen ein möglicher (Minimal- oder) MAXIMALWERT gesetzt werden! Das ist wichtig, weil der User die Limits nicht sieht (Bsp. Peak), aber die controls beliebig ändern können soll!!. bei peak soll etwa 1000000 (vorsichtig) oder +NaN (quasi alles was möglich ist) oder ähnlich gesetzt werden! ÜBERALL! Ich werde mich schon (wahrscheinllich nicht) melden wenn es irgendwo dieser Limit zu hoch ist! Ich will aber nicht für jeden scheiß control durchprobieren ob Du wieder so ein enges Limit eingebaut hast..
        - seq > ADSR-Gate übernimmt noch nicht die Werte der seq!

settings: 
    bisher: Enter = übernehmen, ESC = verlassen.
        das soll so bleiben ABER alle Einstellungs veränderungen sollen **direkt übernommen** werden, ohne enter drücken zu müssen. (Enter nur noch für den User zur gewohnten Sicherheit)
    die Edit Felder mit zahlen oder Text sollen bei iihrer Sellektion selektiert werden. also nicht so: ![alt text](image-2.png), sondern so: ![alt text](image-3.png). Das funktioniert bereits mit Tab taste, aber **noch nicht beim anklicken**.

