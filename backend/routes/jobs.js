const express = require('express');
const auth = require('../middleware/auth');
const Job = require('../models/Job');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const { portal, minMatch } = req.query;
  const q = {};
  if (portal) q.portal = portal;
  if (minMatch) q.matchScore = { $gte: Number(minMatch) };
  const jobs = await Job.find(q).sort({ createdAt: -1 }).limit(200);
  res.json(jobs);
});

router.post('/', auth, async (req, res) => {
  const job = await Job.create(req.body);
  res.json(job);
});

module.exports = router;
