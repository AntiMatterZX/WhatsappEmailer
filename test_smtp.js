require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.verify();
    console.log('SMTP connection verified.');
    const info = await transporter.sendMail({
      from: `"SMTP Test" <${process.env.SMTP_USER}>`,
      to: process.env.HELPDESK_EMAIL,
      subject: 'SMTP Test Email',
      text: 'This is a test email from your WhatsApp bot SMTP configuration.'
    });
    console.log('Test email sent:', info);
  } catch (err) {
    console.error('SMTP test failed:', err);
  }
}

testEmail(); 