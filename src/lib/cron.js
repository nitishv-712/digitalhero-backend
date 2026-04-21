const prisma = require('./prisma')
const { sendSubscriptionEmail } = require('./mailer')

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'

async function runSubscriptionCron() {
  const now = new Date()
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  // 1. Lapse subscriptions past their period end
  const lapsed = await prisma.subscription.findMany({
    where: { status: 'active', currentPeriodEnd: { lt: now } },
    include: { user: { select: { fullName: true, email: true } } }
  })

  for (const sub of lapsed) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'lapsed' }
    })
    console.log(`[cron] Lapsed subscription ${sub.id} for ${sub.user.email}`)
    sendSubscriptionEmail({
      to: sub.user.email, name: sub.user.fullName, event: 'lapsed',
      plan: sub.plan, renewsAt: null,
      dashboardUrl: `${CLIENT_URL}/dashboard`
    }).catch(e => console.error('[mailer]', e.message))
  }

  // 2. Send renewal reminder for subscriptions expiring in ~3 days (within a 1h window to avoid duplicates)
  const renewingSoon = await prisma.subscription.findMany({
    where: {
      status: 'active',
      currentPeriodEnd: { gte: now, lte: in3Days }
    },
    include: { user: { select: { fullName: true, email: true } } }
  })

  for (const sub of renewingSoon) {
    console.log(`[cron] Renewal reminder for ${sub.user.email}`)
    sendSubscriptionEmail({
      to: sub.user.email, name: sub.user.fullName, event: 'renewing',
      plan: sub.plan,
      renewsAt: new Date(sub.currentPeriodEnd).toLocaleDateString('en-GB'),
      dashboardUrl: `${CLIENT_URL}/dashboard`
    }).catch(e => console.error('[mailer]', e.message))
  }

  console.log(`[cron] Done — lapsed: ${lapsed.length}, reminders: ${renewingSoon.length}`)
}

function startCron() {
  // Run immediately on startup, then every 24 hours
  runSubscriptionCron().catch(e => console.error('[cron] Error:', e.message))
  setInterval(() => {
    runSubscriptionCron().catch(e => console.error('[cron] Error:', e.message))
  }, 24 * 60 * 60 * 1000)
}

module.exports = { startCron }
