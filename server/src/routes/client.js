const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { screenAuth } = require('../middleware/screenAuth');

const TZ = process.env.APP_TIMEZONE || 'Europe/Moscow';
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || path.join(__dirname, '../../../data/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Client connects and gets its current playlist
router.get('/playlist', screenAuth, async (req, res) => {
  const screen = req.screen;

  // Resolve which playlist should play right now.
  // A scheduled window (in APP_TIMEZONE) overrides the default playlist.
  // On overlapping windows the one that STARTS LATER wins (ORDER BY start_time DESC).
  // Supports overnight windows (start_time > end_time, e.g. 22:00–02:00).
  let activePlaylistId = screen.current_playlist_id;
  try {
    const sched = await pool.query(`
      SELECT playlist_id
      FROM screen_playlist_schedules
      WHERE screen_id = $1 AND (
        (start_time <= end_time AND (NOW() AT TIME ZONE $2::text)::time BETWEEN start_time AND end_time)
        OR
        (start_time > end_time AND ((NOW() AT TIME ZONE $2::text)::time >= start_time OR (NOW() AT TIME ZONE $2::text)::time <= end_time))
      )
      ORDER BY start_time DESC
      LIMIT 1
    `, [screen.id, TZ]);
    if (sched.rows[0]) activePlaylistId = sched.rows[0].playlist_id;
  } catch (e) {
    // Never let schedule resolution take down the request — fall back to default playlist
    console.error('Schedule resolution failed, using default playlist:', e.message);
  }

  if (!activePlaylistId) {
    return res.json({ playlist: null, override: null });
  }

  const items = await pool.query(`
    SELECT pi.id, pi.duration_seconds, pi.sort_order,
      c.id AS content_id, c.name, c.type, c.file_path, c.url, c.mime_type, c.size_bytes
    FROM playlist_items pi
    JOIN content c ON c.id = pi.content_id
    WHERE pi.playlist_id = $1
    ORDER BY pi.sort_order ASC
  `, [activePlaylistId]);

  const override = await pool.query(`
    SELECT so.*, c.name, c.type, c.file_path, c.url
    FROM screen_overrides so
    JOIN content c ON c.id = so.content_id
    WHERE so.screen_id = $1 AND so.end_at > NOW()
    ORDER BY so.start_at DESC
    LIMIT 1
  `, [screen.id]);

  res.json({
    screen_id: screen.id,
    playlist_id: activePlaylistId,
    items: items.rows,
    override: override.rows[0] || null,
  });
});

router.get('/info', screenAuth, (req, res) => {
  res.json({ screen_id: req.screen.id, name: req.screen.name });
});

// Screen uploads a screenshot of its physical display (raw JPEG body)
router.post('/screenshot', screenAuth, express.raw({ type: 'image/jpeg', limit: '6mb' }), async (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Empty body' });
  try {
    const file = path.join(SCREENSHOTS_DIR, `${req.screen.id}.jpg`);
    fs.writeFileSync(file, req.body);
    await pool.query('UPDATE screens SET last_screenshot_at = NOW() WHERE id = $1', [req.screen.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Screenshot save failed:', e.message);
    res.status(500).json({ error: 'Save failed' });
  }
});

module.exports = router;
