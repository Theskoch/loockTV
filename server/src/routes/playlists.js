const router = require('express').Router();
const { pool } = require('../db');
const { adminAuth } = require('../middleware/auth');

router.get('/', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM playlists ORDER BY created_at DESC');
  res.json(rows);
});

router.get('/:id', adminAuth, async (req, res) => {
  const pl = await pool.query('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
  if (pl.rowCount === 0) return res.status(404).json({ error: 'Not found' });

  const items = await pool.query(`
    SELECT pi.*, c.name, c.type, c.file_path, c.url, c.mime_type, c.size_bytes
    FROM playlist_items pi
    JOIN content c ON c.id = pi.content_id
    WHERE pi.playlist_id = $1
    ORDER BY pi.sort_order ASC
  `, [req.params.id]);

  res.json({ ...pl.rows[0], items: items.rows });
});

router.post('/', adminAuth, async (req, res) => {
  const { name, items } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO playlists (name) VALUES ($1) RETURNING *', [name]);
    const playlist = rows[0];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await client.query(
          'INSERT INTO playlist_items (playlist_id, content_id, duration_seconds, sort_order) VALUES ($1, $2, $3, $4)',
          [playlist.id, item.content_id, item.duration_seconds || 10, i]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(playlist);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.put('/:id', adminAuth, async (req, res) => {
  const { name, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (name) {
      await client.query('UPDATE playlists SET name = $1 WHERE id = $2', [name, req.params.id]);
    }

    if (items !== undefined) {
      await client.query('DELETE FROM playlist_items WHERE playlist_id = $1', [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await client.query(
          'INSERT INTO playlist_items (playlist_id, content_id, duration_seconds, sort_order) VALUES ($1, $2, $3, $4)',
          [req.params.id, item.content_id, item.duration_seconds || 10, i]
        );
      }
    }

    await client.query('COMMIT');

    // Notify all screens using this playlist
    const screens = await pool.query('SELECT id FROM screens WHERE current_playlist_id = $1', [req.params.id]);
    const io = req.app.get('io');
    for (const screen of screens.rows) {
      io.to(`screen:${screen.id}`).emit('playlist:update');
    }

    const updated = await pool.query('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.delete('/:id', adminAuth, async (req, res) => {
  await pool.query('DELETE FROM playlists WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
