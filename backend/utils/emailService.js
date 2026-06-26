// backend/utils/emailService.js
// SMTP transport + conditional sender that picks customer/employee format.
// Templates live in emailTemplate.js — this file only handles sending.

const nodemailer = require('nodemailer');
const { buildWelcomeEmail, buildEmployeeWelcomeEmail } = require('./emailTemplate');

// ─────────────────────────────────────────────────────────────────────────────
// SMTP TRANSPORT
// ─────────────────────────────────────────────────────────────────────────────
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true',          // true = port 465, false = 587
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
    tls:    { rejectUnauthorized: false },   // allow self-signed certs in dev
  });
}

function getPlatformConfig() {
  return {
    platformName: process.env.PLATFORM_NAME      || '',
    platformUrl:  process.env.PLATFORM_URL       || 'https://your-platform.com/login',
    logoUrl:      process.env.PLATFORM_LOGO      || '',
    fromName:     process.env.SMTP_FROM_NAME     || process.env.PLATFORM_NAME || '',
    fromEmail:    process.env.SMTP_USER,
    adminName:    process.env.PLATFORM_ADMIN_NAME || 'Administrator',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONAL DISPATCHER — picks customer vs employee format based on `type`
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {'customer'|'employee'} opts.type   - which template/notification format to use
 * @param {string} opts.toEmail               - recipient email
 * @param {string} [opts.name]                - customerName OR employeeName
 * @param {string} [opts.code]                - customerId (CUS-...) OR employeeCode (EMP-...)
 * @param {string} [opts.loginPassword]
 * @param {string} [opts.designation]         - employee only
 * @returns {Promise<{sent:boolean, type:string, to?:string, messageId?:string, error?:string, reason?:string}>}
 */
async function sendNotificationEmail({ type, toEmail, name, code, loginPassword, designation }) {
  if (!type || !['customer', 'employee'].includes(type)) {
    return { sent: false, type, reason: `Invalid notification type: "${type}". Must be "customer" or "employee".` };
  }
  if (!toEmail) {
    return { sent: false, type, reason: 'No email address provided' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, type, reason: 'SMTP not configured — add SMTP_HOST/SMTP_USER/SMTP_PASS to .env' };
  }

  const { platformName, platformUrl, logoUrl, fromName, fromEmail, adminName } = getPlatformConfig();

  let subject, html, text;

  if (type === 'customer') {
    ({ subject, html, text } = buildWelcomeEmail({
      customerName:  name,
      customerId:    code,
      adminName,
      loginEmail:    toEmail,
      loginPassword: loginPassword || '(not set)',
      platformName,
      platformUrl,
      logoUrl,
    }));
  } else {
    // type === 'employee'
    ({ subject, html, text } = buildEmployeeWelcomeEmail({
      employeeName:  name,
      employeeCode:  code,
      adminName,
      loginEmail:    toEmail,
      loginPassword: loginPassword || '(not set)',
      designation,
      platformName,
      platformUrl,
      logoUrl,
    }));
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to:   toEmail,
      subject,
      html,
      text,
    });
    console.log(`[emailService] ${type} welcome email sent → ${toEmail} | msgId: ${info.messageId}`);
    return { sent: true, type, to: toEmail, messageId: info.messageId };
  } catch (err) {
    console.error(`[emailService] ${type} send failed:`, err.message);
    return { sent: false, type, to: toEmail, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD-COMPATIBLE WRAPPERS
// (so employees.js → sendEmployeeWelcomeEmail() and the customer route →
//  sendWelcomeEmail() keep working with zero changes on their end)
// ─────────────────────────────────────────────────────────────────────────────
async function sendWelcomeEmail({ toEmail, customerName, customerId, loginPassword }) {
  return sendNotificationEmail({
    type: 'customer',
    toEmail,
    name: customerName,
    code: customerId,
    loginPassword,
  });
}

async function sendEmployeeWelcomeEmail({ toEmail, employeeName, employeeCode, loginPassword, designation }) {
  return sendNotificationEmail({
    type: 'employee',
    toEmail,
    name: employeeName,
    code: employeeCode,
    loginPassword,
    designation,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SMTP VERIFY (optional — call once on server startup)
// ─────────────────────────────────────────────────────────────────────────────
async function verifySmtp() {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[emailService] SMTP not configured — welcome emails disabled');
    return false;
  }
  try {
    await transporter.verify();
    console.log('[emailService] ✅ SMTP connection verified');
    return true;
  } catch (err) {
    console.warn('[emailService] ⚠️  SMTP verify failed:', err.message);
    return false;
  }
}

module.exports = {
  sendNotificationEmail,   // single conditional entry point: { type: 'customer'|'employee', ... }
  sendWelcomeEmail,        // legacy: customer-specific
  sendEmployeeWelcomeEmail,// legacy: employee-specific
  verifySmtp,
};