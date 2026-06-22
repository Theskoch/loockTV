const router = require('express').Router();
const { pool } = require('../db');
const { screenAuth } = require('../middleware/screenAuth');

const TZ = process.env.APP_TIMEZONE || 'Europe/Moscow';

// Client connects and gets its current playlist
router.get('/playlist', screenAuth, async (req, res) => {
  const screen = req.screen;

  // Resolve which playlist should play right now.
  // A scheduled window (in APP_TIMEZONE) overrides the default playlist.
  // On overlapping windows the one that STARTS LATER wins (ORDER BY start_time DESC).
  // Supports overnight windows (start_time > end_time, e.g. 22:00–02:00).
  let activePlaylistId = screen.current_playlist_id;
  const sched = await pool.query(`
    SELECT playlist_id
    FROM screen_playlist_schedules
    WHERE screen_id = $1 AND (
      (start_time <= end_time AND (NOW() AT TIME ZONE $2)::time BETWEEN start_time AND end_time)
      OR
      (start_time > end_time AND ((NOW() AT TIME ZONE $2)::time >= start_time OR (NOW() AT TIME ZONE $2)::time <= end_time))
    )
    ORDER BY start_time DESC
    LIMIT 1
  `, [screen.id, TZ]);
  if (sched.rows[0]) activePlaylistId = sched.rows[0].playlist_id;

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

module.exports = router;
