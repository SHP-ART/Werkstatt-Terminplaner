let wssRef = null;

function setWebSocketServer(wss) {
  wssRef = wss;
}

function broadcastEvent(event, data) {
  if (!wssRef) return;
  const message = JSON.stringify({
    event,
    data: data || null,
    ts: Date.now()
  });

  wssRef.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

module.exports = {
  setWebSocketServer,
  broadcastEvent
};
