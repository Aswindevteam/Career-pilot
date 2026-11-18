const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const JobProfileSchema = new mongoose.Schema({
  label: { type: String, default: 'My Profile' }, // e.g. "Backend Engineer", "Data Analyst"
  role: String,
  skills: [String],
  cities: [String],
  isActive: { type: Boolean, default: false }
}, { _id: true });

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  name: String,
  // legacy single-role fields (kept for backwards compat, synced from active jobProfile)
  role: { type: String, default: '' },
  cities: [String],
  skills: [String],
  jobProfiles: { type: [JobProfileSchema], default: [] },
  isAdmin: { type: Boolean, default: false },
  resumeText: String,
  resumeFile: {
    originalName: String,
    storedName: String,   // filename on disk under uploads/resumes/
    mimetype: String,
    size: Number,
    uploadedAt: Date
  },
  portals: {
    naukri: { email: String, passwordEnc: String },
    shine: { email: String, passwordEnc: String },
    linkedin: { email: String, passwordEnc: String },
    indeed: { email: String, passwordEnc: String },
    hirist: { email: String, passwordEnc: String }
  },
  gmailRefreshToken: String,
  settings: {
    minMatch: { type: Number, default: 75 },
    dailyCap: { type: Number, default: 50 },
    autoApply: { type: Boolean, default: false }
  }
}, { timestamps: true });

UserSchema.methods.setPassword = async function (pw) { this.passwordHash = await bcrypt.hash(pw, 10); };
UserSchema.methods.checkPassword = function (pw) { return bcrypt.compare(pw, this.passwordHash); };
module.exports = mongoose.model('User', UserSchema);
