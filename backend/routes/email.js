const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { draft, sendOne } = require('../services/emailService');
const router = express.Router();

// create a draft (no send) for review
router.post('/draft', auth, async (req, res) => {
  const { to, subject, body } = req.body;
  res.json(draft({ to, subject, body }));
});

// send after explicit approval
router.post('/send', auth, async (req, res) => {
  const { confirm, to, subject, body } = req.body;
  if (confirm !== true) return res.status(400).json({ error: 'confirm:true required (review before send)' });
  const u = await User.findById(req.user.id);
  if (!u?.gmailRefreshToken) return res.status(400).json({ error: 'Gmail not connected' });
  const info = await sendOne({ refreshToken: u.gmailRefreshToken, to, subject, body });
  res.json({ sent: true, messageId: info.messageId });
});

router.get('/stats', auth, async (req, res) => res.json({ sent: 0, opened: 0 }));
module.exports = router;
