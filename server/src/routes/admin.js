const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { adminAuth, signAdminToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const result = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
  if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid credentials' });

  const admin = result.rows[0];
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  res.json({ token: signAdminToken(admin.id) });
});

router.get('/me', adminAuth, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
