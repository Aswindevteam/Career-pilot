const jwt = require('jsonwebtoken');
module.exports = function (req, res, next) {
  const h = req.headers.authorization || '';
  // accept token from Bearer header OR ?t= query param (for browser download/preview links)
  const token = (h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.t || null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'devsecret'); next(); }
  catch (e) { res.status(401).json({ error: 'invalid token' }); }
};
