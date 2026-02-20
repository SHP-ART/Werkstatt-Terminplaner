/**
 * AI Controller für Citroën-Werkstatt Terminplaner
 * 
 * Stellt API-Endpunkte für KI-gestützte Funktionen bereit.
 * 
 * @version 1.2.0
 */

const openaiService = require('../services/openaiService');
const localAiService = require('../services/localAiService');
const externalAiService = require('../services/externalAiService');
const ollamaService = require('../services/ollamaService');
const kiDiscoveryService = require('../services/kiDiscoveryService');
const EinstellungenModel = require('../models/einstellungenModel');

async function getKISettings() {
  const settings = await EinstellungenModel.getWerkstatt();
  const enabled = settings?.ki_enabled !== false && settings?.ki_enabled !== 0;
  let mode = settings?.ki_mode;
  if (!mode) {
    mode = settings?.chatgpt_api_key ? 'openai' : 'local';
  }
  if (settings?.ki_external_url !== undefined) {
    kiDiscoveryService.setManualUrl(settings.ki_external_url);
  }
  return { enabled, mode, settings };
}

function getKIService(mode) {
  if (mode === 'openai') return openaiService;
  if (mode === 'external') return externalAiService;
  if (mode === 'ollama') return ollamaService;
  return localAiService;
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

    if (mode === 'external') {
      const health = await externalAiService.checkHealth();
      const connection = externalAiService.getConnectionStatus();
      const message = health.success
        ? 'Externe KI aktiv'
        : (health.configured ? 'Externe KI nicht erreichbar' : 'Externe KI nicht konfiguriert');
      return res.json({
        enabled: true,
        configured: health.configured,
        mode: 'external',
        message,
        health,
        connection
      });
    }

    if (mode === 'ollama') {
      const status = await ollamaService.testConnection();
      const message = status.success
        ? `Ollama aktiv (${status.model}${status.modelVerfuegbar ? '' : ' — Modell nicht geladen'})`
        : `Ollama nicht erreichbar: ${status.error}`;
      return res.json({
        enabled: true,
        configured: status.configured,
        mode: 'ollama',
        message,
        ollama: status
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

    if (mode === 'external') {
      const result = await externalAiService.testConnection();
      if (result.success) {
        return res.json({
          success: true,
          message: 'Externe KI erreichbar',
          mode: 'external',
          health: result
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error || 'Externe KI nicht erreichbar',
        configured: result.configured,
        mode: 'external'
      });
    }

    if (mode === 'ollama') {
      const result = await ollamaService.testConnection();
      if (result.success) {
        return res.json({
          success: true,
          message: `Ollama erreichbar — Modell: ${result.model}`,
          mode: 'ollama',
          modelVerfuegbar: result.modelVerfuegbar,
          verfuegbareModelle: result.verfuegbareModelle,
          baseUrl: result.baseUrl
        });
      }
      return res.status(503).json({
        success: false,
        error: result.error || 'Ollama nicht erreichbar',
        configured: result.configured,
        mode: 'ollama',
        baseUrl: ollamaService.OLLAMA_BASE_URL
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

    const sinceIdParam = req.query.since_id;
    const lookbackParam = req.query.lookback_days;
    let sinceId = 0;
    if (sinceIdParam !== undefined) {
      const parsed = parseInt(sinceIdParam, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        sinceId = parsed;
      }
    }
    let lookbackDays = 0;
    if (lookbackParam !== undefined) {
      const parsed = parseInt(lookbackParam, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        lookbackDays = parsed;
      }
    }

    const limitParam = req.query.limit;
    let limit = 100;
    if (limitParam !== undefined) {
      if (String(limitParam).toLowerCase() === 'all') {
        limit = 0;
      } else {
        const parsed = parseInt(limitParam, 10);
        if (Number.isFinite(parsed)) {
          limit = parsed;
        }
      }
    }
    const limitClause = limit > 0 ? 'LIMIT ?' : '';
    const limitParams = limit > 0 ? [limit] : [];

    const deltaConditions = [];
    const deltaParams = [];
    if (sinceId > 0) {
      deltaConditions.push('t.id > ?');
      deltaParams.push(sinceId);
    }
    if (lookbackDays > 0) {
      deltaConditions.push('t.datum >= date(\'now\', ?)');
      deltaParams.push(`-${lookbackDays} day`);
    }
    const deltaClause = deltaConditions.length ? `AND (${deltaConditions.join(' OR ')})` : '';
    const orderByClause = deltaConditions.length
      ? 'ORDER BY t.id DESC'
      : 'ORDER BY t.tatsaechliche_zeit DESC';

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
      ${deltaClause}
      ${orderByClause}
      ${limitClause}
    `, [...deltaParams, ...limitParams]);

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

    const maxIdRow = await allAsync(`
      SELECT MAX(id) as max_id
      FROM termine
      WHERE geloescht_am IS NULL
        AND arbeit IS NOT NULL
        AND tatsaechliche_zeit IS NOT NULL
        AND tatsaechliche_zeit > 0
    `);
    const maxId = maxIdRow?.[0]?.max_id || 0;

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
        outlierIds: outliers,
        meta: {
          max_id: maxId,
          since_id: sinceId || null,
          lookback_days: lookbackDays || null
        }
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

/**
 * POST /api/ai/external/retrain
 * Erzwingt Neutraining des externen Modells
 */
async function retrainExternalModel(req, res) {
  try {
    const { enabled, mode } = await getKISettings();
    if (!enabled) {
      return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert' });
    }
    if (mode !== 'external') {
      return res.status(400).json({ error: 'Externer KI-Modus ist nicht aktiv' });
    }

    const result = await externalAiService.retrainModel();
    res.json({
      success: true,
      data: result,
      mode: 'external'
    });
  } catch (error) {
    console.error('retrainExternalModel Fehler:', error);
    res.status(500).json({ error: error.message || 'Externes Training fehlgeschlagen' });
  }
}

/**
 * POST /api/ai/notify-backend-url
 * Benachrichtigt die externe KI über die Backend-URL
 */
async function notifyBackendUrl(req, res) {
  try {
    const { enabled, mode } = await getKISettings();

    if (!enabled || mode !== 'external') {
      return res.status(400).json({
        success: false,
        error: 'Externe KI nicht aktiviert'
      });
    }

    const result = await externalAiService.notifyBackendUrl();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Backend-URL erfolgreich an externe KI übermittelt',
        ...result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message || 'Fehler beim Benachrichtigen der KI'
      });
    }
  } catch (error) {
    console.error('Fehler beim Benachrichtigen der externen KI:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Interner Serverfehler'
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// =============================================================================
// OLLAMA TEST-ENDPUNKTE (unabhängig vom aktiven ki_mode)
// =============================================================================

/**
 * GET /api/ai/ollama/status
 * Prüft Ollama-Verbindung und verfügbare Modelle.
 * Läuft IMMER gegen Ollama, egal was ki_mode eingestellt ist.
 */
async function getOllamaStatus(req, res) {
  try {
    const status = await ollamaService.testConnection();
    // Immer HTTP 200 – es ist ein Status-Check, kein Fehler-Endpunkt.
    // 503 würde den ApiService-Retry auslösen und unnötige Fehlermeldungen erzeugen.
    res.status(200).json({
      ...status,
      konfiguriertes_modell: ollamaService.OLLAMA_MODEL,
      base_url: ollamaService.OLLAMA_BASE_URL
    });
  } catch (error) {
    res.status(200).json({ success: false, error: error.message, konfiguriertes_modell: ollamaService.OLLAMA_MODEL });
  }
}

/**
 * GET /api/ai/ollama/modelle
 * Listet alle auf dem Ollama-Server verfügbaren Modelle auf.
 */
async function getOllamaModelle(req, res) {
  try {
    const status = await ollamaService.testConnection();
    if (!status.success) {
      return res.status(503).json({
        error: 'Ollama nicht erreichbar',
        details: status.error,
        base_url: ollamaService.OLLAMA_BASE_URL
      });
    }
    res.json({
      konfiguriertes_modell: ollamaService.OLLAMA_MODEL,
      model_verfuegbar: status.modelVerfuegbar,
      alle_modelle: status.verfuegbareModelle,
      base_url: ollamaService.OLLAMA_BASE_URL
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/ai/ollama/test-prompt
 * Sendet einen freien Testprompt direkt an Ollama.
 * Body: { prompt: "Dein Testprompt", systemPrompt: "optional" }
 */
async function testOllamaPrompt(req, res) {
  try {
    const { prompt, systemPrompt } = req.body;
    if (!prompt || prompt.trim().length < 3) {
      return res.status(400).json({ error: 'prompt muss mindestens 3 Zeichen lang sein' });
    }

    const start = Date.now();
    // Direkter HTTP-Call analog zu ollamaService intern
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(`${ollamaService.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: ollamaService.OLLAMA_MODEL,
          messages: [
            { role: 'system', content: systemPrompt || 'Du bist ein hilfreicher Assistent.' },
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: { temperature: 0.3 }
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return res.status(200).json({ success: false, error: `Ollama HTTP ${response.status}`, details: body.slice(0, 200) });
    }

    const data = await response.json();
    const antwort = data?.message?.content || data?.response || '';
    const dauer_ms = Date.now() - start;

    res.json({
      success: true,
      modell: ollamaService.OLLAMA_MODEL,
      dauer_ms,
      antwort,
      tokens: data?.eval_count || null
    });
  } catch (error) {
    res.status(200).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/ai/ollama/test-termin
 * Testet parseTerminFromText mit einem Beispieltext via Ollama.
 * Body: { text: "Freitext" }
 * Ignoriert den aktiven ki_mode — läuft immer gegen Ollama.
 */
async function testOllamaTermin(req, res) {
  try {
    const text = req.body?.text || 'Kunde Müller, Citroën C3, Ölwechsel morgen 9 Uhr';
    if (text.trim().length < 5) {
      return res.status(400).json({ error: 'text muss mindestens 5 Zeichen lang sein' });
    }

    const start = Date.now();
    const ergebnis = await ollamaService.parseTerminFromText(text);
    const dauer_ms = Date.now() - start;

    res.json({
      success: true,
      input_text: text,
      dauer_ms,
      modell: ollamaService.OLLAMA_MODEL,
      ergebnis
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      error: error.message,
      hinweis: 'Stelle sicher dass Ollama läuft und das Modell geladen ist'
    });
  }
}

/**
 * GET /api/ai/ollama/benchmark
 * Intelligenter Performance-Test:
 * - Prüft verfügbare (heruntergeladene) Modelle
 * - Wählt das kleinste verfügbare Modell für den Test
 * - Bei keinem Modell: RAM-basierte Empfehlung
 * - Timeout: 30 Sekunden
 */
async function benchmarkOllama(req, res) {
  const os = require('os');
  const TEST_PROMPT = 'Ein Satz auf Deutsch: Was ist ein Ölwechsel?';

  const cpuKerne     = os.cpus().length;
  const ramGesamt_mb = Math.round(os.totalmem() / 1024 / 1024);
  const ramFrei_mb   = Math.round(os.freemem()  / 1024 / 1024);
  const ramGesamt_gb = Math.round(ramGesamt_mb / 1024 * 10) / 10;

  // Modell-Empfehlungen nach RAM (Name, Größe in GB, Typ)
  const MODELL_EMPFEHLUNGEN = [
    { name: 'tinyllama',   groesse_gb: 0.6,  min_ram_gb: 1,  qualitaet: 'Minimal – für sehr schwache Server' },
    { name: 'phi3:mini',   groesse_gb: 2.3,  min_ram_gb: 3,  qualitaet: 'Gut – schnell und kompakt (empfohlen für 4 GB RAM)' },
    { name: 'llama3.2',    groesse_gb: 2.0,  min_ram_gb: 4,  qualitaet: 'Sehr gut – Meta Llama 3.2 3B' },
    { name: 'mistral',     groesse_gb: 4.1,  min_ram_gb: 6,  qualitaet: 'Exzellent – Mistral 7B' },
    { name: 'llama3.1',    groesse_gb: 4.9,  min_ram_gb: 8,  qualitaet: 'Exzellent – Meta Llama 3.1 8B' },
  ];

  function empfehlungFuerRam(ram_gb) {
    // Passende Modelle: mind. eines das in RAM passt (etwas Puffer einplanen)
    const passend = MODELL_EMPFEHLUNGEN.filter(m => m.min_ram_gb <= ram_gb);
    const empfohlen = passend.length > 0 ? passend[passend.length - 1] : MODELL_EMPFEHLUNGEN[0];
    return { empfohlen, alle: MODELL_EMPFEHLUNGEN.filter(m => m.min_ram_gb <= ram_gb + 2) };
  }

  // Erreichbarkeits-Check + Modell-Liste holen
  let verfuegbareModelle = [];
  let ollamaErreichbar = false;
  try {
    const tagRes = await fetch(`${ollamaService.OLLAMA_BASE_URL}/api/tags`,
      { signal: AbortSignal.timeout(4000) });
    if (tagRes.ok) {
      ollamaErreichbar = true;
      const tagData = await tagRes.json();
      verfuegbareModelle = (tagData.models || []).map(m => ({
        name: m.name,
        size_mb: Math.round((m.size || 0) / 1024 / 1024)
      }));
    }
  } catch (_) {}

  const { empfohlen, alle: alleEmpfehlungen } = empfehlungFuerRam(ramGesamt_gb);

  if (!ollamaErreichbar) {
    return res.json({
      success: false,
      fehler_typ: 'nicht_erreichbar',
      error: 'Ollama nicht erreichbar',
      hinweis: 'Starte Ollama: systemctl start ollama && systemctl status ollama',
      system: { cpuKerne, ramGesamt_mb, ramGesamt_gb, ramFrei_mb },
      empfohlenes_modell: empfohlen,
      modell_empfehlungen: alleEmpfehlungen
    });
  }

  // Kein Modell heruntergeladen
  if (verfuegbareModelle.length === 0) {
    return res.json({
      success: false,
      fehler_typ: 'kein_modell',
      error: 'Kein Modell installiert',
      hinweis: `Lade ein passendes Modell: ollama pull ${empfohlen.name}`,
      system: { cpuKerne, ramGesamt_mb, ramGesamt_gb, ramFrei_mb },
      empfohlenes_modell: empfohlen,
      modell_empfehlungen: alleEmpfehlungen,
      installierte_modelle: []
    });
  }

  // Kleinstes verfügbares Modell für Benchmark wählen
  const sortiertNachGroesse = [...verfuegbareModelle].sort((a, b) => a.size_mb - b.size_mb);
  const testModell = sortiertNachGroesse[0].name;

  const start = Date.now();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${ollamaService.OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: testModell,
          messages: [
            { role: 'system', content: 'Antworte sehr kurz auf Deutsch.' },
            { role: 'user',   content: TEST_PROMPT }
          ],
          stream: false,
          options: { temperature: 0.1, num_predict: 60 }
        })
      });
    } finally {
      clearTimeout(tid);
    }

    const dauer_ms = Date.now() - start;

    if (!response.ok) {
      return res.json({
        success: false,
        fehler_typ: 'api_fehler',
        error: `Ollama HTTP ${response.status}`,
        dauer_ms,
        test_modell: testModell,
        system: { cpuKerne, ramGesamt_mb, ramGesamt_gb, ramFrei_mb },
        empfohlenes_modell: empfohlen,
        modell_empfehlungen: alleEmpfehlungen,
        installierte_modelle: verfuegbareModelle
      });
    }

    const data    = await response.json();
    const antwort = data?.message?.content || data?.response || '';
    const tokens  = data?.eval_count || null;
    const token_s = (tokens && data?.eval_duration)
      ? Math.round(tokens / (data.eval_duration / 1e9) * 10) / 10
      : null;

    let bewertung, bewertungLabel, bewertungFarbe;
    if      (dauer_ms <  3000)  { bewertung = 'ausgezeichnet'; bewertungLabel = '🟢 Ausgezeichnet'; bewertungFarbe = '#4caf50'; }
    else if (dauer_ms <  8000)  { bewertung = 'gut';           bewertungLabel = '🟡 Gut';           bewertungFarbe = '#ff9800'; }
    else if (dauer_ms < 20000)  { bewertung = 'langsam';       bewertungLabel = '🟠 Langsam';       bewertungFarbe = '#f57c00'; }
    else                         { bewertung = 'zu_langsam';    bewertungLabel = '🔴 Zu langsam';    bewertungFarbe = '#e53935'; }

    // Passendes Modell für Produktion empfehlen (basierend auf Geschwindigkeit + RAM)
    let produktionsModell = empfohlen;
    if (bewertung !== 'zu_langsam' && ramGesamt_gb >= 4) {
      // Wenn Server schnell genug ist, empfehle ein besseres Modell
      const bessere = alleEmpfehlungen.filter(m => m.min_ram_gb <= ramGesamt_gb);
      if (bessere.length > 0) produktionsModell = bessere[bessere.length - 1];
    }

    res.json({
      success: true,
      test_modell: testModell,
      konfig_modell: ollamaService.OLLAMA_MODEL,
      dauer_ms,
      token_s,
      tokens,
      antwort,
      bewertung,
      bewertungLabel,
      bewertungFarbe,
      system: { cpuKerne, ramGesamt_mb, ramGesamt_gb, ramFrei_mb },
      empfohlenes_modell: produktionsModell,
      modell_empfehlungen: alleEmpfehlungen,
      installierte_modelle: verfuegbareModelle
    });
  } catch (error) {
    const dauer_ms = Date.now() - start;
    const abgebrochen = error.name === 'AbortError';
    res.json({
      success: false,
      fehler_typ: abgebrochen ? 'timeout' : 'fehler',
      error: abgebrochen ? `Timeout nach 30 Sekunden – Modell '${testModell}' zu langsam für diesen Server` : error.message,
      hinweis: abgebrochen
        ? `Versuche ein kleineres Modell: ollama pull ${MODELL_EMPFEHLUNGEN[0].name}`
        : 'Prüfe Ollama-Logs: journalctl -u ollama -n 20',
      dauer_ms,
      test_modell: testModell,
      system: { cpuKerne, ramGesamt_mb, ramGesamt_gb, ramFrei_mb },
      empfohlenes_modell: empfohlen,
      modell_empfehlungen: alleEmpfehlungen,
      installierte_modelle: verfuegbareModelle
    });
  }
}

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
  retrainModel,
  retrainExternalModel,
  notifyBackendUrl,
  // Ollama Test-Endpunkte
  getOllamaStatus,
  getOllamaModelle,
  testOllamaPrompt,
  testOllamaTermin,
  benchmarkOllama
};
