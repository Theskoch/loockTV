const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lookit',
  user: process.env.DB_USER || 'lookit',
  password: process.env.DB_PASSWORD || 'lookit',
});

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function seedAdmin() {
  const bcrypt = require('bcryptjs');
  const existing = await pool.query('SELECT id FROM admin LIMIT 1');
  if (existing.rowCount === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO admin (username, password_hash) VALUES ($1, $2)', [username, hash]);
    console.log(`Admin created: ${username} / ${password}`);
  }
}

module.exports = { pool, initSchema, seedAdmin };
