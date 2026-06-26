// backend/utils/emailTemplate.js
// Pure HTML/text template builders for customer & employee welcome emails.
// No SMTP logic here — see emailService.js for sending.

function getInitials(fullName = '') {
  return fullName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: CUSTOMER welcome email
// ─────────────────────────────────────────────────────────────────────────────
function buildWelcomeEmail({
  customerName,
  customerId,
  adminName     = 'Administrator',
  loginEmail,
  loginPassword,
  platformName  = 'VPTex Platform',
  platformUrl   = 'https://your-platform.com/login',
  logoUrl       = '',
}) {
  const year     = new Date().getFullYear();
  const initials = getInitials(customerName);
  const subject  = `Welcome to ${platformName} — Your Account is Ready, ${customerName}!`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f0f4f8; font-family: 'Plus Jakarta Sans', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Plus Jakarta Sans',Arial,sans-serif;">

  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${platformName} account is ready. Login with your credentials inside. &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td align="center" style="padding-bottom:24px;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${platformName}" height="44" style="height:44px;display:block;" />`
                : `<div style="display:inline-flex;align-items:center;gap:10px;">
                     <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);display:inline-block;vertical-align:middle;line-height:40px;text-align:center;">
                       <span style="color:#fff;font-size:18px;font-weight:800;font-family:Arial;">V</span>
                     </div>
                     <span style="color:#1e293b;font-size:20px;font-weight:800;font-family:Arial;vertical-align:middle;">${platformName}</span>
                   </div>`
              }
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 50%,#3b82f6 100%);border-radius:20px 20px 0 0;padding:48px 40px 40px;text-align:center;">
              <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);border:3px solid rgba(255,255,255,0.5);margin:0 auto 20px;line-height:72px;text-align:center;">
                <span style="color:#fff;font-size:28px;font-weight:800;font-family:Arial;">${initials}</span>
              </div>
              <h1 style="color:#fff;font-size:28px;font-weight:800;line-height:1.2;margin-bottom:10px;font-family:Arial;">
                Welcome , ${customerName}! 🎉
              </h1>
              <p style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;max-width:420px;margin:0 auto;">
                Your account on <strong style="color:#fff;">${platformName}</strong> has been successfully created
                by <strong style="color:#bfdbfe;">${adminName}</strong>. You're all set to get started.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:36px 40px;">

              <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 18px;margin-bottom:28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:3px;">Your Customer ID</span>
                      <span style="font-size:18px;font-weight:800;color:#1d4ed8;font-family:'Courier New',monospace;letter-spacing:0.05em;">${customerId}</span>
                    </td>
                    <td align="right">
                      <div style="width:38px;height:38px;background:#2563eb;border-radius:8px;line-height:38px;text-align:center;">
                        <span style="color:#fff;font-size:18px;">🪪</span>
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:24px;">
                Hi <strong>${customerName}</strong>,<br/><br/>
                Your profile has been created on <strong>${platformName}</strong> by
                <strong>${adminName}</strong>. You can now log in to our platform to view
                your orders, invoices, and updates in real time.
              </p>

              <div style="background:#fafafa;border:2px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px;">
                <div style="background:linear-gradient(90deg,#1e40af,#2563eb);padding:12px 20px;">
                  <span style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">🔐 Your Login Credentials</span>
                </div>
                <div style="padding:20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:14px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="36">
                              <div style="width:32px;height:32px;background:#eff6ff;border-radius:8px;line-height:32px;text-align:center;">
                                <span style="font-size:15px;">✉️</span>
                              </div>
                            </td>
                            <td style="padding-left:12px;">
                              <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Username / Email</div>
                              <div style="font-size:14px;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;background:#f1f5f9;padding:6px 10px;border-radius:6px;display:inline-block;">${loginEmail}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr><td style="border-top:1px solid #f1f5f9;padding-bottom:14px;"></td></tr>
                    <tr>
                      <td>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="36">
                              <div style="width:32px;height:32px;background:#faf5ff;border-radius:8px;line-height:32px;text-align:center;">
                                <span style="font-size:15px;">🔑</span>
                              </div>
                            </td>
                            <td style="padding-left:12px;">
                              <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Password</div>
                              <div style="font-size:14px;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;background:#f1f5f9;padding:6px 10px;border-radius:6px;display:inline-block;">${loginPassword}</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </div>
              </div>

              <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="22" valign="top" style="padding-top:1px;">⚠️</td>
                    <td style="padding-left:8px;">
                      <p style="font-size:12px;color:#92400e;line-height:1.6;margin:0;">
                        <strong>Security Tip:</strong> Please change your password immediately after your first login.
                        Never share your credentials with anyone. If you did not expect this email, contact support immediately.
                      </p>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="text-align:center;margin-bottom:28px;">
                <a href="${platformUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:12px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(37,99,235,0.35);">
                  🚀 Login to Your Account →
                </a>
                <p style="margin-top:10px;font-size:12px;color:#94a3b8;">
                  Or copy this link: <a href="${platformUrl}" style="color:#2563eb;word-break:break-all;">${platformUrl}</a>
                </p>
              </div>

              <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:8px;">
                <p style="font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:14px;">✨ What you can do on the platform</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${[
                    ['📦', 'Track your orders in real time'],
                    ['🧾', 'View and download invoices instantly'],
                    ['📊', 'Monitor your account updates'],
                    ['💬', 'Communicate directly with our team'],
                  ].map(([icon, txt]) => `
                  <tr>
                    <td style="padding-bottom:10px;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td width="28" style="font-size:16px;">${icon}</td>
                          <td style="padding-left:8px;font-size:13px;color:#374151;line-height:1.5;">${txt}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>`).join('')}
                </table>
              </div>

            </td>
          </tr>

          <tr>
            <td style="background:#1e293b;border-radius:0 0 20px 20px;padding:28px 40px;text-align:center;">
              <p style="color:#94a3b8;font-size:12px;line-height:1.8;margin-bottom:8px;">
                This email was sent by <strong style="color:#e2e8f0;">${platformName}</strong>.<br/>
                If you have questions, reply to this email or contact your account manager.
              </p>
              <p style="color:#64748b;font-size:11px;margin:0;">
                © ${year} ${platformName} · All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = `
Welcome to ${platformName}, ${customerName}!

Your account has been created by ${adminName}.

Customer ID : ${customerId}
Login Email : ${loginEmail}
Password    : ${loginPassword}

Login here: ${platformUrl}

Please change your password after first login.

© ${year} ${platformName}
`.trim();

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: EMPLOYEE welcome email
// ─────────────────────────────────────────────────────────────────────────────
function buildEmployeeWelcomeEmail({
  employeeName,
  employeeCode,
  adminName     = 'Administrator',
  loginEmail,
  loginPassword,
  designation   = '',
  platformName  = 'VPTex Platform',
  platformUrl   = 'https://your-platform.com/login',
  logoUrl       = '',
}) {
  const year     = new Date().getFullYear();
  const initials = getInitials(employeeName);
  const subject  = `Welcome to ${platformName} — Your Employee Account is Ready, ${employeeName}!`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f0f4f8; font-family: 'Plus Jakarta Sans', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${platformName} employee account is ready. Login credentials inside. &zwnj;&nbsp;&zwnj;&nbsp;
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td align="center" style="padding-bottom:24px;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${platformName}" height="44" style="height:44px;display:block;" />`
                : `<div style="display:inline-flex;align-items:center;gap:10px;">
                     <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#5b21b6);display:inline-block;vertical-align:middle;line-height:40px;text-align:center;">
                       <span style="color:#fff;font-size:18px;font-weight:800;font-family:Arial;">V</span>
                     </div>
                     <span style="color:#1e293b;font-size:20px;font-weight:800;font-family:Arial;vertical-align:middle;">${platformName}</span>
                   </div>`
              }
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 50%,#9333ea 100%);border-radius:20px 20px 0 0;padding:48px 40px 40px;text-align:center;">
              <div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);border:3px solid rgba(255,255,255,0.5);margin:0 auto 20px;line-height:72px;text-align:center;">
                <span style="color:#fff;font-size:28px;font-weight:800;font-family:Arial;">${initials}</span>
              </div>
              <h1 style="color:#fff;font-size:28px;font-weight:800;line-height:1.2;margin-bottom:10px;font-family:Arial;">
                Welcome aboard, ${employeeName}! 🎉
              </h1>
              <p style="color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;max-width:420px;margin:0 auto;">
                Your staff account on <strong style="color:#fff;">${platformName}</strong> has been created
                by <strong style="color:#ddd6fe;">${adminName}</strong>${designation ? ` as <strong style="color:#ddd6fe;">${designation}</strong>` : ''}.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:36px 40px;">

              <div style="background:#faf5ff;border:1.5px solid #d8b4fe;border-radius:10px;padding:12px 18px;margin-bottom:28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;display:block;margin-bottom:3px;">Your Employee ID</span>
                      <span style="font-size:18px;font-weight:800;color:#6d28d9;font-family:'Courier New',monospace;letter-spacing:0.05em;">${employeeCode}</span>
                    </td>
                    <td align="right">
                      <div style="width:38px;height:38px;background:#7c3aed;border-radius:8px;line-height:38px;text-align:center;">
                        <span style="color:#fff;font-size:18px;">🪪</span>
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="font-size:15px;color:#374151;line-height:1.7;margin-bottom:24px;">
                Hi <strong>${employeeName}</strong>,<br/><br/>
                Your staff profile has been created on <strong>${platformName}</strong>. You can log in using
                either your <strong>Employee Code</strong> or your <strong>email</strong> below, along with the password your admin set for you.
              </p>

              <div style="background:#fafafa;border:2px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:28px;">
                <div style="background:linear-gradient(90deg,#5b21b6,#7c3aed);padding:12px 20px;">
                  <span style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">🔐 Your Login Credentials</span>
                </div>
                <div style="padding:20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom:14px;">
                        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Employee Code (or Email)</div>
                        <div style="font-size:14px;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;background:#f1f5f9;padding:6px 10px;border-radius:6px;display:inline-block;">${employeeCode}${loginEmail ? ` / ${loginEmail}` : ''}</div>
                      </td>
                    </tr>
                    <tr><td style="border-top:1px solid #f1f5f9;padding-bottom:14px;"></td></tr>
                    <tr>
                      <td>
                        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Password</div>
                        <div style="font-size:14px;font-weight:700;color:#1e293b;font-family:'Courier New',monospace;background:#f1f5f9;padding:6px 10px;border-radius:6px;display:inline-block;">${loginPassword}</div>
                      </td>
                    </tr>
                  </table>
                </div>
              </div>

              <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:28px;">
                <p style="font-size:12px;color:#92400e;line-height:1.6;margin:0;">
                  ⚠️ <strong>Security Tip:</strong> Please change your password after your first login, and never share these credentials.
                </p>
              </div>

              <div style="text-align:center;margin-bottom:8px;">
                <a href="${platformUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:12px;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(124,58,237,0.35);">
                  🚀 Login to Your Account →
                </a>
              </div>

            </td>
          </tr>

          <tr>
            <td style="background:#1e293b;border-radius:0 0 20px 20px;padding:28px 40px;text-align:center;">
              <p style="color:#94a3b8;font-size:12px;line-height:1.8;margin-bottom:8px;">
                This email was sent by <strong style="color:#e2e8f0;">${platformName}</strong>.
              </p>
              <p style="color:#64748b;font-size:11px;margin:0;">© ${year} ${platformName} · All rights reserved</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `
Welcome to ${platformName}, ${employeeName}!

Your employee account has been created by ${adminName}.

Employee Code : ${employeeCode}
${loginEmail ? `Email          : ${loginEmail}\n` : ''}Password       : ${loginPassword}

Login here: ${platformUrl}

Please change your password after first login.

© ${year} ${platformName}
`.trim();

  return { subject, html, text };
}

module.exports = { buildWelcomeEmail, buildEmployeeWelcomeEmail };