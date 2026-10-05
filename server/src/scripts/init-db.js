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

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await root.query(`USE \`${config.db.database}\``);
  console.log(`Base de datos "${config.db.database}" lista.`);

  // 2. Aplica el esquema.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await root.query(schema);
  console.log('Esquema aplicado.');

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
