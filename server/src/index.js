const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initSchema, seedAdmin } = require('./db');
const { setupSocket } = require('./socket');

const adminRoutes = require('./routes/admin');
const screensRoutes = require('./routes/screens');
const playlistsRoutes = require('./routes/playlists');
const contentRoutes = require('./routes/content');
const clientRoutes = require('./routes/client');
const { screenAuth } = require('./middleware/screenAuth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.set('io', io);

app.use(cors());
app.use(express.json());

// File download for screens — must be before content router (which has its own /file/:filename for admin)
app.get('/api/content/file/:filename', screenAuth, (req, res) => {
  const filePath = path.join(
    process.env.UPLOADS_DIR || path.join(__dirname, '../../data/uploads'),
    req.params.filename
  );
  res.sendFile(filePath);
});

// Admin API
app.use('/api/admin', adminRoutes);
app.use('/api/screens', screensRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/content', contentRoutes);

// Client API (screen devices)
app.use('/api/client', clientRoutes);

// Serve admin UI static files
const uiPath = path.join(__dirname, '../admin-ui/dist');
app.use(express.static(uiPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(uiPath, 'index.html'));
});

setupSocket(io);

const PORT = parseInt(process.env.PORT || '3000');

async function start() {
  try {
    await initSchema();
    await seedAdmin();
    server.listen(PORT, () => {
      console.log(`LoockIT server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();
