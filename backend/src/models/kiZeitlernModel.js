const { runAsync } = require('../utils/dbHelper');

async function saveLernpunkt({ terminId, arbeit, kategorie, geschaetztMin, tatsaechlichMin, mitarbeiterId, datum }) {
  return runAsync(
    `INSERT INTO ki_zeitlern_daten (
      termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, mitarbeiter_id, datum
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(termin_id, arbeit) DO UPDATE SET
      kategorie = excluded.kategorie,
      geschaetzte_min = excluded.geschaetzte_min,
      tatsaechliche_min = excluded.tatsaechliche_min,
      mitarbeiter_id = excluded.mitarbeiter_id,
      datum = excluded.datum`,
    [terminId, arbeit, kategorie, geschaetztMin, tatsaechlichMin, mitarbeiterId, datum]
  );
}

module.exports = {
  saveLernpunkt
};
