/**
 * AI Routes für Citroën-Werkstatt Terminplaner
 * 
 * Definiert alle API-Endpunkte für KI-Funktionen.
 * 
 * @version 1.2.0
 */

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// =============================================================================
// STATUS & KONFIGURATION
// =============================================================================

/**
 * GET /api/ai/status
 * Prüft den Status der KI-Integration
 */
router.get('/status', aiController.getStatus);

/**
 * GET /api/ai/test
 * Testet die Verbindung zur OpenAI API
 */
router.get('/test', aiController.testConnection);

// =============================================================================
// TERMIN-ANALYSE
// =============================================================================

/**
 * POST /api/ai/parse-termin
 * Parst Freitext in strukturierte Termin-Daten
 * 
 * Body: { text: "Freitext-Beschreibung" }
 * 
 * Beispiel:
 * {
 *   "text": "Herr Müller möchte morgen um 10 Uhr mit seinem C3 zur Inspektion"
 * }
 */
router.post('/parse-termin', aiController.parseTermin);

// =============================================================================
// ARBEITEN-VORSCHLÄGE
// =============================================================================

/**
 * POST /api/ai/suggest-arbeiten
 * Schlägt Arbeiten basierend auf Problembeschreibung vor
 * 
 * Body: { beschreibung: "Problem", fahrzeug: "optional" }
 * 
 * Beispiel:
 * {
 *   "beschreibung": "Bremsen quietschen beim Fahren",
 *   "fahrzeug": "Citroën C4 2019"
 * }
 */
router.post('/suggest-arbeiten', aiController.suggestArbeiten);

// =============================================================================
// ZEIT-SCHÄTZUNG
// =============================================================================

/**
 * POST /api/ai/estimate-zeit
 * Schätzt die Zeit für gegebene Arbeiten
 * 
 * Body: { arbeiten: ["Arbeit 1", "Arbeit 2"], fahrzeug: "optional" }
 * 
 * Beispiel:
 * {
 *   "arbeiten": ["Bremsbeläge vorne wechseln", "Bremsscheiben prüfen"],
 *   "fahrzeug": "Citroën C3 2020"
 * }
 */
router.post('/estimate-zeit', aiController.estimateZeit);
router.post('/estimate-time', aiController.estimateTime);

// =============================================================================
// TEILE-ERKENNUNG
// =============================================================================

/**
 * POST /api/ai/teile-bedarf
 * Erkennt benötigte Teile aus einer Beschreibung
 * 
 * Body: { beschreibung: "Arbeitsbeschreibung", fahrzeug: "optional" }
 * 
 * Beispiel:
 * {
 *   "beschreibung": "Zahnriemenwechsel mit Wasserpumpe",
 *   "fahrzeug": "Citroën C4 1.6 HDi"
 * }
 */
router.post('/teile-bedarf', aiController.erkenneTeilebedarf);

// =============================================================================
// FREMDMARKEN-PRÜFUNG
// =============================================================================

/**
 * POST /api/ai/check-fremdmarke
 * Prüft ob ein Text eine Fremdmarke enthält (KEIN API-Call nötig)
 * 
 * Body: { text: "Text mit Fahrzeuginfo" }
 * 
 * Beispiel:
 * {
 *   "text": "VW Golf zum Ölwechsel"
 * }
 */
router.post('/check-fremdmarke', aiController.checkFremdmarke);

// =============================================================================
// KOMBINIERTE ANALYSE
// =============================================================================

/**
 * POST /api/ai/analyze
 * Führt eine vollständige Analyse durch (Termin + Arbeiten + Zeit + Teile)
 * 
 * Body: { text: "Freitext", includeTeile: true/false }
 * 
 * Beispiel:
 * {
 *   "text": "Herr Schmidt mit C3 Aircross, Bj 2021 - Bremsen vorne machen Geräusche",
 *   "includeTeile": true
 * }
 */
router.post('/analyze', aiController.fullAnalysis);

// =============================================================================
// WARTUNGSPLAN
// =============================================================================

/**
 * POST /api/ai/wartungsplan
 * Erstellt einen Citroën-Wartungsplan basierend auf km-Stand
 * 
 * Body: { fahrzeug: "Fahrzeugtyp", kmStand: 45000, alter: 3 }
 * 
 * Beispiel:
 * {
 *   "fahrzeug": "Citroën C3 1.2 PureTech",
 *   "kmStand": 45000,
 *   "alter": 3
 * }
 */
router.post('/wartungsplan', aiController.getWartungsplan);

// =============================================================================
// VIN-DECODER (Fahrgestellnummer)
// =============================================================================

/**
 * POST /api/ai/vin-decode
 * Dekodiert eine Fahrgestellnummer (VIN) und liefert Fahrzeugdaten
 * 
 * Body: { vin: "17-stellige VIN" }
 * 
 * Beispiel:
 * {
 *   "vin": "VF7SX5FS5GW123456"
 * }
 * 
 * Liefert: Hersteller, Modell, Motor, Baujahr, Öl-Spezifikation, Teile-Hinweise
 */
router.post('/vin-decode', aiController.decodeVIN);

/**
 * POST /api/ai/vin-teile-check
 * Prüft Teile-Kompatibilität basierend auf VIN und geplanter Arbeit
 * 
 * Body: { vin: "VIN", arbeit: "Arbeitsbeschreibung" }
 * 
 * Beispiel:
 * {
 *   "vin": "VF7SX5FS5GW123456",
 *   "arbeit": "Stabilisator-Koppelstangen wechseln"
 * }
 * 
 * Liefert: Warnungen zu verschiedenen Teile-Varianten, OE-Nummern
 */
router.post('/vin-teile-check', aiController.checkTeileKompatibilitaet);

// =============================================================================
// TRAINING DATA MANAGEMENT
// =============================================================================

/**
 * GET /api/ai/training-data
 * Liefert Übersicht der Trainingsdaten mit Statistiken und Ausreißer-Erkennung
 */
router.get('/training-data', aiController.getTrainingData);

/**
 * POST /api/ai/training-data/:id/exclude
 * Schließt einen einzelnen Termin vom Training aus/ein
 *
 * Body: { exclude: true/false, note: "Grund" }
 */
router.post('/training-data/:id/exclude', aiController.excludeFromTraining);

/**
 * POST /api/ai/training-data/exclude-outliers
 * Schließt alle erkannten Ausreißer automatisch vom Training aus
 */
router.post('/training-data/exclude-outliers', aiController.excludeAllOutliers);

/**
 * POST /api/ai/retrain
 * Erzwingt Neutraining des KI-Modells
 */
router.post('/retrain', aiController.retrainModel);

/**
 * POST /api/ai/external/retrain
 * Erzwingt Neutraining des externen KI-Modells
 */
router.post('/external/retrain', aiController.retrainExternalModel);

// =============================================================================
// EXPORT
// =============================================================================

module.exports = router;
