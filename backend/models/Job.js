const mongoose = require('mongoose');
const JobSchema = new mongoose.Schema({
  title: String,
  company: String,
  location: String,
  portal: { type: String, enum: ['naukri','shine','linkedin','indeed','hirist','company','other'] },
  url: String,
  description: String,
  skills: [String],
  salary: String,
  matchScore: Number,
  source: String
}, { timestamps: true });
module.exports = mongoose.model('Job', JobSchema);
