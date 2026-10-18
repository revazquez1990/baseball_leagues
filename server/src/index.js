import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { attachUser } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import leagueRoutes from './routes/leagues.js';
import teamRoutes from './routes/teams.js';
import playerRoutes from './routes/players.js';
import gameRoutes from './routes/games.js';
import playoffRoutes from './routes/playoffs.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/leagues', leagueRoutes);
// Las siguientes rutas montan rutas anidadas y planas (/teams, /players, /games).
app.use('/api', teamRoutes);
app.use('/api', playerRoutes);
app.use('/api', gameRoutes);
app.use('/api', playoffRoutes);

// --- Frontend en producción -------------------------------------------------
// Sirve el build de Vite (client/dist) desde el mismo proceso/origen que el
// API. Así en el hosting basta UNA sola app Node. Solo se activa si el build
// existe, de modo que en desarrollo (sin dist) no interfiere con Vite.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Fallback SPA: cualquier ruta que no sea /api/* devuelve index.html para
  // que React Router maneje el enrutado del lado del cliente.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`Sirviendo frontend desde ${clientDist}`);
}

// Manejo centralizado de errores.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno', detail: err.message });
});

// Red de seguridad: un error asíncrono sin capturar en un handler no debe
// tumbar todo el servidor. Se registra y el proceso sigue vivo.
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

app.listen(config.port, () => {
  console.log(`API Pelota escuchando en http://localhost:${config.port}`);
});
