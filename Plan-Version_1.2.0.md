# Version 1.2.0 - ChatGPT-Integration für Citroën-Werkstatt

## 📋 Übersicht

**Ziel:** Integration von OpenAI's ChatGPT API zur intelligenten Unterstützung bei der Terminerstellung in der Citroën-Markenwerkstatt.

**Geschätzte Gesamtdauer:** 4-5 Wochen  
**Geschätzte Arbeitsstunden:** 120-140 Stunden  
**Geplanter Release:** Februar 2026

---

## 🎯 Features in Version 1.2.0

| Feature | Beschreibung | Priorität |
|---------|--------------|-----------|
| Freitext → Termin | Natürliche Spracheingabe in strukturierte Termin-Daten | ⭐⭐⭐ Hoch |
| Arbeiten-Vorschläge | Problembeschreibung → passende Citroën-Arbeiten | ⭐⭐⭐ Hoch |
| Zeitschätzung | KI-basierte Zeitvorschläge für Arbeiten | ⭐⭐⭐ Hoch |
| Teile-Erkennung | Automatisches Erkennen benötigter PSA-Teile | ⭐⭐ Mittel |
| Fremdmarken-Prüfung | Warnung bei Nicht-Citroën + Bestandskunden-Check | ⭐⭐ Mittel |
| Auslastungsoptimierung | Intelligente Terminvorschläge | ⭐⭐ Mittel |
| Teile-Bestellassistent | Erinnerungen für Teilebestellungen | ⭐ Niedrig |

---

## 📅 Detaillierter Wochenplan

### Woche 1: Backend-Grundlagen (11.-17. Januar 2026)

#### Montag (11.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 1h | OpenAI Account erstellen, API-Key generieren | ⬜ |
| 1h | `openai` npm-Paket installieren | ⬜ |
| 1h | `.env` um `OPENAI_API_KEY` erweitern | ⬜ |
| 2h | Basis `openaiService.js` erstellen (Grundstruktur) | ⬜ |

#### Dienstag (12.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | `parseTerminFromText()` implementieren | ⬜ |
| 2h | Citroën-spezifischen System-Prompt erstellen | ⬜ |
| 1h | Erste Tests mit echten API-Aufrufen | ⬜ |

#### Mittwoch (13.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | `suggestArbeiten()` implementieren | ⬜ |
| 2h | Citroën Service-Pakete in Prompt integrieren | ⬜ |
| 1h | Tests mit verschiedenen Problembeschreibungen | ⬜ |

#### Donnerstag (14.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | `estimateZeit()` implementieren | ⬜ |
| 2h | Citroën-spezifische Zeiten einpflegen | ⬜ |
| 2h | `erkenneTeilebedarf()` implementieren | ⬜ |

#### Freitag (15.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | `aiController.js` erstellen | ⬜ |
| 1h | `aiRoutes.js` erstellen | ⬜ |
| 2h | API-Endpunkte testen (curl/Postman) | ⬜ |
| 1h | Bugfixes & Dokumentation | ⬜ |

**Meilenstein Woche 1:** ✅ Backend-API vollständig funktionsfähig

---

### Woche 2: Frontend-Integration Basis (18.-24. Januar 2026)

#### Montag (18.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | `AIService` Klasse in `api.js` erstellen | ⬜ |
| 3h | KI-Button im Termin-Formular (UI-Design) | ⬜ |
| 1h | CSS-Styling für KI-Elemente | ⬜ |

#### Dienstag (19.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Freitext-Eingabefeld erstellen | ⬜ |
| 2h | Spracheingabe-Option (Web Speech API) | ⬜ |
| 2h | Modal/Popup für KI-Eingabe | ⬜ |

#### Mittwoch (20.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | "KI analysieren" Button-Funktion | ⬜ |
| 2h | Loading-Spinner während API-Aufruf | ⬜ |
| 1h | Fehlerbehandlung bei API-Fehlern | ⬜ |

#### Donnerstag (21.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | KI-Ergebnis in Formularfelder übertragen | ⬜ |
| 2h | Arbeiten-Vorschläge als Checkboxen anzeigen | ⬜ |
| 1h | "Übernehmen" Button für Vorschläge | ⬜ |

#### Freitag (22.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Zeit-Schätzung Integration | ⬜ |
| 2h | Teile-Erkennung Anzeige (Liste) | ⬜ |
| 2h | End-to-End Tests | ⬜ |

**Meilenstein Woche 2:** ✅ KI-Assistent bei Terminerstellung nutzbar

---

### Woche 3: Fremdmarken-Prüfung & Einstellungen (25.-31. Januar 2026)

#### Montag (25.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Fremdmarken-Erkennung Backend (Regex) | ⬜ |
| 2h | `pruefeFremdmarke()` Funktion | ⬜ |
| 2h | Bestandskunden-Prüfung bei Fremdmarken | ⬜ |

#### Dienstag (26.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | Fremdmarken-Warnung UI (Modal) | ⬜ |
| 2h | "Bestandskunde bestätigen" Button | ⬜ |
| 1h | Tests mit verschiedenen Marken | ⬜ |

#### Mittwoch (27.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | Einstellungen-Seite: KI-Tab erstellen | ⬜ |
| 2h | API-Key Eingabefeld (maskiert) | ⬜ |
| 1h | "API-Key testen" Funktion | ⬜ |

#### Donnerstag (28.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | KI-Funktionen ein/ausschalten (Checkboxen) | ⬜ |
| 2h | Kosten-Tracking im Backend | ⬜ |
| 2h | Kosten-Anzeige im Frontend | ⬜ |

#### Freitag (29.01.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Kosten-Limit Einstellung | ⬜ |
| 2h | Einstellungen in DB speichern/laden | ⬜ |
| 2h | Tests & Bugfixes | ⬜ |

**Meilenstein Woche 3:** ✅ Fremdmarken-Prüfung + Einstellungen komplett

---

### Woche 4: Auslastungsoptimierung (01.-07. Februar 2026)

#### Montag (01.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Auslastungsdaten-API erweitern | ⬜ |
| 2h | `optimizeTermin()` Backend-Grundstruktur | ⬜ |
| 2h | Score-Berechnung implementieren | ⬜ |

#### Dienstag (02.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Teile-Vorlaufzeit in Score einbeziehen | ⬜ |
| 2h | Mitarbeiter-Verfügbarkeit prüfen | ⬜ |
| 2h | Citroën-Diagnosegerät-Verfügbarkeit | ⬜ |

#### Mittwoch (03.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 4h | Frontend: Terminvorschläge-Modal | ⬜ |
| 2h | Vorschläge als Karten anzeigen | ⬜ |

#### Donnerstag (04.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 3h | "Termin übernehmen" aus Vorschlag | ⬜ |
| 2h | Gründe/Warnungen anzeigen | ⬜ |
| 1h | UI-Feinschliff | ⬜ |

#### Freitag (05.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Tests mit echten Auslastungsdaten | ⬜ |
| 2h | Performance-Optimierung (Caching) | ⬜ |
| 2h | Dokumentation | ⬜ |

**Meilenstein Woche 4:** ✅ Intelligente Terminvorschläge funktionieren

---

### Woche 5: Teile-Bestellassistent & Finalisierung (08.-14. Februar 2026)

#### Montag (08.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Teile-Checkliste bei Terminerstellung | ⬜ |
| 2h | Checkliste als druckbare Liste | ⬜ |
| 2h | "Teile bestellen" Markierung | ⬜ |

#### Dienstag (09.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Bestellerinnerungs-Dashboard Backend | ⬜ |
| 2h | Dringlichkeits-Kategorisierung | ⬜ |
| 2h | Sammelbestellungs-Erkennung | ⬜ |

#### Mittwoch (10.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 4h | Dashboard Frontend (3 Spalten-Layout) | ⬜ |
| 2h | Farbcodierung (Rot/Gelb/Grün) | ⬜ |

#### Donnerstag (11.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Benachrichtigungs-Banner im Dashboard | ⬜ |
| 2h | Cronjob für tägliche Prüfung | ⬜ |
| 2h | E-Mail-Benachrichtigung (optional) | ⬜ |

#### Freitag (12.02.)
| Zeit | Aufgabe | Status |
|------|---------|--------|
| 2h | Finales Testing aller Features | ⬜ |
| 2h | Dokumentation & README aktualisieren | ⬜ |
| 2h | Release-Notes schreiben | ⬜ |

**Meilenstein Woche 5:** ✅ Version 1.2.0 Release-Ready

---

## 🔧 Technische Anforderungen

### Backend
```
Neue Dateien:
├── backend/src/services/openaiService.js
├── backend/src/controllers/aiController.js
├── backend/src/routes/aiRoutes.js
└── backend/.env (OPENAI_API_KEY ergänzen)

Abhängigkeiten:
└── npm install openai
```

### Frontend
```
Änderungen:
├── frontend/src/services/api.js (AIService Klasse)
├── frontend/src/components/app.js (KI-Integration)
├── frontend/src/styles/main.css (KI-Styling)
└── frontend/index.html (KI-Modals)
```

### Datenbank
```sql
-- Neue Einstellungen
INSERT INTO einstellungen (key, value) VALUES 
  ('ai_enabled', 'false'),
  ('ai_api_key', ''),
  ('ai_cost_limit', '50'),
  ('ai_monthly_cost', '0');
```

---

## 💰 Kostenübersicht

| Posten | Kosten |
|--------|--------|
| OpenAI API (Entwicklung) | ~5-10€ |
| OpenAI API (monatlich, Betrieb) | ~20-30€ |
| Entwicklungszeit (120-140h) | intern |

### OpenAI Preise (GPT-4o-mini)
- Input: $0.15 / 1M Token
- Output: $0.60 / 1M Token
- **Ø pro Anfrage: ~0.01€**

---

## ✅ Checkliste vor Release

- [ ] Alle Features implementiert und getestet
- [ ] Fremdmarken-Prüfung funktioniert
- [ ] Citroën-Teile korrekt erkannt
- [ ] Einstellungen speicherbar
- [ ] Kosten-Tracking funktioniert
- [ ] Dokumentation aktualisiert
- [ ] README.md ergänzt
- [ ] RELEASE-NOTES.md geschrieben
- [ ] Version in package.json auf 1.2.0
- [ ] Git-Tag v1.2.0 erstellt

---

## 🚀 MVP-Option (Schnellstart)

Falls schneller ein nutzbares Ergebnis gewünscht ist:

**MVP-Umfang (1-2 Wochen):**
- ✅ Freitext → Termin
- ✅ Arbeiten-Vorschläge
- ✅ Fremdmarken-Warnung
- ✅ Teile-Erkennung
- ❌ ~~Auslastungsoptimierung~~ (später)
- ❌ ~~Bestellerinnerungen~~ (später)

**MVP-Dauer: ~8-10 Tage**

---

## 📞 Support & Dokumentation

Nach Release verfügbar:
- Benutzerhandbuch für KI-Features
- FAQ für häufige Fragen
- Troubleshooting-Guide
- API-Dokumentation

---

*Plan erstellt: 11. Januar 2026*  
*Geplanter Release: 14. Februar 2026*  
*Version: 1.2.0*
