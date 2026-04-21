const router = require('express').Router()
const Razorpay = require('razorpay')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

const PLANS = {
  monthly: { amount: 100000, label: 'Monthly Plan' },  // ₹1000 in paise
  yearly:  { amount: 1000000, label: 'Yearly Plan' }   // ₹10000 in paise
}

// GET /api/subscriptions/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { charity: { select: { id: true, name: true } } }
    })
    if (!sub) return res.status(404).json({ error: 'No subscription found' })
    res.json(sub)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscription' })
  }
})

// POST /api/subscriptions/checkout — create Razorpay order
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan, charity_id } = req.body
    const charity_percentage = charity_id ? (req.body.charity_percentage ?? 10) : 0
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Use monthly or yearly.' })
    if (charity_id && (charity_percentage < 10 || charity_percentage > 100))
      return res.status(400).json({ error: 'charity_percentage must be between 10 and 100' })

    const order = await razorpay.orders.create({
      amount: PLANS[plan].amount,
      currency: 'INR',
      notes: {
        user_id: req.user.id,
        plan,
        charity_id: charity_id || '',
        charity_percentage: String(charity_percentage)
      }
    })

    res.json({
      order_id: order.id,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: PLANS[plan].amount,
      currency: 'INR',
      plan,
      label: PLANS[plan].label
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create checkout order' })
  }
})

// POST /api/subscriptions/verify — verify payment and activate subscription
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, charity_id } = req.body
    const charity_percentage = charity_id ? (req.body.charity_percentage ?? 10) : 0

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex')

    if (expected !== razorpay_signature)
      return res.status(400).json({ error: 'Payment verification failed' })

    await prisma.profile.upsert({
      where: { id: req.user.id },
      update: {},
      create: {
        id: req.user.id,
        fullName: req.user.user_metadata?.full_name || req.user.email,
        email: req.user.email
      }
    })

    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + (plan === 'yearly' ? 12 : 1))

    const sub = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        plan,
        status: 'active',
        razorpayCustomerId: razorpay_payment_id,
        razorpaySubscriptionId: razorpay_order_id,
        amountPence: PLANS[plan].amount,
        charityId: charity_id || null,
        charityPercentage: charity_id ? parseInt(charity_percentage) : 0,
        currentPeriodEnd: periodEnd
      }
    })
    res.json(sub)
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify subscription payment' })
  }
})

// POST /api/subscriptions/cancel
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'active' }
    })
    if (!sub) return res.status(404).json({ error: 'No active subscription' })

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'cancelled', cancelledAt: new Date() }
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel subscription' })
  }
})

// PATCH /api/subscriptions/charity
router.patch('/charity', requireAuth, async (req, res) => {
  try {
    const { charity_id, charity_percentage } = req.body
    const hasCharity = charity_id !== undefined ? !!charity_id : !!sub?.charityId
    const resolvedPercentage = hasCharity ? (charity_percentage ?? 10) : 0
    if (hasCharity && resolvedPercentage < 10 || resolvedPercentage > 100)
      return res.status(400).json({ error: 'charity_percentage must be between 10 and 100' })

    const sub = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'active' }
    })
    if (!sub) return res.status(404).json({ error: 'No active subscription' })

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        ...(charity_id !== undefined && { charityId: charity_id || null }),
        charityPercentage: resolvedPercentage
      }
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update charity preference' })
  }
})

// POST /api/subscriptions/webhook
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature']
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body))

    if (process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET !== 'your-webhook-secret') {
      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex')
      if (expected !== signature) return res.status(400).json({ error: 'Webhook signature invalid' })
    }

    const payload = JSON.parse(rawBody.toString())
    const { event } = payload

    if (event === 'payment.captured') {
      const orderId = payload.payload.payment.entity.order_id
      if (orderId) {
        await prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: orderId },
          data: { status: 'active' }
        })
      }
    }

    res.json({ received: true })
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

module.exports = router
