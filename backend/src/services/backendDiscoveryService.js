let mdns = null;
let advertisement = null;
let started = false;

function start(port) {
  if (started) return;
  started = true;

  if (process.env.BACKEND_DISCOVERY_ENABLED === '0') {
    return;
  }

  try {
    mdns = require('mdns-js');
  } catch (err) {
    console.warn('⚠️ Backend mDNS nicht verfuegbar (mdns-js fehlt).');
    return;
  }

  try {
    advertisement = mdns.createAdvertisement(mdns.tcp('werkstatt-backend'), port, {
      name: 'Werkstatt-Server'
    });
    advertisement.start();
    console.log(`✅ Backend mDNS aktiv (_werkstatt-backend._tcp, Port ${port})`);
  } catch (err) {
    console.warn('⚠️ Backend mDNS Start fehlgeschlagen:', err.message);
  }
}

function stop() {
  if (advertisement && typeof advertisement.stop === 'function') {
    try {
      advertisement.stop();
    } catch (err) {
      // ignorieren
    }
  }
  advertisement = null;
  started = false;
}

module.exports = {
  start,
  stop
};
