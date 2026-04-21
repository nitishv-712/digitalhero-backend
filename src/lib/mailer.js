const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const PRIZE_LABELS = {
  match_3: '3-Number Match',
  match_4: '4-Number Match',
  match_5: '5-Number Match (Jackpot)'
}

async function sendWinnerEmail({ to, name, matchType, prizeAmount, drawTitle, dashboardUrl }) {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your@gmail.com') {
    console.log(`[mailer] SMTP not configured — skipping email to ${to}`)
    return
  }

  const prize = `₹${(prizeAmount / 100).toFixed(2)}`
  const label = PRIZE_LABELS[matchType] || matchType

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `🏆 You won ${prize} in the ${drawTitle}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#0f0f17;font-family:sans-serif;color:#fff;">
        <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#00e676,#7c3aed);padding:32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🏆</div>
            <h1 style="margin:0;font-size:24px;font-weight:900;">You're a winner!</h1>
          </div>
          <div style="padding:32px;">
            <p style="color:#aaa;margin-top:0;">Hi ${name},</p>
            <p style="color:#aaa;">Congratulations! You matched in the <strong style="color:#fff;">${drawTitle}</strong>.</p>

            <div style="background:#ffffff0d;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
              <div style="color:#aaa;font-size:13px;margin-bottom:4px;">${label}</div>
              <div style="font-size:36px;font-weight:900;color:#00e676;">${prize}</div>
            </div>

            <p style="color:#aaa;font-size:14px;">To claim your prize, log in to your dashboard and submit your proof of identity.</p>

            <div style="text-align:center;margin-top:28px;">
              <a href="${dashboardUrl}" style="background:#00e676;color:#000;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block;">
                Claim your prize →
              </a>
            </div>

            <p style="color:#555;font-size:12px;margin-top:32px;text-align:center;">
              Digital Heroes · Play golf. Change lives. Win prizes.
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  })
}

async function sendSubscriptionEmail({ to, name, event, plan, renewsAt, dashboardUrl }) {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your@gmail.com') {
    console.log(`[mailer] SMTP not configured — skipping subscription email to ${to}`)
    return
  }

  const configs = {
    activated:  { emoji: '🎉', subject: `Welcome to Digital Heroes!`, heading: 'Subscription activated', color: '#00e676', body: `Your <strong>${plan}</strong> subscription is now active. You're entered into the next monthly draw.` },
    cancelled:  { emoji: '😢', subject: `Your subscription has been cancelled`, heading: 'Subscription cancelled', color: '#f59e0b', body: `Your <strong>${plan}</strong> subscription has been cancelled. You'll retain access until the end of your current period.` },
    lapsed:     { emoji: '⚠️', subject: `Your subscription has lapsed`, heading: 'Subscription lapsed', color: '#ef4444', body: `Your <strong>${plan}</strong> subscription has lapsed due to a failed renewal. Please resubscribe to continue participating in draws.` },
    renewing:   { emoji: '🔄', subject: `Your subscription renews soon`, heading: 'Renewal reminder', color: '#3b82f6', body: `Your <strong>${plan}</strong> subscription renews on <strong>${renewsAt}</strong>. No action needed.` }
  }

  const cfg = configs[event]
  if (!cfg) return

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: cfg.subject,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#0f0f17;font-family:sans-serif;color:#fff;">
        <div style="max-width:560px;margin:40px auto;background:#1a1a2e;border-radius:16px;overflow:hidden;">
          <div style="background:${cfg.color};padding:28px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">${cfg.emoji}</div>
            <h1 style="margin:0;font-size:22px;font-weight:900;color:#000;">${cfg.heading}</h1>
          </div>
          <div style="padding:32px;">
            <p style="color:#aaa;margin-top:0;">Hi ${name},</p>
            <p style="color:#aaa;">${cfg.body}</p>
            <div style="text-align:center;margin-top:28px;">
              <a href="${dashboardUrl}" style="background:#00e676;color:#000;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block;">Go to dashboard →</a>
            </div>
            <p style="color:#555;font-size:12px;margin-top:32px;text-align:center;">Digital Heroes · Play golf. Change lives. Win prizes.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
}

module.exports = { sendWinnerEmail, sendSubscriptionEmail }