const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.admin = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// For endpoints loaded via <img src> / <a href> where the Authorization header
// can't be set — accepts the JWT from the ?token= query param (header still wins).
function adminAuthQuery(req, res, next) {
  const header = req.headers.authorization;
  const token = (header && header.startsWith('Bearer ')) ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function signAdminToken(adminId) {
  return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { adminAuth, adminAuthQuery, signAdminToken, JWT_SECRET };
