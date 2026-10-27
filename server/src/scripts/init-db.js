// Crea la base de datos (si no existe), aplica el esquema y crea el usuario
// administrador inicial. Uso: npm run db:init
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Conecta sin seleccionar base de datos para poder crearla.
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  // En local (root WAMP) se crea la BD si falta. En hosting compartido el
  // usuario MySQL no puede crear bases de datos: se crea desde el panel
  // (cPanel) y aquí simplemente la usamos.
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (e) {
    console.warn(
      `No se pudo crear la BD (${e.message}). Se asume que ya existe (hosting compartido).`
    );
  }
  await root.query(`USE \`${config.db.database}\``);
  console.log(`Base de datos "${config.db.database}" lista.`);

  // 2. Aplica el esquema.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await root.query(schema);
  console.log('Esquema aplicado.');

  // Migración idempotente: si la tabla games ya existía sin series_id
  // (versión anterior), añade la columna y su clave foránea.
  const [cols] = await root.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'games' AND column_name = 'series_id'`,
    [config.db.database]
  );
  if (cols[0].n === 0) {
    await root.query('ALTER TABLE games ADD COLUMN series_id INT NULL AFTER group_id');
    await root.query(
      `ALTER TABLE games ADD CONSTRAINT fk_games_series
         FOREIGN KEY (series_id) REFERENCES playoff_series(id) ON DELETE CASCADE`
    );
    console.log('Migración: columna games.series_id añadida.');
  }

  // Migración idempotente: columna games.game_time (horario del juego).
  const [timeCols] = await root.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'games' AND column_name = 'game_time'`,
    [config.db.database]
  );
  if (timeCols[0].n === 0) {
    await root.query('ALTER TABLE games ADD COLUMN game_time TIME NULL AFTER game_date');
    console.log('Migración: columna games.game_time añadida.');
  }

  // Migración idempotente: columna teams.logo_url (logos de equipos).
  const [logoCols] = await root.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'teams' AND column_name = 'logo_url'`,
    [config.db.database]
  );
  if (logoCols[0].n === 0) {
    await root.query('ALTER TABLE teams ADD COLUMN logo_url VARCHAR(500) NULL AFTER color');
    console.log('Migración: columna teams.logo_url añadida.');
  }

  // Migración idempotente: columna players.carnet (carné de identidad).
  const [carnetCols] = await root.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'players' AND column_name = 'carnet'`,
    [config.db.database]
  );
  if (carnetCols[0].n === 0) {
    await root.query('ALTER TABLE players ADD COLUMN carnet VARCHAR(11) NULL AFTER name');
    await root.query('ALTER TABLE players ADD INDEX idx_players_carnet (carnet)');
    console.log('Migración: columna players.carnet añadida.');
  }

  // 3. Crea el usuario admin si no existe.
  const hash = await bcrypt.hash(config.admin.password, 10);
  await root.query(
    `INSERT INTO users (username, password_hash, role)
       VALUES (?, ?, 'admin')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [config.admin.user, hash]
  );
  console.log(`Usuario admin "${config.admin.user}" listo (clave: la de ADMIN_PASSWORD).`);

  await root.end();
  console.log('Listo. Ejecuta "npm run db:seed" para datos de ejemplo (opcional).');
}

main().catch((err) => {
  console.error('Error en init-db:', err.message);
  process.exit(1);
});
