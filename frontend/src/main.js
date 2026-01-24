/**
 * Vite Entry Point
 * Werkstatt-Terminplaner Frontend
 *
 * Dieser Entry Point lädt alle benötigten Dateien in der richtigen Reihenfolge.
 * Die globalen Variablen (CONFIG, App, app, etc.) werden für Abwärtskompatibilität
 * mit den inline onclick-Handlern beibehalten.
 */

// CSS importieren (wird automatisch gebündelt)
import './styles/style.css';

// Config importieren (definiert CONFIG global)
import '../config.js';

// API Service importieren (definiert ApiService, KundenService etc. global)
import './services/api.js';

// App importieren (erstellt die App-Instanz und setzt window.app)
import './components/app.js';

// Debug-Ausgabe in Entwicklung
if (import.meta.env.DEV) {
  console.log('🚀 Werkstatt-Terminplaner Frontend gestartet (Vite Dev Mode)');
  console.log('   API URL:', window.CONFIG?.API_URL || 'nicht konfiguriert');
}
