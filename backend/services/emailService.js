// Gmail OAuth email sender with review-before-send
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

function createTransport(refreshToken) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { type: 'OAuth2', user: process.env.GMAIL_USER, clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken }
  });
}

async function sendOne({ refreshToken, to, subject, body, attachmentPath }) {
  const t = createTransport(refreshToken);
  const mail = { from: process.env.GMAIL_USER, to, subject, text: body };
  if (attachmentPath) mail.attachments = [{ path: attachmentPath }];
  return t.sendMail(mail);
}

// draft (no send) for review
function draft({ to, subject, body }) { return { to, subject, body, status: 'draft' }; }

module.exports = { createTransport, sendOne, draft };
