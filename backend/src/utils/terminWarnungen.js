function erstelleTerminWarnungen(termin) {
  const warnungen = [];
  if (termin.startzeit && termin.bring_zeit && termin.startzeit > termin.bring_zeit) {
    warnungen.push({
      code: 'bringzeit_verpasst',
      message: `Bringzeit ${termin.bring_zeit} nicht eingehalten – frühester Start ${termin.startzeit}`
    });
  }
  const abholDatumGilt = !termin.abholung_datum || termin.abholung_datum === termin.datum;
  if (abholDatumGilt && termin.endzeit_berechnet && termin.abholung_zeit &&
      termin.endzeit_berechnet > termin.abholung_zeit) {
    warnungen.push({
      code: 'abholzeit_verpasst',
      message: `Abholzeit ${termin.abholung_zeit} nicht erreichbar – fertig ca. ${termin.endzeit_berechnet}`
    });
  }
  return warnungen;
}

module.exports = { erstelleTerminWarnungen };
