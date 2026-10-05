import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { attachUser } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import leagueRoutes from './routes/leagues.js';
import teamRoutes from './routes/teams.js';
import playerRoutes from './routes/players.js';
import gameRoutes from './routes/games.js';

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

// Manejo centralizado de errores.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno', detail: err.message });
});

app.listen(config.port, () => {
  console.log(`API Pelota escuchando en http://localhost:${config.port}`);
});
