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

router.get('/latest-version', adminAuth, async (req, res) => {
  try {
    const headers = { 'User-Agent': 'LoockIT-Server/1.0' };
    if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch('https://api.github.com/repos/Theskoch/loockTV/releases/latest', { headers });
    if (!r.ok) {
      const text = await r.text();
      console.error(`[latest-version] GitHub API error ${r.status}: ${text}`);
      return res.json({ version: null, error: `GitHub ${r.status}` });
    }
    const data = await r.json();
    res.json({ version: data.tag_name?.replace(/^v/, '') || null });
  } catch (e) {
    console.error('[latest-version] fetch error:', e.message);
    res.json({ version: null, error: e.message });
  }
});

module.exports = router;
