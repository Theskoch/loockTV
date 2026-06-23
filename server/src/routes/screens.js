const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { adminAuth, adminAuthQuery } = require('../middleware/auth');

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || path.join(__dirname, '../../../data/screenshots');

// In-memory live-view sessions: screenId -> auto-stop timeout. Single server instance.
const liveSessions = new Map();
const LIVE_TIMEOUT_MS = 120000; // auto-stop live if admin stops sending keepalive

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex'); // 48 hex chars
}

router.get('/', adminAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, p.name AS playlist_name,
      CASE WHEN s.last_seen > NOW() - INTERVAL '1 minute' THEN true ELSE false END AS online
    FROM screens s
    LEFT JOIN playlists p ON p.id = s.current_playlist_id
    ORDER BY s.created_at DESC
  `);
  res.json(rows);
});

router.get('/:id', adminAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, p.name AS playlist_name,
      CASE WHEN s.last_seen > NOW() - INTERVAL '1 minute' THEN true ELSE false END AS online
    FROM screens s
    LEFT JOIN playlists p ON p.id = s.current_playlist_id
    WHERE s.id = $1
  `, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.get('/:id/overrides', adminAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT so.*, c.name, c.type, c.file_path, c.url
    FROM screen_overrides so
    JOIN content c ON c.id = so.content_id
    WHERE so.screen_id = $1
    ORDER BY so.start_at DESC
  `, [req.params.id]);
  res.json(rows);
});

// ── Screen capture (preview thumbnail + live view) ──────────────────
router.get('/:id/screenshot', adminAuthQuery, (req, res) => {
  const file = path.join(SCREENSHOTS_DIR, `${req.params.id}.jpg`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No screenshot yet' });
  res.set('Cache-Control', 'no-store');
  res.sendFile(file);
});

// Start/stop live view: tells the screen to capture fast (start) or revert to idle (stop).
// While the admin keeps the live view open it re-POSTs active:true as a keepalive;
// if keepalive stops, the server auto-stops after LIVE_TIMEOUT_MS.
router.post('/:id/live', adminAuth, (req, res) => {
  const { active } = req.body;
  const io = req.app.get('io');
  const id = req.params.id;

  if (active) {
    io.to(`screen:${id}`).emit('screen:live:start');
    if (liveSessions.has(id)) clearTimeout(liveSessions.get(id));
    liveSessions.set(id, setTimeout(() => {
      io.to(`screen:${id}`).emit('screen:live:stop');
      liveSessions.delete(id);
    }, LIVE_TIMEOUT_MS));
  } else {
    if (liveSessions.has(id)) { clearTimeout(liveSessions.get(id)); liveSessions.delete(id); }
    io.to(`screen:${id}`).emit('screen:live:stop');
  }
  res.json({ ok: true });
});

// ── Playlist schedules (time-based playlist switching) ──────────────
router.get('/:id/schedules', adminAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT sps.id, sps.playlist_id, sps.start_time, sps.end_time, p.name AS playlist_name
    FROM screen_playlist_schedules sps
    JOIN playlists p ON p.id = sps.playlist_id
    WHERE sps.screen_id = $1
    ORDER BY sps.start_time ASC
  `, [req.params.id]);
  res.json(rows);
});

router.post('/:id/schedule', adminAuth, async (req, res) => {
  const { playlist_id, start_time, end_time } = req.body;
  if (!playlist_id || !start_time || !end_time) return res.status(400).json({ error: 'Missing fields' });

  const { rows } = await pool.query(
    'INSERT INTO screen_playlist_schedules (screen_id, playlist_id, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.id, playlist_id, start_time, end_time]
  );

  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('playlist:update');

  res.status(201).json(rows[0]);
});

router.delete('/:id/schedule/:sid', adminAuth, async (req, res) => {
  await pool.query('DELETE FROM screen_playlist_schedules WHERE id = $1 AND screen_id = $2', [req.params.sid, req.params.id]);
  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('playlist:update');
  res.json({ ok: true });
});

router.post('/:id/reboot', adminAuth, async (req, res) => {
  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('screen:reboot');
  res.json({ ok: true });
});

router.post('/:id/update', adminAuth, async (req, res) => {
  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('screen:update');
  res.json({ ok: true });
});

router.post('/', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const api_key = generateApiKey();
  const { rows } = await pool.query(
    'INSERT INTO screens (name, api_key) VALUES ($1, $2) RETURNING *',
    [name, api_key]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', adminAuth, async (req, res) => {
  const { name, current_playlist_id } = req.body;
  const updates = [];
  const values = [];
  let i = 1;

  if (name !== undefined) { updates.push(`name = $${i++}`); values.push(name); }
  if (current_playlist_id !== undefined) { updates.push(`current_playlist_id = $${i++}`); values.push(current_playlist_id || null); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE screens SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

  // Notify screen via socket if playlist changed
  if (current_playlist_id !== undefined) {
    const io = req.app.get('io');
    io.to(`screen:${req.params.id}`).emit('playlist:update');
  }

  res.json(rows[0]);
});

router.post('/:id/regenerate-key', adminAuth, async (req, res) => {
  const api_key = generateApiKey();
  const { rows } = await pool.query(
    'UPDATE screens SET api_key = $1 WHERE id = $2 RETURNING *',
    [api_key, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/:id/override', adminAuth, async (req, res) => {
  const { content_id, start_at, end_at } = req.body;
  if (!content_id || !start_at || !end_at) return res.status(400).json({ error: 'Missing fields' });

  const { rows } = await pool.query(
    'INSERT INTO screen_overrides (screen_id, content_id, start_at, end_at) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.id, content_id, start_at, end_at]
  );

  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('override:update');

  res.status(201).json(rows[0]);
});

router.delete('/:id/override/:oid', adminAuth, async (req, res) => {
  await pool.query('DELETE FROM screen_overrides WHERE id = $1 AND screen_id = $2', [req.params.oid, req.params.id]);
  const io = req.app.get('io');
  io.to(`screen:${req.params.id}`).emit('override:update');
  res.json({ ok: true });
});

router.delete('/:id', adminAuth, async (req, res) => {
  await pool.query('DELETE FROM screens WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
