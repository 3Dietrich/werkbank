bitte nimm die Amp-Env als Beispiel, ändere diese Quelle (so dass man keinen Unterschied bei dieser sieht und hört) und verändere die Details (als späteres effektives Haupt-"ADSR Modul"):
ein multi-ADSR mit diversen Untereinstellungen (Settings)
Was sie macht ist klar? (SR/CR-) Clockbasierte Envelopes i.d.R. positiv
vervielfältigbar
    Damit meine ich die Funktion wie in der Vervielfältigbarkeit der  Sequencer/Sequenzer, blos für Envs.

Die sonder `Gruppe` ADSR in PolySynth
    `Settings`
        A,D,S,R,inv aktiv: on/off;  //jew.
        A,D,R: lin/log;         //jew.,
            lin: mit skew       // log ist doch eigentlich auch controllierbar in der Seilheit? wenn, dann skew in beiden!
        Verlauf: on/off
        Trig/Gate Umschalter    
            len: ms/Beats (0=1Sample)       //nur bei Trig
        Farben: (wie Gruppen)
        Größe: % aller.. (wie Gruppen)
        Combo und Snapshot Speicher (wie Gruppen)
        Output Part (Ziel bestimmung und dessen geforderten Einstellungen, veränderbar)
            Output sichtbar: onoff;
            Output:             // bei sichtbar=off wird entweder auf ein Ziel festgesetzt, oder es wird hier eingestellt
    `Panel`
        `knob`s:
            A,D,S,R  //erscheinen bei settings activ=on
            'peak' für maximum (p*a) [0.01 - 1]
            GateLen
        `Output` Control: für destination
    Funktionsdetails:
        verlauf off: 
            jeder trigger löst die Env von vorne aus mit kurzem "spezial outin Fade" (evtl schon mal erwähnt? (~/brain?) wenn nicht, erkläre ich es gern nocheinmal um es dann vor allem hier unter Music und in der Werkbank im speziellen bei Gelegeheiten nutzen  zu können..)
        verlauf on: 
            der Wert des letzten Wertes wird übernommen und darauf Att angesetzt.
        wenn von A,D,S,R 
            **keins davon aktiv** ist, 
                kommt ein hartes **1 Sample** bei trigger (auch bei Gate, ohne 'GateOff') im vollen Wert, dann wieder 0 - vorbei.
            wenn nur A an ist ist, 
                kommt nach dem Att in einer lin down (0.5ms) zur 0 und vorbei
            ADS (ohne R):
                fadet in 0.5ms linear auf 0
            ADR bei Trig
                D ist überflüssig, es geht nach A direkt auf R
        alles andere dürfte sich aus dem logischen Schluss und aus meinen Beschreibungen ergeben?
