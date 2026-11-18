const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Parse resume and extract structured fields (no auth required — also used at registration)
router.post('/parse-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let text = '';
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      text = req.file.buffer.toString('utf8');
    }

    // --- simple regex-based extractor ---
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Name: first non-empty line that looks like a name (no @, no digits run, short)
    let name = '';
    for (const l of lines) {
      if (l.length < 60 && !/[@\d{3,}|http]/.test(l) && /^[A-Z][a-zA-Z .'-]{2,}$/.test(l)) { name = l; break; }
    }

    // Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : '';

    // Role / title — look for common title keywords
    const titleKw = ['developer','engineer','designer','analyst','manager','architect','consultant','specialist','lead','intern','scientist','devops','sre','qa','tester','product','frontend','backend','fullstack','full stack','full-stack','mobile'];
    let role = '';
    for (const l of lines) {
      const ll = l.toLowerCase();
      if (titleKw.some(k => ll.includes(k)) && l.length < 80) { role = l.replace(/^[-•*]\s*/, ''); break; }
    }

    // Skills — match against known list
    const KNOWN_SKILLS = ['JavaScript','TypeScript','React','Angular','Vue','Node.js','Express','Python','Django','Flask','Java','Spring','C#','.NET','Go','Rust','PHP','Laravel','Ruby','Rails','SQL','PostgreSQL','MySQL','MongoDB','Redis','Docker','Kubernetes','AWS','GCP','Azure','Git','Linux','HTML','CSS','Tailwind','Bootstrap','Redux','GraphQL','REST','Microservices','Kafka','RabbitMQ','Jenkins','CI/CD','Terraform','Machine Learning','TensorFlow','PyTorch','Pandas','NumPy','Figma'];
    const textLower = text.toLowerCase();
    const skills = KNOWN_SKILLS.filter(s => textLower.includes(s.toLowerCase()));

    // Cities — look for Indian cities
    const CITIES = ['Bangalore','Bengaluru','Chennai','Mumbai','Delhi','Hyderabad','Pune','Kolkata','Ahmedabad','Jaipur','Lucknow','Chandigarh','Noida','Gurgaon','Kochi','Coimbatore','Mysore','Surat','Vadodara'];
    const cities = CITIES.filter(c => text.includes(c));

    res.json({ name, email, role, skills, cities, rawText: text.slice(0, 8000) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.user.id);
  // ── auto-migrate legacy single-role fields → jobProfiles ──
  if ((!u.jobProfiles || u.jobProfiles.length === 0) && (u.role || (u.skills && u.skills.length))) {
    u.jobProfiles.push({
      label: 'Primary Profile',
      role: u.role || '',
      skills: u.skills || [],
      cities: u.cities || [],
      isActive: true
    });
    await u.save();
  }
  const out = u.toObject();
  delete out.passwordHash;
  res.json(out);
});

router.patch('/me', auth, async (req, res) => {
  const u = await User.findByIdAndUpdate(req.user.id, req.body, { new: true }).select('-passwordHash');
  res.json(u);
});

// ── Job Profiles ──

// Add a new job profile
router.post('/me/job-profiles', auth, async (req, res) => {
  const { label, role, skills, cities } = req.body;
  const u = await User.findById(req.user.id);
  const isFirst = u.jobProfiles.length === 0;
  u.jobProfiles.push({ label: label || 'New Profile', role: role || '', skills: skills || [], cities: cities || [], isActive: isFirst });
  if (isFirst) { u.role = role || ''; u.skills = skills || []; u.cities = cities || []; }
  await u.save();
  res.json(u.jobProfiles);
});

// Update a job profile
router.patch('/me/job-profiles/:profileId', auth, async (req, res) => {
  const u = await User.findById(req.user.id);
  const prof = u.jobProfiles.id(req.params.profileId);
  if (!prof) return res.status(404).json({ error: 'Not found' });
  const { label, role, skills, cities, isActive } = req.body;
  if (label !== undefined) prof.label = label;
  if (role !== undefined) prof.role = role;
  if (skills !== undefined) prof.skills = skills;
  if (cities !== undefined) prof.cities = cities;
  // setting active — deactivate others
  if (isActive) {
    u.jobProfiles.forEach(p => { p.isActive = p._id.toString() === req.params.profileId; });
    u.role = prof.role; u.skills = prof.skills; u.cities = prof.cities;
  }
  await u.save();
  res.json(u.jobProfiles);
});

// Delete a job profile
router.delete('/me/job-profiles/:profileId', auth, async (req, res) => {
  const u = await User.findById(req.user.id);
  u.jobProfiles = u.jobProfiles.filter(p => p._id.toString() !== req.params.profileId);
  // if deleted was active, activate first remaining
  if (!u.jobProfiles.some(p => p.isActive) && u.jobProfiles.length) {
    u.jobProfiles[0].isActive = true;
    u.role = u.jobProfiles[0].role; u.skills = u.jobProfiles[0].skills; u.cities = u.jobProfiles[0].cities;
  }
  await u.save();
  res.json(u.jobProfiles);
});

// Save resume text after upload (authenticated) — also stores the file on disk
router.post('/me/resume', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    // Extract text
    let text = '';
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      text = data.text;
    } else {
      text = req.file.buffer.toString('utf8');
    }

    // Save file to disk: uploads/resumes/<userId>.<ext>
    const path = require('path');
    const fs = require('fs');
    const ext = req.file.mimetype === 'application/pdf' ? '.pdf' : '.txt';
    const storedName = req.user.id + ext;
    const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, storedName), req.file.buffer);

    const u = await User.findByIdAndUpdate(req.user.id, {
      resumeText: text,
      resumeFile: {
        originalName: req.file.originalname,
        storedName,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date()
      }
    }, { new: true }).select('-passwordHash');

    res.json({ ok: true, length: text.length, resumeFile: u.resumeFile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download resume file
router.get('/me/resume/download', auth, async (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const u = await User.findById(req.user.id).select('resumeFile');
  if (!u?.resumeFile?.storedName) return res.status(404).json({ error: 'No resume uploaded' });
  const filePath = path.join(__dirname, '..', 'uploads', 'resumes', u.resumeFile.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.setHeader('Content-Disposition', `attachment; filename="${u.resumeFile.originalName}"`);
  res.setHeader('Content-Type', u.resumeFile.mimetype);
  res.sendFile(filePath);
});

// Preview resume inline in browser
router.get('/me/resume/preview', auth, async (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const u = await User.findById(req.user.id).select('resumeFile');
  if (!u?.resumeFile?.storedName) return res.status(404).json({ error: 'No resume uploaded' });
  const filePath = path.join(__dirname, '..', 'uploads', 'resumes', u.resumeFile.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  res.setHeader('Content-Disposition', `inline; filename="${u.resumeFile.originalName}"`);
  res.setHeader('Content-Type', u.resumeFile.mimetype);
  res.sendFile(filePath);
});

module.exports = router;
