const { pool } = require('../db');

async function screenAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing API key' });

  const result = await pool.query('SELECT * FROM screens WHERE api_key = $1', [key]);
  if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid API key' });

  req.screen = result.rows[0];
  await pool.query('UPDATE screens SET last_seen = NOW() WHERE id = $1', [req.screen.id]);
  next();
}

module.exports = { screenAuth };
