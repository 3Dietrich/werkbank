# Werkbank – Kurzanleitung (Start)

## Starten

Im Ordner `KI_html/Werkbank/`:

```bash
python3 -m http.server 8000
```
Dann im Browser öffnen: <http://localhost:8000/>

Oder alles in einem Befehl (Server im Hintergrund + Browser öffnet automatisch):

```bash
cd ~/Music/KI_html/werkbank && python3 -m http.server 8002 & sleep 1 && open http://localhost:8002/
```

Server später beenden: `kill %1` (oder Terminal schließen).
