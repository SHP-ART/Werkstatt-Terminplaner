const EinstellungenModel = require('../models/einstellungenModel');
const { getAsync, allAsync } = require('../utils/dbHelper');

class KIPlanungController {
  
  /**
   * Generiert einen KI-Vorschlag für die Tagesplanung
   */
  static async getPlanungsvorschlag(req, res) {
    try {
      const { datum } = req.params;
      
      if (!datum) {
        return res.status(400).json({ error: 'Datum erforderlich' });
      }
      
      // API-Key prüfen
      const apiKey = await EinstellungenModel.getChatGPTApiKey();
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Kein ChatGPT API-Key konfiguriert. Bitte unter Einstellungen → KI / API einen API-Key hinterlegen.' 
        });
      }
      
      // Alle relevanten Daten sammeln
      const [mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten] = await Promise.all([
        KIPlanungController.getMitarbeiterMitDetails(),
        KIPlanungController.getLehrlingeMitDetails(),
        KIPlanungController.getTermineFuerDatum(datum),
        KIPlanungController.getSchwebendeTermine(),
        EinstellungenModel.getWerkstatt(),
        KIPlanungController.getAbwesenheitenFuerDatum(datum)
      ]);
      
      // Prompt für ChatGPT erstellen
      const prompt = KIPlanungController.erstellePlanungsPrompt({
        datum,
        mitarbeiter,
        lehrlinge,
        termine,
        schwebendeTermine,
        einstellungen,
        abwesenheiten
      });
      
      // ChatGPT API aufrufen
      const kiAntwort = await KIPlanungController.chatGPTRequest(apiKey, prompt);
      
      // Antwort parsen und strukturieren
      const vorschlag = KIPlanungController.parseKIAntwort(kiAntwort, {
        mitarbeiter,
        lehrlinge,
        termine,
        schwebendeTermine
      });
      
      res.json({
        success: true,
        datum,
        vorschlag,
        rohAntwort: kiAntwort // Für Debug-Zwecke
      });
      
    } catch (error) {
      console.error('KI-Planungsvorschlag Fehler:', error);
      res.status(500).json({ 
        error: error.message || 'Fehler beim Generieren des KI-Vorschlags' 
      });
    }
  }

  /**
   * Generiert einen KI-Vorschlag für die Wochenplanung (schwebende Termine verteilen)
   */
  static async getWochenvorschlag(req, res) {
    try {
      const { startDatum } = req.params;
      
      if (!startDatum) {
        return res.status(400).json({ error: 'Startdatum erforderlich' });
      }
      
      // API-Key prüfen
      const apiKey = await EinstellungenModel.getChatGPTApiKey();
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Kein ChatGPT API-Key konfiguriert.' 
        });
      }
      
      // Wochentage berechnen (Mo-Fr)
      const wochentage = KIPlanungController.getWochentage(startDatum);
      
      // Daten für die ganze Woche sammeln
      const wochenDaten = await Promise.all(wochentage.map(async (tag) => {
        const [termine, abwesenheiten] = await Promise.all([
          KIPlanungController.getTermineFuerDatum(tag),
          KIPlanungController.getAbwesenheitenFuerDatum(tag)
        ]);
        return { datum: tag, termine, abwesenheiten };
      }));
      
      const [mitarbeiter, lehrlinge, schwebendeTermine, einstellungen] = await Promise.all([
        KIPlanungController.getMitarbeiterMitDetails(),
        KIPlanungController.getLehrlingeMitDetails(),
        KIPlanungController.getSchwebendeTermine(),
        EinstellungenModel.getWerkstatt()
      ]);
      
      // Prompt für Wochenplanung
      const prompt = KIPlanungController.erstelleWochenPrompt({
        wochentage,
        wochenDaten,
        mitarbeiter,
        lehrlinge,
        schwebendeTermine,
        einstellungen
      });
      
      const kiAntwort = await KIPlanungController.chatGPTRequest(apiKey, prompt);
      
      const vorschlag = KIPlanungController.parseWochenAntwort(kiAntwort, {
        wochentage,
        schwebendeTermine,
        mitarbeiter,
        lehrlinge
      });
      
      res.json({
        success: true,
        wochentage,
        vorschlag,
        rohAntwort: kiAntwort
      });
      
    } catch (error) {
      console.error('KI-Wochenvorschlag Fehler:', error);
      res.status(500).json({ 
        error: error.message || 'Fehler beim Generieren des Wochenvorschlags' 
      });
    }
  }

  // ==================== HILFSFUNKTIONEN ====================

  static async getMitarbeiterMitDetails() {
    return await allAsync(`
      SELECT id, name, arbeitsstunden_pro_tag, mittagspause_start, aktiv, nur_service
      FROM mitarbeiter 
      WHERE aktiv = 1
    `, []);
  }

  static async getLehrlingeMitDetails() {
    return await allAsync(`
      SELECT id, name, arbeitsstunden_pro_tag, mittagspause_start, aufgabenbewaeltigung_prozent, aktiv
      FROM lehrlinge 
      WHERE aktiv = 1
    `, []);
  }

  static async getTermineFuerDatum(datum) {
    return await allAsync(`
      SELECT t.*, k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.datum = ? AND t.geloescht_am IS NULL AND t.status != 'storniert' AND (t.ist_schwebend = 0 OR t.ist_schwebend IS NULL)
    `, [datum]);
  }

  static async getSchwebendeTermine() {
    return await allAsync(`
      SELECT t.*, k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ist_schwebend = 1 AND t.geloescht_am IS NULL AND t.status != 'storniert'
      ORDER BY t.schwebend_prioritaet DESC, t.erstellt_am ASC
    `, []);
  }

  static async getAbwesenheitenFuerDatum(datum) {
    return await allAsync(`
      SELECT * FROM mitarbeiter_abwesenheiten
      WHERE von_datum <= ? AND bis_datum >= ?
    `, [datum, datum]);
  }

  static getWochentage(startDatum) {
    const start = new Date(startDatum);
    // Zum Montag der Woche gehen
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    
    const tage = [];
    for (let i = 0; i < 5; i++) { // Mo-Fr
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      tage.push(d.toISOString().split('T')[0]);
    }
    return tage;
  }

  static erstellePlanungsPrompt({ datum, mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten }) {
    const datumFormatiert = new Date(datum).toLocaleDateString('de-DE', { 
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    });
    
    // Abwesende IDs sammeln
    const abwesendeIds = new Set(abwesenheiten.map(a => `${a.person_typ}_${a.person_id}`));
    
    // Mitarbeiter-Info
    const mitarbeiterInfo = mitarbeiter.map(m => {
      const istAbwesend = abwesendeIds.has(`mitarbeiter_${m.id}`);
      const pause = m.mittagspause_start || '12:00';
      return `- ${m.name} (ID: ${m.id}): ${m.arbeitsstunden_pro_tag || 8}h/Tag, Pause: ${pause}${m.nur_service ? ', NUR Service' : ''}${istAbwesend ? ' [ABWESEND]' : ''}`;
    }).join('\n');
    
    // Lehrlinge-Info
    const lehrlingeInfo = lehrlinge.map(l => {
      const istAbwesend = abwesendeIds.has(`lehrling_${l.id}`);
      const faktor = l.aufgabenbewaeltigung_prozent || 100;
      const pause = l.mittagspause_start || '12:00';
      return `- ${l.name} (Lehrling-ID: ${l.id}): ${l.arbeitsstunden_pro_tag || 8}h/Tag, Pause: ${pause}, Zeitfaktor: ${faktor}%${istAbwesend ? ' [ABWESEND]' : ''}`;
    }).join('\n');
    
    // Bereits zugeordnete Termine
    const zugeordneteTermine = termine.filter(t => t.mitarbeiter_id || t.arbeitszeiten_details);
    const zugeordnetInfo = zugeordneteTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const zuordnung = t.mitarbeiter_id ? `MA-ID: ${t.mitarbeiter_id}` : 'individuell';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Bring: ${t.bring_zeit || '-'}, Abhol: ${t.abhol_zeit || '-'}, Zuordnung: ${zuordnung}`;
    }).join('\n') || 'Keine';
    
    // Nicht zugeordnete Termine
    const nichtZugeordneteTermine = termine.filter(t => !t.mitarbeiter_id && !t.arbeitszeiten_details);
    const nichtZugeordnetInfo = nichtZugeordneteTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const kundeWartet = t.kunde_wartet ? '⚡ WARTET' : '';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Bring: ${t.bring_zeit || '-'}, Abhol: ${t.abhol_zeit || '-'} ${kundeWartet}`;
    }).join('\n') || 'Keine';
    
    // Schwebende Termine (ohne festes Datum)
    const schwebendeInfo = schwebendeTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const prio = t.prioritaet ? `Prio: ${t.prioritaet}` : '';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Kennz: ${t.kennzeichen || '-'} ${prio}`;
    }).join('\n') || 'Keine';
    
    const servicezeit = einstellungen?.servicezeit_minuten || 10;
    const nebenzeit = einstellungen?.nebenzeit_prozent || 0;
    const mittagspause = einstellungen?.mittagspause_minuten || 30;

    return `Du bist ein Werkstatt-Planungsassistent. Optimiere die Tagesplanung für eine KFZ-Werkstatt.

DATUM: ${datumFormatiert}

WERKSTATT-EINSTELLUNGEN:
- Servicezeit pro Termin: ${servicezeit} Minuten (Annahme/Rechnung)
- Nebenzeit-Aufschlag: ${nebenzeit}% (Holen, Waschen etc.)
- Mittagspause: ${mittagspause} Minuten

MITARBEITER (verfügbar):
${mitarbeiterInfo || 'Keine Mitarbeiter'}

LEHRLINGE (verfügbar):
${lehrlingeInfo || 'Keine Lehrlinge'}

BEREITS ZUGEORDNETE TERMINE:
${zugeordnetInfo}

NICHT ZUGEORDNETE TERMINE (für heute):
${nichtZugeordnetInfo}

SCHWEBENDE TERMINE (ohne Datum, können eingeplant werden):
${schwebendeInfo}

AUFGABE:
1. Analysiere die aktuelle Situation
2. Schlage eine optimale Zuordnung für die NICHT ZUGEORDNETEN Termine vor
3. Prüfe, ob SCHWEBENDE Termine heute eingeplant werden können (bei freier Kapazität)
4. Beachte: Termine mit "Kunde wartet" sollten früh und an erfahrene Mitarbeiter
5. Beachte Bring- und Abholzeiten
6. Lehrlinge nur für einfache Arbeiten, mit Zeitfaktor berücksichtigen

ANTWORT-FORMAT (JSON):
{
  "zusammenfassung": "Kurze Analyse der Situation",
  "tagesZuordnungen": [
    {
      "terminId": 123,
      "mitarbeiterId": 1,
      "mitarbeiterTyp": "mitarbeiter",
      "startzeit": "09:00",
      "begruendung": "Warum diese Zuordnung"
    }
  ],
  "schwebendeVorschlaege": [
    {
      "terminId": 456,
      "empfehlung": "heute_einplanen",
      "mitarbeiterId": 2,
      "mitarbeiterTyp": "mitarbeiter",
      "startzeit": "14:00",
      "begruendung": "Genug Kapazität vorhanden"
    }
  ],
  "warnungen": ["Mögliche Probleme oder Hinweise"],
  "kapazitaetsAnalyse": {
    "gesamtKapazitaet": "X Stunden",
    "genutzt": "Y Stunden",
    "frei": "Z Stunden"
  }
}

Antworte NUR mit dem JSON, ohne zusätzlichen Text.`;
  }

  static erstelleWochenPrompt({ wochentage, wochenDaten, mitarbeiter, lehrlinge, schwebendeTermine, einstellungen }) {
    const wochenInfo = wochenDaten.map(wd => {
      const termineAnzahl = wd.termine.length;
      const totalDauer = wd.termine.reduce((sum, t) => sum + (t.geschaetzte_dauer || 60), 0);
      return `- ${wd.datum}: ${termineAnzahl} Termine, ca. ${Math.round(totalDauer/60)}h geplant`;
    }).join('\n');
    
    const schwebendeInfo = schwebendeTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const prio = t.prioritaet || 0;
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Prio: ${prio}, Kunde: ${t.kunde_name || 'k.A.'}`;
    }).join('\n') || 'Keine';
    
    const kapazitaet = mitarbeiter.reduce((sum, m) => sum + (m.arbeitsstunden_pro_tag || 8), 0) +
                       lehrlinge.reduce((sum, l) => sum + (l.arbeitsstunden_pro_tag || 8) * ((l.aufgabenbewaeltigung_prozent || 100) / 100), 0);

    return `Du bist ein Werkstatt-Planungsassistent. Verteile schwebende Termine auf die Woche.

WOCHE: ${wochentage[0]} bis ${wochentage[4]}

AKTUELLE BELEGUNG:
${wochenInfo}

TAGESKAPAZITÄT: ca. ${Math.round(kapazitaet)}h (${mitarbeiter.length} Mitarbeiter, ${lehrlinge.length} Lehrlinge)

SCHWEBENDE TERMINE ZUM VERTEILEN:
${schwebendeInfo}

AUFGABE:
1. Verteile die schwebenden Termine gleichmäßig auf die Woche
2. Berücksichtige Prioritäten (höhere Prio = früher in der Woche)
3. Überlaste keinen einzelnen Tag
4. Lasse Puffer für spontane Termine

ANTWORT-FORMAT (JSON):
{
  "zusammenfassung": "Kurze Analyse",
  "verteilung": [
    {
      "terminId": 123,
      "empfohlenesDatum": "2026-01-13",
      "begruendung": "Warum dieser Tag"
    }
  ],
  "warnungen": ["Hinweise"],
  "wochenAuslastung": {
    "montag": "X%",
    "dienstag": "Y%",
    "mittwoch": "Z%",
    "donnerstag": "A%",
    "freitag": "B%"
  }
}

Antworte NUR mit dem JSON.`;
  }

  static async chatGPTRequest(apiKey, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Du bist ein Experte für Werkstatt-Planung und Ressourcenoptimierung. Antworte immer auf Deutsch und im angeforderten JSON-Format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API Fehler: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  static parseKIAntwort(antwort, { mitarbeiter, lehrlinge, termine, schwebendeTermine }) {
    try {
      // JSON aus der Antwort extrahieren
      let json = antwort.trim();
      
      // Falls in Markdown-Blöcken
      const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        json = jsonMatch[1];
      }
      
      const parsed = JSON.parse(json);
      
      // Validierung und Anreicherung der Zuordnungen
      if (parsed.tagesZuordnungen) {
        parsed.tagesZuordnungen = parsed.tagesZuordnungen.map(z => {
          const termin = termine.find(t => t.id === z.terminId);
          const person = z.mitarbeiterTyp === 'lehrling' 
            ? lehrlinge.find(l => l.id === z.mitarbeiterId)
            : mitarbeiter.find(m => m.id === z.mitarbeiterId);
          
          return {
            ...z,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            personName: person ? person.name : 'Unbekannt',
            gueltig: !!termin && !!person
          };
        });
      }
      
      // Schwebende Vorschläge validieren
      if (parsed.schwebendeVorschlaege) {
        parsed.schwebendeVorschlaege = parsed.schwebendeVorschlaege.map(v => {
          const termin = schwebendeTermine.find(t => t.id === v.terminId);
          const person = v.mitarbeiterTyp === 'lehrling'
            ? lehrlinge.find(l => l.id === v.mitarbeiterId)
            : mitarbeiter.find(m => m.id === v.mitarbeiterId);
          
          return {
            ...v,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            personName: person ? person.name : 'Unbekannt',
            gueltig: !!termin
          };
        });
      }
      
      return parsed;
    } catch (e) {
      console.error('Fehler beim Parsen der KI-Antwort:', e);
      return {
        zusammenfassung: 'Die KI-Antwort konnte nicht verarbeitet werden.',
        tagesZuordnungen: [],
        schwebendeVorschlaege: [],
        warnungen: ['Fehler beim Parsen: ' + e.message],
        rohAntwort: antwort
      };
    }
  }

  static parseWochenAntwort(antwort, { wochentage, schwebendeTermine, mitarbeiter, lehrlinge }) {
    try {
      let json = antwort.trim();
      const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        json = jsonMatch[1];
      }
      
      const parsed = JSON.parse(json);
      
      if (parsed.verteilung) {
        parsed.verteilung = parsed.verteilung.map(v => {
          const termin = schwebendeTermine.find(t => t.id === v.terminId);
          return {
            ...v,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            gueltig: !!termin && wochentage.includes(v.empfohlenesDatum)
          };
        });
      }
      
      return parsed;
    } catch (e) {
      console.error('Fehler beim Parsen der Wochen-Antwort:', e);
      return {
        zusammenfassung: 'Die KI-Antwort konnte nicht verarbeitet werden.',
        verteilung: [],
        warnungen: ['Fehler beim Parsen: ' + e.message]
      };
    }
  }
}

module.exports = KIPlanungController;
