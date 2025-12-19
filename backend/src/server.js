require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

initializeDatabase();

app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend-Server läuft auf http://0.0.0.0:${PORT}`);
  console.log(`API-Endpoint: http://0.0.0.0:${PORT}/api`);
  console.log(`Zugriff im Netzwerk: http://<IP-ADRESSE>:${PORT}`);
});
