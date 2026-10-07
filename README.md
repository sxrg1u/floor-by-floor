# Floor by Floor (M1–M9)

**Live spielen:** https://sxrg1u.github.io/floor-by-floor/

Satirisches Pixel-Büro-Management-Spiel. Vanilla JavaScript (ES-Module) + HTML5 Canvas, kein Build-Schritt.

## Starten

ES-Module brauchen einen lokalen Server (ein Doppelklick auf `index.html` funktioniert nicht):

```bash
python -m http.server 5173
```

Dann im Browser öffnen: http://localhost:5173

## So spielt es sich

Du bist der Chef und arbeitest nie selbst. Ohne deine Anweisungen passiert nichts:

1. Die erste Etage ist gemietet, aber leer: Schreibtische, Küche und Toilette baust du selbst.
2. Bewerber stellst du per Gehaltsangebot ein. Bietest du weniger, sagen sie vielleicht nein.
3. Du bildest Teams und gibst jedem Job ein Team.
4. Jobs bestehen aus Teilen je Skill, und du setzt die Leute auf die Teile. Ist ein Teil fertig, brauchen sie eine neue Aufgabe.
5. Pausen und Feierabend steuerst du über Hausregeln oder per Hand. Wer zu lange unter Stress arbeitet, fällt mit Burnout aus.
6. Gehaltserhöhungen und Beförderungen vergibst du selbst. Wer unterbezahlt ist oder übergangen wird, kündigt.

## Steuerung

| Taste / Maus | Aktion |
|---|---|
| J S T B M P F G | Fenster: Jobs, Staff, Teams, Build, Meetings, Rules, Money, Goals |
| 1 – 7 | Etage wechseln |
| `+` / `-` | UI größer / kleiner |
| Mausrad über der Karte | Zoom |
| Ziehen, Pfeiltasten | Karte verschieben |
| Space | Pause |
| Esc | Werkzeug, Auswahl oder oberstes Fenster schließen, sonst Pausenmenü |

Mehrere Fenster können gleichzeitig offen sein. Verschoben werden sie an der Titelleiste.

## Enthalten

- **M1–M4:** Pixel-Canvas, Kamera, Zeit, Tag/Nacht, Bau-Modus, Bedürfnis-KI, Pathfinding, Skills
- **M5:** Traits (teils versteckt), Meinungen, Beziehungen, Cliquen, Crush & Dating, Tratsch, Beziehungsnetz
- **M6:** Meetings am Meeting-Tisch mit Persuade, Promise, Snacks und Pull Rank; Delegieren an Leads mit Veto
- **M7:** Bis zu 6 Etagen plus Penthouse, Aufzug zwischen den Etagen, Kredite, Ruf
- **M8:** Satirische Events, 10 Meilensteine mit Freischaltungen, Firmenregeln, Karriere, Loyalität, Kündigungen, Burnout
- **M9:** Hauptmenü mit Continue und Load, Autosave jeden Morgen, 3 Speicherslots, Chiptune-Musik, Einstellungen

Inhalte liegen in `data/*.json`. Sprites, Sounds, Musik und Font werden im Code erzeugt.
