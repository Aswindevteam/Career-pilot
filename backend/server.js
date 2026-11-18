require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/email', require('./routes/email'));
app.use('/api/automation', require('./routes/automation'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = process.env.PORT || 4001;
mongoose.connect(process.env.MONGO_URI || 'mongodb://admin:changeme@localhost:27017/jobagent?authSource=admin')
  .then(() => app.listen(PORT, () => console.log('Backend on', PORT)))
  .catch(err => { console.error(err); process.exit(1); });
