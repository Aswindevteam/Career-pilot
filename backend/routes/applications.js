const express = require('express');
const auth = require('../middleware/auth');
const Application = require('../models/Application');
const Job = require('../models/Job');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const apps = await Application.find({ user: req.user.id })
    .populate('job').sort({ appliedAt: -1 });
  res.json(apps);
});

router.post('/', auth, async (req, res) => {
  const { jobId, portal, matchScore, recruiterEmail } = req.body;
  const app = await Application.create({
    user: req.user.id, job: jobId, portal, matchScore, recruiterEmail
  });
  res.json(app);
});

router.patch('/:id', auth, async (req, res) => {
  const app = await Application.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id }, req.body, { new: true });
  res.json(app);
});

module.exports = router;
