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
