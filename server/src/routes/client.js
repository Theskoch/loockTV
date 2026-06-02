const router = require('express').Router();
const { pool } = require('../db');
const { screenAuth } = require('../middleware/screenAuth');

// Client connects and gets its current playlist
router.get('/playlist', screenAuth, async (req, res) => {
  const screen = req.screen;

  if (!screen.current_playlist_id) {
    return res.json({ playlist: null, override: null });
  }

  const items = await pool.query(`
    SELECT pi.id, pi.duration_seconds, pi.sort_order,
      c.id AS content_id, c.name, c.type, c.file_path, c.url, c.mime_type, c.size_bytes
    FROM playlist_items pi
    JOIN content c ON c.id = pi.content_id
    WHERE pi.playlist_id = $1
    ORDER BY pi.sort_order ASC
  `, [screen.current_playlist_id]);

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
    playlist_id: screen.current_playlist_id,
    items: items.rows,
    override: override.rows[0] || null,
  });
});

router.get('/info', screenAuth, (req, res) => {
  res.json({ screen_id: req.screen.id, name: req.screen.name });
});

module.exports = router;
