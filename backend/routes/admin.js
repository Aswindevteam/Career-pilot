const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Application = require('../models/Application');
const router = express.Router();

// simple admin guard: first user or isAdmin
async function adminGuard(req, res, next) {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(403).json({ error: 'admin only' });
  const adminCount = await User.countDocuments({ isAdmin: true });
  if (!u.isAdmin && adminCount > 0) return res.status(403).json({ error: 'admin only' });
  next();
}

router.get('/users', auth, adminGuard, async (req, res) => {
  const users = await User.find().select('-passwordHash -gmailRefreshToken').sort({ createdAt: -1 });
  res.json({ count: users.length, users });
});

router.delete('/users/:id', auth, adminGuard, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot delete yourself' });
  await Application.deleteMany({ user: req.params.id });
  await User.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
