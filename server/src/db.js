import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  decimalNumbers: true,
});

// En desarrollo (WAMP) MySQL corre con sql_mode vacío; MySQL 8 en producción
// trae ONLY_FULL_GROUP_BY y modo estricto por defecto, lo que rompe las
// consultas con GROUP BY. Igualamos cada conexión del pool al modo de dev.
pool.pool.on('connection', (conn) => {
  conn.query("SET SESSION sql_mode = ''", () => {});
});

// Helper: ejecuta dentro de una transacción.
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
