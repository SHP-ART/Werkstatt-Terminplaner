# Bedienungsanleitung – Werkstatt Terminplaner

**Version 1.6.2 · © Sven Hube**

---

## Inhaltsverzeichnis

1. [Übersicht & Start](#1-übersicht--start)
2. [Dashboard](#2-dashboard)
3. [Heute-Ansicht](#3-heute-ansicht)
4. [Termine](#4-termine)
5. [Kalender](#5-kalender)
6. [Kundenverwaltung](#6-kundenverwaltung)
7. [Teile-Bestellen](#7-teile-bestellen)
8. [Ersatzautos](#8-ersatzautos)
9. [Zeitverwaltung](#9-zeitverwaltung)
10. [Auslastung](#10-auslastung)
11. [Planung (Beta)](#11-planung-beta)
12. [Intern](#12-intern)
13. [Papierkorb](#13-papierkorb)
14. [Einstellungen](#14-einstellungen)
15. [Globale Suche](#15-globale-suche)
16. [Tastenkürzel](#16-tastenkürzel)
17. [KI-Funktionen](#17-ki-funktionen)
18. [Backup & Datensicherung](#18-backup--datensicherung)

---

## 1. Übersicht & Start

### Systemstart

**macOS / Linux:**
```bash
./start.sh
```

**Windows:**
```
start.bat
```

Die App öffnet automatisch im Browser unter `http://localhost:3001`. Der Backend-Server läuft auf Port 3001.

### Erste Schritte

1. Browser öffnen → `http://localhost:3001`
2. Unter **⚙️ Einstellungen → Verbindung** die Server-IP prüfen (Standard: `localhost:3001`)
3. Unter **⚙️ Einstellungen → Schicht-Vorlagen** die tägliche Arbeitszeit hinterlegen

### Navigation

Alle Bereiche sind über die **Tabs** in der oberen Leiste erreichbar:

| Tab | Funktion |
|-----|---------|
| 📊 Dashboard | Tagesübersicht & KPIs |
| 📅 Heute | Heutige Termine mit Status-Verwaltung |
| 🗓️ Termine | Neue Termine anlegen & bearbeiten |
| 📆 Kalender | Monatskalender mit Terminübersicht |
| 👥 Kunden | Kundenverwaltung & Fahrzeughistorie |
| 🛒 Teile-Bestellen | Ersatzteil-Bestellungen verwalten |
| 🚗 Ersatzautos | Leihfahrzeuge verwalten |
| ⏱️ Zeitverwaltung | Mitarbeiterzeiten & Schichten |
| 📈 Auslastung | Kapazitäts- & Auslastungsanalyse |
| 🏗️ Planung (Beta) | Drag & Drop Tagesplanung |
| 👷 Intern | Interne Termine & Aufgaben |
| 🗑️ Papierkorb | Gelöschte Elemente wiederherstellen |
| ⚙️ Einstellungen | Server, Backup, KI & mehr |

---

## 2. Dashboard

Das Dashboard erscheint beim Start und gibt eine schnelle Übersicht über den aktuellen Tag.

### Kennzahlen-Karten (oben)

- **Termine Heute** – Anzahl der heutigen Termine
- **Auslastung Heute** – Prozentsatz der genutzten Kapazität
- **Kunden & Fahrzeuge** – Gesamtanzahl in der Datenbank
- **Diese Woche** – Termine der laufenden Woche

### KPI-Bereich (Werkstatt-KPIs)

Zeigt monatliche Kennzahlen:
- Auslastungsquote
- Einnahmen (Stunden)
- Durchschnittliche Bearbeitungszeit
- Kundenzufriedenheit-Indikatoren

Mit **🔄 Aktualisieren** werden die KPIs neu geladen.

### Wochenübersicht

Zeigt alle Wochentage (Mo–Sa) mit Termin-Anzahl und Auslastungsbalken. Ein Klick auf einen Tag öffnet die Detailansicht.

### Monatsübersicht

Kalenderraster des aktuellen Monats (5 Wochen). Farbige Markierungen zeigen Auslastung je Tag:
- 🟢 Grün = geringe Auslastung
- 🟡 Gelb = mittlere Auslastung
- 🔴 Rot = hohe Auslastung / ausgebucht

### Ersatzauto-Rückgaben

Erscheint automatisch, wenn heute ein Leihfahrzeug zurückerwartet wird.

---

## 3. Heute-Ansicht

Zeigt alle Termine des **heutigen Tages** mit Echtzeit-Statusverwaltung.

### Info-Karten

- **Aktuelle Uhrzeit** – live aktualisiert
- **Auslastung Heute** – belegte vs. verfügbare Stunden
- **Nächster Kunde** – Uhrzeit und Name des nächsten Termins

### Ansichtswechsel

| Button | Ansicht |
|--------|---------|
| 📊 Tabellenansicht | Kompakte Tabellenansicht |
| 🃏 Kartenansicht | Große Kacheln pro Termin |
| 🖨️ Drucken | Tagesübersicht druckfertig öffnen |

### Überlauf-Banner

Erscheint automatisch gelb/rot, wenn die Tageskapazität überschritten ist.  
→ Klick auf **"Termine umplanen →"** zeigt verschiebbare Termine.

### Batch-Aktionen (Mehrfachauswahl)

1. Checkbox links neben einem Termin aktivieren  
   *(oder ganz oben links alle auswählen)*
2. Die **Aktionsleiste** erscheint automatisch
3. Aktion wählen:
   - **▶ In Arbeit** – Status auf "In Arbeit" setzen
   - **✓ Fertig** – Status auf "Abgeschlossen" setzen
   - **✕ Absagen** – Status auf "Abgesagt" setzen
   - **✗ Aufheben** – Auswahl aufheben

### Quick-Action-Buttons (pro Zeile)

Direkt in der Tabellenzeile:
- **▶ In Arbeit** – Schnellzugriff auf Statuswechsel
- **✓ Fertig** – Termin als abgeschlossen markieren

### Status-Verwaltung (einzelner Termin)

Über den **Aktionen**-Button in jeder Zeile:
- Status ändern (Offen → In Arbeit → Abgeschlossen)
- Notiz hinzufügen
- Termin bearbeiten
- Termin löschen

### Statusfarben

| Farbe | Status |
|-------|--------|
| 🔵 Blau | Offen / Geplant |
| 🟡 Gelb | In Arbeit |
| 🟢 Grün | Abgeschlossen |
| 🔴 Rot | Abgesagt |

### Abgeschlossene Termine

Erscheinen am Ende der Seite in einem separaten Bereich (einklappbar).

---

## 4. Termine

Hier werden neue Termine erstellt und bestehende verwaltet.

### 4.1 Neuer Termin (➕)

**Formular ausfüllen:**

1. **Kunde suchen** – Name oder Kennzeichen eingeben → Vorschläge erscheinen automatisch  
   *(Neukunde: auf "Neukunde anlegen" klicken)*
2. **Fahrzeug** – Wird automatisch aus Kundendaten übernommen
3. **Datum** – Im Kalender auswählen oder direkt eingeben
4. **Uhrzeit** – Bringzeit festlegen
5. **Arbeit** – Durchzuführende Arbeiten (KI-Autovervollständigung aktiv)
6. **Geschätzte Zeit** – Dauer in Minuten
7. **Wartet?** – Ja/Nein, ob Kunde wartet
8. **Ersatzauto** – Optionales Leihfahrzeug zuweisen
9. **Notiz** – Interne Bemerkung

**Tipp:** Die KI schlägt basierend auf der Fahrzeughistorie automatisch Arbeiten und Zeiten vor.  
**Smart Defaults:** Wenn ein bekannter Kunde ausgewählt wird, erscheint ein Hinweis mit dem letzten Termin → "Übernehmen" klicken, um die Arbeit zu kopieren.

**Speichern:** Auf **"Termin speichern"** klicken.

### 4.2 Termin bearbeiten (✏️)

1. Datum auswählen oder Termin suchen
2. Termin in der Liste anklicken
3. Felder ändern
4. **"Änderungen speichern"** klicken

### 4.3 Interner Termin (🏠)

Für interne Termine ohne Kundenbezug (Wartung Werkzeug, Betriebsurlaub, Besprechung):

1. Titel eingeben
2. Mitarbeiter auswählen
3. Datum & Uhrzeit
4. Dauer eintragen
5. Speichern

### 4.4 Wartende Aktionen (🕐)

Zeigt Termine, die auf eine Aktion warten, z.B.:
- Teile bestellt, warten auf Lieferung
- Fahrzeug wartet auf Kundenabholung
- Rückruf ausstehend

### 4.5 Wiederkehrende Termine (🔁)

Für regelmäßig wiederkehrende Arbeiten (z.B. jährliche HU/AU, halbjährlicher Ölwechsel):

**Neuen wiederkehrenden Termin anlegen:**
1. Auf **"+ Neuer Wiederkehrender Termin"** klicken
2. Kundendaten eingeben
3. Arbeit & geschätzte Zeit eintragen
4. Rhythmus wählen: Monatlich / Quartalsweise / Halbjährlich / Jährlich
5. Nächstes Erstellungsdatum wählen
6. **Speichern**

Der Scheduler erstellt automatisch täglich fällige Termine als "Schwebend".

**Verwaltung:**
- ✅/❌ Aktiv-Schalter – Eintrag aktivieren/deaktivieren
- 🗑️ Löschen – Dauerhaft entfernen

---

## 5. Kalender

Monatsansicht aller Termine.

- **Navigation:** Pfeile links/rechts für Monatsnavigation
- **Heute:** Button springt zum aktuellen Datum
- **Termin anklicken:** Details und Schnellbearbeitung
- **Tag anklicken:** Alle Termine des Tages in der Seitenleiste

**Farbcodierung:**
- Anzahl der Termine pro Tag wird als Badge angezeigt
- Auslastungsgrad wird als Hintergrundfarbe dargestellt

---

## 6. Kundenverwaltung

### Kunden suchen

1. Im Suchfeld **Name oder Kennzeichen** eingeben
2. **"Suchen"** klicken oder Enter drücken
3. Ergebnisse erscheinen als Karten

### Kundenkarte

Zeigt:
- Name, Telefonnummer, E-Mail
- Alle registrierten Fahrzeuge (Kennzeichen, Marke, Modell)
- Terminhistorie
- Aktionsbuttons: Bearbeiten, Termin anlegen, Löschen

### Neukunden anlegen

Über das Termin-Formular (Tab **Termine → Neuer Termin**):
- Unbekannten Namen eingeben → "Neukunde anlegen" erscheint
- Daten eingeben und speichern

### Kunden importieren (Excel)

Unter **⚙️ Einstellungen → Kundenverwaltung:**
- Excel-Datei (.xlsx) auswählen und importieren
- Spalten werden automatisch zugeordnet

---

## 7. Teile-Bestellen

Verwaltung von Ersatzteil-Bestellungen für Werkstattaufträge.

- Teile einem Termin zuweisen
- Status verfolgen: Bestellt → Geliefert → Eingebaut
- Bestellhistorie einsehen

---

## 8. Ersatzautos

### Übersicht

Die Kacheln oben zeigen alle Fahrzeuge mit aktuellem Status (grün = frei, rot = vergeben).

### Verfügbarkeit umschalten

Direktklick auf eine **Fahrzeug-Kachel** → Verfügbarkeit manuell ändern (z.B. wenn Kunde früher zurückbringt).

### Neues Fahrzeug anlegen

1. Kennzeichen eingeben (Großschreibung automatisch)
2. Fahrzeugname (z.B. "VW Golf")
3. Typ auswählen (Kleinwagen, Kombi, SUV, …)
4. **"➕ Hinzufügen"** klicken

### Buchungsübersicht

Zeigt alle aktiven Buchungen mit Rückgabedatum. Überfällige Rückgaben werden rot markiert.

### Verfügbarkeitskalender

Mehrspaltige Ansicht der nächsten Wochen:
- 🟢 = alle frei
- 🟡 = teilweise vergeben
- 🔴 = alle vergeben

---

## 9. Zeitverwaltung

Verwaltung von Arbeitszeiten und Mitarbeitern.

### Sub-Tabs

| Tab | Inhalt |
|-----|--------|
| Mitarbeiter | Mitarbeiter anlegen & verwalten |
| Arbeitszeiten | Schichten & Zeiten erfassen |
| Abwesenheiten | Urlaub, Krankheit, Berufsschule |
| Schicht-Planung | Wochenplanung der Mitarbeiter |

### Mitarbeiter anlegen

1. **⏱️ Zeitverwaltung → Mitarbeiter**
2. Name eingeben
3. Typ: Mitarbeiter oder Lehrling
4. Wochenstunden hinterlegen
5. Speichern

### Abwesenheiten

Urlaub, Krankheit oder Berufsschulzeiten eintragen:
1. Mitarbeiter auswählen
2. Zeitraum eingeben
3. Art der Abwesenheit wählen
4. Speichern → wird automatisch in der Auslastung berücksichtigt

---

## 10. Auslastung

Analysiert die Werkstattauslastung über verschiedene Zeiträume.

### Tagesansicht

- Zeigt belegte vs. verfügbare Minuten
- Aufgeteilt nach Mitarbeiter
- Balkendiagramm der Auslastung

### Wochenansicht

- Tagesweise Übersicht der lfd. Woche
- Durchschnittliche Auslastung

### Monatsansicht

- Kalenderraster mit Auslastung je Tag
- Exportmöglichkeit

### Auslastungsberechnung

Die Kapazität basiert auf den hinterlegten **Schicht-Vorlagen** (⚙️ Einstellungen) minus Abwesenheiten.

---

## 11. Planung (Beta)

Interaktive **Drag & Drop**-Tagesplanung.

- Offene Termine als Karten auf der linken Seite
- Mitarbeiter-Spalten in der Mitte
- Termin per Drag & Drop einem Mitarbeiter und Zeitslot zuweisen
- Kapazitätswarnung bei Überbuchung
- Nach dem Speichern: automatische Prüfung auf freie Lücken (*Slot-Nachfüllung*)

> **Hinweis:** Diese Funktion befindet sich noch in der Beta-Phase.

---

## 12. Intern

Verwaltung interner Belange ohne Kundenbezug.

- Interne Termine anlegen (z.B. Wartung, Besprechung)
- Mitarbeiter-Tasks zuweisen
- Liste aller internen Vorgänge

---

## 13. Papierkorb

Hier landen gelöschte Termine und Kunden.

- **Wiederherstellen:** Auf den Wiederherstellungs-Button klicken
- **Endgültig löschen:** Auf "Permanent löschen" klicken
- Papierkorb wird automatisch nach 30 Tagen geleert

---

## 14. Einstellungen

### Verbindung (🌐)

Server-IP und Port konfigurieren:
- **localhost:3001** – wenn Browser und Server auf dem gleichen PC laufen
- **IP-Adresse:3001** – wenn auf einem anderen PC im Netzwerk zugegriffen wird

**"Verbindung testen"** prüft, ob der Server erreichbar ist.

### Datensicherung (💾)

- **Backup erstellen** – sofort ein manuelles Backup anlegen
- **Backup-Liste** – alle vorhandenen Backups anzeigen
- **Backup wiederherstellen** – Datei auswählen und hochladen
- Backups liegen im Ordner `backups/` neben der Anwendung

> Empfehlung: Täglich ein Backup erstellen! Automatische Backups können über den Server konfiguriert werden.

### Kundenverwaltung (👥)

- Kunden-Excel importieren (.xlsx)
- Duplikate bereinigen
- Kunden-Daten exportieren

### Schicht-Vorlagen (⚡)

Hinterlegen Sie die **regulären Arbeitszeiten** je Wochentag:
- Startzeit, Endzeit und Pause pro Tag
- Diese Werte bestimmen die Tageskapazität für die Auslastungsberechnung

### KI / API (🤖)

- **Lokale KI** (Standard): Automatisch, keine Konfiguration nötig
- **ChatGPT (OpenAI):** API-Key eintragen für erweiterte KI-Funktionen
  - Arbeitserkennung aus Freitext
  - Zeitschätzungen
  - Wartungsplan-Empfehlungen

API-Key testen mit **"Verbindung testen"**.

### Tablet-Steuerung (📱)

Steuert einen angeschlossenen Tablet-Bildschirm (z.B. Kundenanzeige in der Werkstatt):
- Display ein/aus/auto
- Anzeigemodus konfigurieren

### Server / Info (🖥️)

- Versions-Information
- Datenbankgröße und -pfad
- Server-Logs

### Automatisierung (🤖)

Dashboard für alle automatischen KI-Prozesse:
- Automation-Log einsehen
- Scheduler-Status
- Regeln konfigurieren

---

## 15. Globale Suche

Die **globale Suchleiste** ist immer oben sichtbar (unter dem Header).

**Aktivieren:** Klick in das Suchfeld oder Tastenkürzel **Alt+F**

**Suchen nach:**
- Kundennamen
- Kennzeichen
- Terminen (Datum, Arbeit)

**Ergebnisse** erscheinen als Dropdown direkt darunter. Klick auf ein Ergebnis öffnet den zugehörigen Datensatz direkt.

---

## 16. Tastenkürzel

| Kürzel | Funktion |
|--------|---------|
| `Alt+F` | Globale Suche öffnen |
| `N` | Neuen Termin anlegen (wenn im Termine-Tab) |
| `Escape` | Modaldialog schließen |

---

## 17. KI-Funktionen

Die Software enthält eine **eingebaute lokale KI**, die ohne externe Dienste funktioniert.

### Automatische Zeitschätzung (A3 Puffer-ML)

Basierend auf vergangenen Terminen berechnet die KI automatisch realistische Zeitpuffer für Arbeiten. Die Schätzung verbessert sich mit der Zeit, je mehr Termine in der Datenbank vorhanden sind.

### Nächster freier Slot (A1)

Im Termin-Formular: **"Nächster freier Termin"** zeigt automatisch den nächsten verfügbaren Zeitslot basierend auf der Auslastung.

### KI-Tagesplanung (A6a)

Im Tab **Planung (Beta):** Automatischer Tagesvorschlag mit Kategorie-Gruppierung:
- Gleichartige Arbeiten werden gebündelt
- Mitarbeiter werden nach Qualifikation zugewiesen

### Slot-Nachfüllung (A4)

Nach dem Speichern einer Planung prüft die KI automatisch, ob noch freie Zeiten mit wartenden Terminen gefüllt werden können. Bei passenden Vorschlägen erscheint ein Popup.

### Überlauf-Banner (A6c)

Wenn die Tageskapazität überschritten wird, erscheint automatisch ein Banner mit Umplanungsvorschlägen.

### Duplikat-Erkennung (D3)

Beim Erstellen eines Termins prüft die KI, ob bereits ein ähnlicher Termin für das Fahrzeug existiert und warnt vor möglichen Duplikaten.

### Smart Defaults (C6a)

Nach Kundenauswahl erscheint automatisch der letzte Termin des Kunden als Vorlage. Ein Klick auf **"Übernehmen"** kopiert Arbeit und Zeit.

### Wiederkehrende Termine Scheduler (A6d)

Täglich läuft automatisch ein Hintergrundprozess, der fällige wiederkehrende Termine als "Schwebend" in die Terminliste einfügt.

### KI-Assistent (ChatGPT, optional)

Wenn ein OpenAI API-Key hinterlegt ist (⚙️ Einstellungen → KI / API):
- **🤖 KI-Assistent Button** erscheint im Termin-Formular
- Freitext eingeben: z.B. "Ölwechsel + Inspektion für BMW 320d, kommt um 9 Uhr"
- KI füllt das Formular automatisch aus

---

## 18. Backup & Datensicherung

### Manuelles Backup

1. **⚙️ Einstellungen → Datensicherung**
2. **"Backup erstellen"** klicken
3. Backup wird im Ordner `backups/` gespeichert (Format: `werkstatt_YYYY-MM-DD_HHMMSS.db`)

### Backup wiederherstellen

1. **⚙️ Einstellungen → Datensicherung**
2. **"Backup auswählen"** → .db-Datei auswählen
3. **"Hochladen & laden"** klicken
4. Server startet automatisch mit den wiederhergestellten Daten

### Automatische Backups

Der Server erstellt automatisch tägliche Backups beim Start. Ältere Backups werden nach konfigurierbarer Zeit gelöscht.

### Backup manuell (Terminal)

```bash
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
```

> ⚠️ **Wichtig:** Backups nie in Git committen! Die .db-Datei enthält Kundendaten.

---

## Häufige Fragen (FAQ)

**F: Die App lädt nicht – was tun?**  
A: Prüfen Sie, ob der Backend-Server läuft (`./start.sh`). Port 3001 muss frei sein.

**F: Termine werden nicht gespeichert.**  
A: Datenbankpfad unter ⚙️ Einstellungen → Server / Info prüfen. Schreibrechte auf den `database/`-Ordner sicherstellen.

**F: Die KI schlägt falsche Zeiten vor.**  
A: Die lokale KI verbessert sich mit mehr Daten. Mindestens 20–30 abgeschlossene Termine sind empfohlen.

**F: Wie lege ich einen Mitarbeiter an?**  
A: ⏱️ Zeitverwaltung → Mitarbeiter → Neuen Mitarbeiter hinzufügen.

**F: Wie stelle ich die Arbeitszeit ein?**  
A: ⚙️ Einstellungen → Schicht-Vorlagen → Zeiten pro Wochentag hinterlegen.

**F: Der Wiederkehrend-Tab ist leer.**  
A: Es wurden noch keine wiederkehrenden Termine angelegt. Auf "➕ Neuer Wiederkehrender Termin" klicken.

**F: Wie greife ich von einem anderen PC zu?**  
A: Server-IP des Hauptrechners herausfinden (`ifconfig` / `ipconfig`), dann im Browser `http://IP-ADRESSE:3001` aufrufen.

---

*Werkstatt Terminplaner v1.6.2 · Erstellt mit ❤️ von Sven Hube*
