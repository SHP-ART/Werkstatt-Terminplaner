const TabletModel = require('../models/tabletModel');

/**
 * GET /api/tablet/einstellungen
 * Liefert die aktuellen Tablet-Display-Einstellungen
 */
exports.getEinstellungen = async (req, res) => {
  try {
    const einstellungen = await TabletModel.getEinstellungen();
    res.json(einstellungen);
  } catch (err) {
    console.error('Fehler beim Abrufen der Tablet-Einstellungen:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Abrufen der Einstellungen' });
  }
};

/**
 * PUT /api/tablet/einstellungen
 * Aktualisiert die Tablet-Display-Einstellungen
 * Body: { display_ausschaltzeit, display_einschaltzeit, manueller_display_status }
 */
exports.updateEinstellungen = async (req, res) => {
  const { display_ausschaltzeit, display_einschaltzeit, manueller_display_status } = req.body;

  // Validierung
  if (!display_ausschaltzeit && !display_einschaltzeit && !manueller_display_status) {
    return res.status(400).json({ error: 'Mindestens ein Feld muss angegeben werden' });
  }

  // Zeit-Format validieren (HH:MM)
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (display_ausschaltzeit && !timeRegex.test(display_ausschaltzeit)) {
    return res.status(400).json({ error: 'Ungültiges Format für display_ausschaltzeit (erwartet HH:MM)' });
  }
  if (display_einschaltzeit && !timeRegex.test(display_einschaltzeit)) {
    return res.status(400).json({ error: 'Ungültiges Format für display_einschaltzeit (erwartet HH:MM)' });
  }

  // Status validieren
  if (manueller_display_status && !['auto', 'an', 'aus'].includes(manueller_display_status)) {
    return res.status(400).json({ error: 'Ungültiger manueller_display_status (auto, an oder aus erwartet)' });
  }

  try {
    await TabletModel.updateEinstellungen(req.body);
    const einstellungen = await TabletModel.getEinstellungen();
    res.json(einstellungen);
  } catch (err) {
    console.error('Fehler beim Aktualisieren der Tablet-Einstellungen:', err);
    res.status(500).json({ error: 'Datenbankfehler beim Speichern der Einstellungen' });
  }
};

/**
 * PUT /api/tablet/display-manuell
 * Setzt den manuellen Display-Status (an/aus/auto)
 * Body: { status: 'auto' | 'an' | 'aus' }
 */
exports.setDisplayManuell = async (req, res) => {
  const { status } = req.body;

  if (!status || !['auto', 'an', 'aus'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status (auto, an oder aus erwartet)' });
  }

  try {
    await TabletModel.setDisplayManuell(status);
    res.json({ 
      success: true, 
      manueller_display_status: status,
      message: `Display-Status auf '${status}' gesetzt` 
    });
  } catch (err) {
    console.error('Fehler beim Setzen des Display-Status:', err);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
};

module.exports = exports;
