const nodemailer = require('nodemailer');
const config = require('./env');

let transporter = null;

if (config.SMTP_HOST && config.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, html, text }) {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: config.SMTP_FROM,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>?/gm, ''),
      });
      console.log(`[EMAIL SENT] To: ${to} | Subject: ${subject} | ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[EMAIL ERROR] Failed to send email via SMTP:', err.message);
      // Fallback log
      logEmailFallback({ to, subject, html });
      return { success: false, error: err.message };
    }
  } else {
    logEmailFallback({ to, subject, html });
    return { success: true, simulated: true };
  }
}

function logEmailFallback({ to, subject, html }) {
  console.log('====================================================');
  console.log(`📨 [SIMULATED EMAIL DISPATCH]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Content (Snippet):`);
  console.log(html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').slice(0, 300) + '...');
  console.log('====================================================');
}

module.exports = {
  sendMail,
};
