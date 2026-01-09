// Zentrale Versionsverwaltung für Werkstatt-Terminplaner
// Diese Datei ist die "Single Source of Truth" für die Programmversion

const VERSION = '1.1.1';

module.exports = {
  VERSION,
  // Zusätzliche Metadaten
  APP_NAME: 'Werkstatt Terminplaner',
  RELEASE_DATE: '2026-01-09',
  
  // Hilfsfunktion für formatierte Ausgabe
  getVersionString: () => `v${VERSION}`,
  getFullVersionString: () => `${module.exports.APP_NAME} v${VERSION}`
};
