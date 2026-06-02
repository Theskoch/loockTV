const { pool } = require('./db');

function setupSocket(io) {
  io.on('connection', async (socket) => {
    const apiKey = socket.handshake.auth.apiKey;
    if (!apiKey) {
      socket.disconnect();
      return;
    }

    const result = await pool.query('SELECT id FROM screens WHERE api_key = $1', [apiKey]);
    if (result.rowCount === 0) {
      socket.disconnect();
      return;
    }

    const screenId = result.rows[0].id;
    socket.join(`screen:${screenId}`);

    await pool.query('UPDATE screens SET last_seen = NOW() WHERE id = $1', [screenId]);

    const heartbeat = setInterval(async () => {
      await pool.query('UPDATE screens SET last_seen = NOW() WHERE id = $1', [screenId]);
    }, 30000);

    socket.on('disconnect', () => {
      clearInterval(heartbeat);
    });
  });
}

module.exports = { setupSocket };
