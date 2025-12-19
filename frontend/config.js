// Funktion zum Abrufen der Server-Konfiguration
function getServerConfig() {
  const savedIP = localStorage.getItem('server_ip');
  const savedPort = localStorage.getItem('server_port') || '3001';

  // Standard: localhost, falls nichts gespeichert ist
  const serverIP = savedIP || 'localhost';

  return {
    ip: serverIP,
    port: savedPort,
    url: `http://${serverIP}:${savedPort}/api`
  };
}

// Funktion zum Speichern der Server-Konfiguration
function setServerConfig(ip, port) {
  localStorage.setItem('server_ip', ip);
  localStorage.setItem('server_port', port);
  // Seite neu laden, damit die neue Konfiguration aktiv wird
  window.location.reload();
}

// Konfigurationsobjekt
const CONFIG = {
  get API_URL() {
    return getServerConfig().url;
  },
  getServerConfig,
  setServerConfig
};
