/**
 * Reporting Controller
 * KPI-Daten und Berichte
 */

const reportingModel = require('../models/reportingModel');

async function getKPIs(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';
    const von = req.query.von || firstOfMonth;
    const bis = req.query.bis || today;

    const data = await reportingModel.getKPIs(von, bis);
    res.json({ success: true, von, bis, kpis: data });
  } catch (err) {
    console.error('Fehler bei getKPIs:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getMitarbeiterReport(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';
    const von = req.query.von || firstOfMonth;
    const bis = req.query.bis || today;

    const data = await reportingModel.getMitarbeiterProduktivitaet(von, bis);
    res.json({ success: true, von, bis, mitarbeiter: data });
  } catch (err) {
    console.error('Fehler bei getMitarbeiterReport:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getTrend(req, res) {
  try {
    const { kpi = 'abgeschlossen', intervall = 'monat', monate = '3' } = req.query;
    const data = await reportingModel.getTrend(kpi, intervall, monate);
    res.json({ success: true, kpi, intervall, daten: data });
  } catch (err) {
    console.error('Fehler bei getTrend:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getKPIs, getMitarbeiterReport, getTrend };
