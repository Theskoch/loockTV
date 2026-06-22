const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { adminAuth } = require('../middleware/auth');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../../data/uploads');

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB
  fileFilter: (req, file, cb) => {
    const allowed = /image\/(jpeg|png|gif|webp|bmp)|video\/(mp4|webm|ogg|quicktime|x-msvideo)/;
    cb(null, allowed.test(file.mimetype));
  },
});

router.get('/', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM content ORDER BY created_at DESC');
  res.json(rows);
});

router.post('/upload', adminAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file or invalid type' });

  const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  // Duration detected client-side (browser <video>), only meaningful for video
  const dur = parseInt(req.body.duration_seconds);
  const duration = (type === 'video' && dur > 0) ? dur : null;
  const { rows } = await pool.query(
    'INSERT INTO content (name, type, file_path, mime_type, size_bytes, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [req.body.name || req.file.originalname, type, req.file.filename, req.file.mimetype, req.file.size, duration]
  );
  res.status(201).json(rows[0]);
});

router.post('/url', adminAuth, async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });

  const { rows } = await pool.query(
    'INSERT INTO content (name, type, url) VALUES ($1, $2, $3) RETURNING *',
    [name, 'url', url]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', adminAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM content WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const item = rows[0];
  if (item.file_path) {
    const fullPath = path.join(UPLOADS_DIR, item.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  await pool.query('DELETE FROM content WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Serve files (for client download)
router.get('/file/:filename', async (req, res) => {
  // Authenticated by screen API key via middleware in index.js
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

module.exports = router;
