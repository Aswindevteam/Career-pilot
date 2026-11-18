const mongoose = require('mongoose');
const ApplicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  status: { type: String, enum: ['applied','interview','offer','rejected','skipped'], default: 'applied' },
  appliedAt: { type: Date, default: Date.now },
  portal: String,
  matchScore: Number,
  notes: String,
  emailSent: { type: Boolean, default: false },
  emailOpened: { type: Boolean, default: false },
  recruiterEmail: String
}, { timestamps: true });
ApplicationSchema.index({ user: 1, job: 1 }, { unique: true });
module.exports = mongoose.model('Application', ApplicationSchema);
require('./Job');
