# Floor by Floor (Prototyp M1–M4)

**Live spielen:** https://sxrg1u.github.io/floor-by-floor/

Satirisches Pixel-Büro-Management-Spiel. Vanilla JavaScript (ES-Module) + HTML5 Canvas, kein Build-Schritt.

## Starten

ES-Module brauchen einen lokalen Server (ein Doppelklick auf `index.html` funktioniert nicht):

```bash
python -m http.server 5173
```

Dann im Browser öffnen: http://localhost:5173

## Steuerung

| Taste | Aktion |
|---|---|
| Space | Pause |
| J / S / B / F | Jobs / Staff / Build / Finance |
| Esc | Werkzeug, Panel oder Auswahl schließen, sonst Pausenmenü |
| Rechtsklick | Bau-Werkzeug abbrechen |
| Mausrad | In Panels scrollen |

## Enthalten

- **M1:** 640×360-Pixel-Canvas, Tile-Map, Uhr mit Pause und 1×/2×/4×, Tag/Nacht (Nächte laufen im Schnelldurchlauf)
- **M2:** Spielerfigur, Auftragsbrett, Arbeit, Geld, Ruf, Energie
- **M3:** Bau-Modus mit Möbeln, Wänden, Türen und Verkaufen; ganze Etage mieten
- **M4:** Bewerber einstellen, Bedürfnis-KI, Pathfinding, Skills mit Level-ups
- Spieler umschaltbar zwischen Work und Manage, Pixel-Sounds per WebAudio, eigener 5×7-Pixel-Font

Inhalte (Branchen, Möbel, Namen) liegen in `data/*.json`.
