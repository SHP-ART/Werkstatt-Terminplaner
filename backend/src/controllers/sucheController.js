/**
 * Suche Controller
 * Globale Volltextsuche über Kunden, Fahrzeuge und Termine
 */

const { allAsync } = require('../utils/dbHelper');

async function suche(req, res) {
  const q = (req.query.q || '').trim();

  if (q.length < 2) {
    return res.status(400).json({ error: 'Suchtext muss mindestens 2 Zeichen haben' });
  }

  const pattern = `%${q}%`;

  try {
    const [kunden, fahrzeuge, termine] = await Promise.all([
      allAsync(
        `SELECT id, name, telefon, email FROM kunden
         WHERE (name LIKE ? OR telefon LIKE ? OR email LIKE ?)
         LIMIT 5`,
        [pattern, pattern, pattern]
      ),
      allAsync(
        `SELECT DISTINCT kennzeichen, vin, kunde_name
         FROM termine
         WHERE (kennzeichen LIKE ? OR vin LIKE ?) AND geloescht_am IS NULL
         LIMIT 5`,
        [pattern, pattern]
      ),
      allAsync(
        `SELECT id, termin_nr, kunde_name, arbeit, datum, status
         FROM termine
         WHERE (arbeit LIKE ? OR kunde_name LIKE ? OR termin_nr LIKE ?)
           AND geloescht_am IS NULL
         ORDER BY datum DESC
         LIMIT 5`,
        [pattern, pattern, pattern]
      )
    ]);

    res.json({ success: true, kunden, fahrzeuge, termine });
  } catch (err) {
    console.error('Fehler bei Suche:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { suche };
