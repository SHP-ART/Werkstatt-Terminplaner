/**
 * AI Controller für Citroën-Werkstatt Terminplaner
 * 
 * Stellt API-Endpunkte für KI-gestützte Funktionen bereit.
 * 
 * @version 1.2.0
 */

const openaiService = require('../services/openaiService');
const localAiService = require('../services/localAiService');
const EinstellungenModel = require('../models/einstellungenModel');

async function getKISettings() {
  const settings = await EinstellungenModel.getWerkstatt();
  const enabled = settings?.ki_enabled !== false && settings?.ki_enabled !== 0;
  let mode = settings?.ki_mode;
  if (!mode) {
    mode = settings?.chatgpt_api_key ? 'openai' : 'local';
  }
  return { enabled, mode, settings };
}

function getKIService(mode) {
  return mode === 'openai' ? openaiService : localAiService;
}

// =============================================================================
// STATUS & KONFIGURATION
// =============================================================================

/**
 * GET /api/ai/status
 * Prüft den Status der KI-Integration
 */
async function getStatus(req, res) {
  try {
    const { enabled, mode } = await getKISettings();

    if (!enabled) {
      return res.json({
        enabled: false,
        configured: false,
        mode,
        message: 'KI-Funktionen deaktiviert'
      });
    }

    if (mode === 'local') {
      return res.json({
        enabled: true,
        configured: true,
        mode: 'local',
        message: 'Lokale KI aktiv'
      });
    }

    const configured = openaiService.isConfigured();
    if (!configured) {
      return res.json({
        enabled: true,
        configured: false,
        mode: 'openai',
        message: 'OpenAI API-Key nicht konfiguriert'
      });
    }

    const costStatus = openaiService.getMonthlyEstimatedCost();
    const limitStatus = openaiService.checkCostLimit();

    res.json({
      enabled: true,
      configured: true,
      mode: 'openai',
      costStatus,
      limitStatus,
      message: 'KI-Integration aktiv'
    });
    
  } catch (error) {
    console.error('AI getStatus Fehler:', error);
    res.status(500).json({ 
      error: 'Status-Abfrage fehlgeschlagen',
      message: error.message 
    });
  }
}

/**
 * GET /api/ai/test
 * Testet die Verbindung zur OpenAI API
 */
async function testConnection(req, res) {
  try {
    const { enabled, mode } = await getKISettings();

    if (!enabled) {
      return res.status(400).json({
        success: false,
        error: 'KI-Funktionen sind deaktiviert'
      });
    }

    if (mode === 'local') {
      return res.json({
        success: true,
        message: 'Lokale KI ist aktiv',
        mode: 'local'
      });
    }

    const result = await openaiService.testConnection();

    if (result.success) {
      res.json({
        success: true,
        message: 'Verbindung zu OpenAI erfolgreich',
        model: result.model,
        costStatus: result.costStatus,
        mode: 'openai'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        configured: result.configured,
        mode: 'openai'
      });
    }
    
  } catch (error) {
    console.error('AI testConnection Fehler:', error);
    res.status(500).json({ 
      error: 'Verbindungstest fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// TERMIN-ANALYSE
// =============================================================================

/**
 * POST /api/ai/parse-termin
 * Parst Freitext in strukturierte Termin-Daten
 * 
 * Body: { text: "Freitext-Beschreibung" }
 */
async function parseTermin(req, res) {
  try {
    const { text } = req.body;
    
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ 
        error: 'Text muss mindestens 5 Zeichen lang sein' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.parseTerminFromText(text);

    res.json({
      success: true,
      data: result,
      mode
    });
    
  } catch (error) {
    console.error('AI parseTermin Fehler:', error);
    res.status(500).json({ 
      error: 'Termin-Analyse fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// ARBEITEN-VORSCHLÄGE
// =============================================================================

/**
 * POST /api/ai/suggest-arbeiten
 * Schlägt Arbeiten basierend auf Problembeschreibung vor
 * 
 * Body: { beschreibung: "Problem", fahrzeug: "optional" }
 */
async function suggestArbeiten(req, res) {
  try {
    const { beschreibung, fahrzeug } = req.body;
    
    if (!beschreibung || beschreibung.trim().length < 5) {
      return res.status(400).json({ 
        error: 'Beschreibung muss mindestens 5 Zeichen lang sein' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.suggestArbeiten(beschreibung, fahrzeug);

    res.json({
      success: true,
      data: result,
      mode
    });
    
  } catch (error) {
    console.error('AI suggestArbeiten Fehler:', error);
    res.status(500).json({ 
      error: 'Arbeiten-Vorschlag fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// ZEIT-SCHÄTZUNG
// =============================================================================

/**
 * POST /api/ai/estimate-zeit
 * Schätzt die Zeit für gegebene Arbeiten
 * 
 * Body: { arbeiten: ["Arbeit 1", "Arbeit 2"], fahrzeug: "optional" }
 */
async function estimateZeit(req, res) {
  try {
    const { arbeiten, fahrzeug } = req.body;
    
    if (!arbeiten || !Array.isArray(arbeiten) || arbeiten.length === 0) {
      return res.status(400).json({ 
        error: 'Arbeiten-Array erforderlich' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.estimateZeit(arbeiten, fahrzeug);

    res.json({
      success: true,
      data: result,
      mode
    });
    
  } catch (error) {
    console.error('AI estimateZeit Fehler:', error);
    res.status(500).json({ 
      error: 'Zeitschätzung fehlgeschlagen',
      message: error.message 
    });
  }
}

/**
 * POST /api/ai/estimate-time
 * Alias für Zeitschätzung (lokales Modell/OpenAI abhängig vom Modus)
 */
async function estimateTime(req, res) {
  return estimateZeit(req, res);
}

// =============================================================================
// TEILE-ERKENNUNG
// =============================================================================

/**
 * POST /api/ai/teile-bedarf
 * Erkennt benötigte Teile aus einer Beschreibung
 * 
 * Body: { beschreibung: "Arbeitsbeschreibung", fahrzeug: "optional" }
 */
async function erkenneTeilebedarf(req, res) {
  try {
    const { beschreibung, fahrzeug } = req.body;
    
    if (!beschreibung || beschreibung.trim().length < 5) {
      return res.status(400).json({ 
        error: 'Beschreibung muss mindestens 5 Zeichen lang sein' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.erkenneTeilebedarf(beschreibung, fahrzeug);

    res.json({
      success: true,
      data: result,
      mode
    });
    
  } catch (error) {
    console.error('AI erkenneTeilebedarf Fehler:', error);
    res.status(500).json({ 
      error: 'Teile-Erkennung fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// FREMDMARKEN-PRÜFUNG
// =============================================================================

/**
 * POST /api/ai/check-fremdmarke
 * Prüft ob ein Text eine Fremdmarke enthält
 * 
 * Body: { text: "Text mit Fahrzeuginfo" }
 */
async function checkFremdmarke(req, res) {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        error: 'Text erforderlich' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = service.erkenneFremdmarke(text);

    res.json({
      success: true,
      data: {
        ...result,
        warnung: result.istFremdmarke
          ? `${result.erkannteMarke} ist keine Citroen-Marke. Arbeiten nur fuer Bestandskunden moeglich.`
          : null
      },
      mode
    });
    
  } catch (error) {
    console.error('AI checkFremdmarke Fehler:', error);
    res.status(500).json({ 
      error: 'Fremdmarken-Prüfung fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// KOMBINIERTE ANALYSE
// =============================================================================

/**
 * POST /api/ai/analyze
 * Führt eine vollständige Analyse durch (Termin + Arbeiten + Zeit + Teile)
 * 
 * Body: { text: "Freitext", includeTeile: true/false }
 */
async function fullAnalysis(req, res) {
  try {
    const { text, includeTeile = false } = req.body;
    
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ 
        error: 'Text muss mindestens 5 Zeichen lang sein' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);

    // Schritt 1: Termin parsen
    const terminData = await service.parseTerminFromText(text);

    // Schritt 2: Zeit schätzen (falls Arbeiten erkannt)
    let zeitData = null;
    if (terminData.arbeiten && terminData.arbeiten.length > 0) {
      zeitData = await service.estimateZeit(
        terminData.arbeiten,
        `${terminData.fahrzeug?.marke || ''} ${terminData.fahrzeug?.modell || ''}`.trim()
      );
    }

    // Schritt 3: Teile erkennen (optional)
    let teileData = null;
    if (includeTeile && terminData.beschreibung) {
      teileData = await service.erkenneTeilebedarf(
        terminData.beschreibung,
        `${terminData.fahrzeug?.marke || ''} ${terminData.fahrzeug?.modell || ''}`.trim()
      );
    }

    res.json({
      success: true,
      data: {
        termin: terminData,
        zeitschaetzung: zeitData,
        teile: teileData,
        costStatus: mode === 'openai' ? openaiService.getMonthlyEstimatedCost() : null
      },
      mode
    });
    
  } catch (error) {
    console.error('AI fullAnalysis Fehler:', error);
    res.status(500).json({ 
      error: 'Analyse fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// WARTUNGSPLAN
// =============================================================================

/**
 * POST /api/ai/wartungsplan
 * Erstellt einen Citroën-Wartungsplan basierend auf km-Stand
 * 
 * Body: { fahrzeug: "Citroën C3 PureTech", kmStand: 45000, alter: 3 }
 */
async function getWartungsplan(req, res) {
  try {
    const { fahrzeug, kmStand, alter } = req.body;
    
    if (!fahrzeug || fahrzeug.trim().length < 3) {
      return res.status(400).json({ 
        error: 'Fahrzeugtyp ist erforderlich' 
      });
    }
    
    if (!kmStand || kmStand < 0) {
      return res.status(400).json({ 
        error: 'Gültiger Kilometerstand ist erforderlich' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.getWartungsplan(fahrzeug, kmStand, alter);
    if (result && typeof result === 'object' && !result.mode) {
      result.mode = mode;
    }

    res.json(result);
    
  } catch (error) {
    console.error('AI Wartungsplan Fehler:', error);
    res.status(500).json({ 
      error: 'Wartungsplan-Erstellung fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// VIN-DECODER
// =============================================================================

/**
 * POST /api/ai/vin-decode
 * Dekodiert eine Fahrgestellnummer (VIN) und liefert Fahrzeugdaten + Teile-Hinweise
 */
async function decodeVIN(req, res) {
  try {
    const { vin } = req.body;
    
    if (!vin || vin.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Fahrgestellnummer (VIN) ist erforderlich' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.decodeVIN(vin);
    if (result && typeof result === 'object' && !result.mode) {
      result.mode = mode;
    }

    res.json(result);
    
  } catch (error) {
    console.error('VIN-Decode Fehler:', error);
    res.status(500).json({ 
      error: 'VIN-Dekodierung fehlgeschlagen',
      message: error.message 
    });
  }
}

/**
 * POST /api/ai/vin-teile-check
 * Prüft Teile-Kompatibilität basierend auf VIN und Arbeit
 */
async function checkTeileKompatibilitaet(req, res) {
  try {
    const { vin, arbeit } = req.body;
    
    if (!vin || vin.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Fahrgestellnummer (VIN) ist erforderlich' 
      });
    }
    
    if (!arbeit || arbeit.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Arbeitsbeschreibung ist erforderlich' 
      });
    }

    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }

    const service = getKIService(mode);
    const result = await service.checkTeileKompatibilitaet(vin, arbeit);
    if (result && typeof result === 'object' && !result.mode) {
      result.mode = mode;
    }

    res.json(result);
    
  } catch (error) {
    console.error('Teile-Kompatibilitätscheck Fehler:', error);
    res.status(500).json({ 
      error: 'Teile-Check fehlgeschlagen',
      message: error.message 
    });
  }
}

// =============================================================================
// TRAINING DATA MANAGEMENT
// =============================================================================

/**
 * GET /api/ai/training-data
 * Liefert Übersicht der Trainingsdaten mit Statistiken
 */
async function getTrainingData(req, res) {
  try {
    const { allAsync, runAsync } = require('../utils/dbHelper');

    // Alle relevanten Termine für Training
    const termine = await allAsync(`
      SELECT
        t.id,
        t.arbeit,
        t.geschaetzte_zeit,
        t.tatsaechliche_zeit,
        t.status,
        t.datum,
        t.ki_training_exclude,
        t.ki_training_note,
        k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.geloescht_am IS NULL
        AND t.arbeit IS NOT NULL
        AND t.tatsaechliche_zeit IS NOT NULL
        AND t.tatsaechliche_zeit > 0
      ORDER BY t.tatsaechliche_zeit DESC
      LIMIT 100
    `);

    // Statistiken berechnen
    const stats = await allAsync(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'abgeschlossen' THEN 1 ELSE 0 END) as abgeschlossen,
        SUM(CASE WHEN ki_training_exclude = 1 THEN 1 ELSE 0 END) as ausgeschlossen,
        AVG(tatsaechliche_zeit) as avg_zeit,
        MIN(tatsaechliche_zeit) as min_zeit,
        MAX(tatsaechliche_zeit) as max_zeit
      FROM termine
      WHERE geloescht_am IS NULL
        AND arbeit IS NOT NULL
        AND tatsaechliche_zeit IS NOT NULL
        AND tatsaechliche_zeit > 0
    `);

    // Ausreißer erkennen (IQR-Methode)
    const zeiten = termine.map(t => t.tatsaechliche_zeit).sort((a, b) => a - b);
    let outliers = [];
    if (zeiten.length >= 4) {
      const q1 = zeiten[Math.floor(zeiten.length * 0.25)];
      const q3 = zeiten[Math.floor(zeiten.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = Math.max(5, q1 - 1.5 * iqr);
      const upperBound = q3 + 1.5 * iqr;

      outliers = termine.filter(t =>
        t.tatsaechliche_zeit < lowerBound || t.tatsaechliche_zeit > upperBound
      ).map(t => t.id);
    }

    res.json({
      success: true,
      data: {
        termine: termine.map(t => ({
          ...t,
          isOutlier: outliers.includes(t.id),
          abweichung: t.geschaetzte_zeit
            ? Math.round((t.tatsaechliche_zeit - t.geschaetzte_zeit) / t.geschaetzte_zeit * 100)
            : null
        })),
        stats: stats[0],
        outlierCount: outliers.length,
        outlierIds: outliers
      }
    });

  } catch (error) {
    console.error('getTrainingData Fehler:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/ai/training-data/:id/exclude
 * Schließt einen Termin vom Training aus
 */
async function excludeFromTraining(req, res) {
  try {
    const { id } = req.params;
    const { exclude, note } = req.body;
    const { runAsync } = require('../utils/dbHelper');

    await runAsync(
      `UPDATE termine SET ki_training_exclude = ?, ki_training_note = ? WHERE id = ?`,
      [exclude ? 1 : 0, note || null, id]
    );

    // Training-Cache invalidieren
    const localAiService = require('../services/localAiService');
    await localAiService.trainZeitModel(true);

    res.json({
      success: true,
      message: exclude ? 'Termin vom Training ausgeschlossen' : 'Termin für Training aktiviert'
    });

  } catch (error) {
    console.error('excludeFromTraining Fehler:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/ai/training-data/exclude-outliers
 * Schließt alle erkannten Ausreißer automatisch aus
 */
async function excludeAllOutliers(req, res) {
  try {
    const { allAsync, runAsync } = require('../utils/dbHelper');

    // Alle Zeiten abrufen
    const termine = await allAsync(`
      SELECT id, tatsaechliche_zeit
      FROM termine
      WHERE geloescht_am IS NULL
        AND arbeit IS NOT NULL
        AND tatsaechliche_zeit IS NOT NULL
        AND tatsaechliche_zeit > 0
        AND (ki_training_exclude IS NULL OR ki_training_exclude = 0)
    `);

    const zeiten = termine.map(t => t.tatsaechliche_zeit).sort((a, b) => a - b);
    if (zeiten.length < 4) {
      return res.json({ success: true, excluded: 0, message: 'Zu wenig Daten für Ausreißer-Erkennung' });
    }

    const q1 = zeiten[Math.floor(zeiten.length * 0.25)];
    const q3 = zeiten[Math.floor(zeiten.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = Math.max(5, q1 - 1.5 * iqr);
    const upperBound = q3 + 1.5 * iqr;

    const outlierIds = termine
      .filter(t => t.tatsaechliche_zeit < lowerBound || t.tatsaechliche_zeit > upperBound)
      .map(t => t.id);

    if (outlierIds.length > 0) {
      await runAsync(
        `UPDATE termine SET ki_training_exclude = 1, ki_training_note = 'Automatisch als Ausreißer erkannt' WHERE id IN (${outlierIds.join(',')})`,
        []
      );

      // Training-Cache invalidieren
      const localAiService = require('../services/localAiService');
      await localAiService.trainZeitModel(true);
    }

    res.json({
      success: true,
      excluded: outlierIds.length,
      outlierIds,
      bounds: { lower: lowerBound, upper: upperBound }
    });

  } catch (error) {
    console.error('excludeAllOutliers Fehler:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/ai/retrain
 * Erzwingt Neutraining des Modells
 */
async function retrainModel(req, res) {
  try {
    const localAiService = require('../services/localAiService');
    const result = await localAiService.trainZeitModel(true);

    res.json({
      success: true,
      message: 'Modell neu trainiert',
      stats: {
        samples: result.samples,
        fallbackMinutes: result.fallbackMinutes,
        arbeitenCount: Object.keys(result.byArbeit).length
      }
    });

  } catch (error) {
    console.error('retrainModel Fehler:', error);
    res.status(500).json({ error: error.message });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getStatus,
  testConnection,
  parseTermin,
  suggestArbeiten,
  estimateZeit,
  estimateTime,
  erkenneTeilebedarf,
  checkFremdmarke,
  fullAnalysis,
  getWartungsplan,
  decodeVIN,
  checkTeileKompatibilitaet,
  // Training Data Management
  getTrainingData,
  excludeFromTraining,
  excludeAllOutliers,
  retrainModel
};
