// Automatische API-Erkennung für All-in-One Modus
// Wenn die Seite von einem Server geladen wird (nicht file://), nutze dessen IP
function detectServerFromLocation() {
  // Prüfe ob wir von einem HTTP-Server geladen wurden
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const hostname = window.location.hostname;
    // Wenn nicht localhost und nicht 127.0.0.1, dann sind wir im All-in-One Modus
    // und sollten den gleichen Host für die API nutzen
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // Prüfe ob wir vom Port 3001 geladen wurden (All-in-One)
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      if (port === '3001') {
        return { ip: hostname, port: port, detected: true };
      }
    }
    // Auch bei localhost:3001 nutze localhost
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && window.location.port === '3001') {
      return { ip: hostname, port: '3001', detected: true };
    }
  }
  return null;
}

// Funktion zum Abrufen der Server-Konfiguration
function getServerConfig() {
  // Zuerst versuchen, den Server automatisch zu erkennen (All-in-One Modus)
  const autoDetected = detectServerFromLocation();
  
  if (autoDetected && autoDetected.detected) {
    // Im All-in-One Modus: Nutze die erkannte Server-Adresse
    // Speichere sie auch im localStorage für Konsistenz
    if (!localStorage.getItem('server_auto_detected') || 
        localStorage.getItem('server_ip') !== autoDetected.ip) {
      localStorage.setItem('server_ip', autoDetected.ip);
      localStorage.setItem('server_port', autoDetected.port);
      localStorage.setItem('server_auto_detected', 'true');
    }
    return {
      ip: autoDetected.ip,
      port: autoDetected.port,
      url: `http://${autoDetected.ip}:${autoDetected.port}/api`,
      autoDetected: true
    };
  }

  // Fallback: Manuell gespeicherte Konfiguration
  const savedIP = localStorage.getItem('server_ip');
  const savedPort = localStorage.getItem('server_port') || '3001';

  // Standard: localhost, falls nichts gespeichert ist
  const serverIP = savedIP || 'localhost';

  return {
    ip: serverIP,
    port: savedPort,
    url: `http://${serverIP}:${savedPort}/api`,
    autoDetected: false
  };
}

// Funktion zum Speichern der Server-Konfiguration
function setServerConfig(ip, port) {
  localStorage.setItem('server_ip', ip);
  localStorage.setItem('server_port', port);
  localStorage.removeItem('server_auto_detected'); // Manuelle Konfiguration
  // Seite neu laden, damit die neue Konfiguration aktiv wird
  window.location.reload();
}

// Konfigurationsobjekt
const CONFIG = {
  get API_URL() {
    const serverConfig = getServerConfig();
    return serverConfig.url;
  },
  getServerConfig,
  setServerConfig
};

// Debug-Ausgabe beim Laden
console.log('Server-Konfiguration:', getServerConfig());
