# Floor by Floor (Prototyp M1–M5)

**Live spielen:** https://sxrg1u.github.io/floor-by-floor/

Satirisches Pixel-Büro-Management-Spiel. Vanilla JavaScript (ES-Module) + HTML5 Canvas, kein Build-Schritt.

## Starten

ES-Module brauchen einen lokalen Server (ein Doppelklick auf `index.html` funktioniert nicht):

```bash
python -m http.server 5173
```

Dann im Browser öffnen: http://localhost:5173

## Steuerung

| Taste / Maus | Aktion |
|---|---|
| `+` / `-` | UI größer / kleiner (S, M, L, wird gespeichert) |
| Mausrad über der Karte | Zoom |
| Ziehen, Pfeiltasten | Karte verschieben (auch mit Rechts- oder Mittelklick ziehen) |
| Space | Pause |
| J / S / B / F | Jobs / Staff / Build / Finance |
| Esc | Werkzeug, Panel oder Auswahl schließen, sonst Pausenmenü |
| Rechtsklick | Bau-Werkzeug abbrechen |

## Enthalten

- **M1:** Pixel-Canvas, das sich an das Fenster anpasst, Kamera mit Zoom, Uhr mit Pause und 1×/2×/4×, Tag/Nacht
- **M2:** Spielerfigur, Auftragsbrett, Arbeit, Geld, Ruf, Energie
- **M3:** Bau-Modus mit Möbeln, Wänden, Türen und Verkaufen; ganze Etage mieten
- **M4:** Bewerber einstellen, Bedürfnis-KI, Pathfinding, Skills mit Level-ups
- **M5:** 12 Traits (teils versteckt als ???), Meinungen zu 8 Themen, Beziehungen (Freunde, Rivalen, Cliquen),
  Smalltalk, Crush & Dating samt Trennungsdrama, Tratsch, Sabotage, Entscheidungs-Popups, Beziehungsnetz-Grafik
- Geführtes Tutorial mit 8 Schritten, Spieler umschaltbar zwischen Work und Manage, Pixel-Sounds, eigener 5×7-Font

Inhalte (Branchen, Möbel, Namen, Traits, Themen) liegen in `data/*.json`.
