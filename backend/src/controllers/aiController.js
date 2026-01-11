/**
 * AI Controller für Citroën-Werkstatt Terminplaner
 * 
 * Stellt API-Endpunkte für KI-gestützte Funktionen bereit.
 * 
 * @version 1.2.0
 */

const openaiService = require('../services/openaiService');

// =============================================================================
// STATUS & KONFIGURATION
// =============================================================================

/**
 * GET /api/ai/status
 * Prüft den Status der KI-Integration
 */
async function getStatus(req, res) {
  try {
    const configured = openaiService.isConfigured();
    
    if (!configured) {
      return res.json({
        enabled: false,
        configured: false,
        message: 'OpenAI API-Key nicht konfiguriert'
      });
    }
    
    const costStatus = openaiService.getMonthlyEstimatedCost();
    const limitStatus = openaiService.checkCostLimit();
    
    res.json({
      enabled: true,
      configured: true,
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
    const result = await openaiService.testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Verbindung zu OpenAI erfolgreich',
        model: result.model,
        costStatus: result.costStatus
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        configured: result.configured
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
    
    const result = await openaiService.parseTerminFromText(text);
    
    res.json({
      success: true,
      data: result
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
    
    const result = await openaiService.suggestArbeiten(beschreibung, fahrzeug);
    
    res.json({
      success: true,
      data: result
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
    
    const result = await openaiService.estimateZeit(arbeiten, fahrzeug);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('AI estimateZeit Fehler:', error);
    res.status(500).json({ 
      error: 'Zeitschätzung fehlgeschlagen',
      message: error.message 
    });
  }
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
    
    const result = await openaiService.erkenneTeilebedarf(beschreibung, fahrzeug);
    
    res.json({
      success: true,
      data: result
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
    
    const result = openaiService.erkenneFremdmarke(text);
    
    res.json({
      success: true,
      data: {
        ...result,
        warnung: result.istFremdmarke 
          ? `${result.erkannteMarke} ist keine Citroën-Marke. Arbeiten nur für Bestandskunden möglich.`
          : null
      }
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
    
    // Schritt 1: Termin parsen
    const terminData = await openaiService.parseTerminFromText(text);
    
    // Schritt 2: Zeit schätzen (falls Arbeiten erkannt)
    let zeitData = null;
    if (terminData.arbeiten && terminData.arbeiten.length > 0) {
      zeitData = await openaiService.estimateZeit(
        terminData.arbeiten, 
        `${terminData.fahrzeug?.marke || ''} ${terminData.fahrzeug?.modell || ''}`.trim()
      );
    }
    
    // Schritt 3: Teile erkennen (optional)
    let teileData = null;
    if (includeTeile && terminData.beschreibung) {
      teileData = await openaiService.erkenneTeilebedarf(
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
        costStatus: openaiService.getMonthlyEstimatedCost()
      }
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
// EXPORTS
// =============================================================================

module.exports = {
  getStatus,
  testConnection,
  parseTermin,
  suggestArbeiten,
  estimateZeit,
  erkenneTeilebedarf,
  checkFremdmarke,
  fullAnalysis
};
