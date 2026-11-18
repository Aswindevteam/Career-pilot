const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });
  try {
    const count = await User.countDocuments();
    const u = new User({ email, name, isAdmin: count === 0 });
    await u.setPassword(password);
    await u.save();
    const token = jwt.sign({ id: u._id, email: u.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '30d' });
    res.json({ token, user: { id: u._id, email: u.email, name: u.name } });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'email already registered — try sign in' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findOne({ email });
  if (!u || !(await u.checkPassword(password))) return res.status(401).json({ error: 'bad creds' });
  const token = jwt.sign({ id: u._id, email: u.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '30d' });
  res.json({ token, user: { id: u._id, email: u.email, name: u.name } });
});

module.exports = router;
