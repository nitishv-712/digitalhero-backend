const router = require('express').Router()
const Razorpay = require('razorpay')
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

// POST /api/donations
router.post('/', requireAuth, async (req, res) => {
  try {
    const { charity_id, amount_paise } = req.body
    if (!charity_id || !amount_paise) return res.status(400).json({ error: 'charity_id and amount_paise are required' })
    if (amount_paise < 100) return res.status(400).json({ error: 'Minimum donation is ₹1' })

    const charity = await prisma.charity.findFirst({ where: { id: charity_id, isActive: true } })
    if (!charity) return res.status(404).json({ error: 'Charity not found' })

    const order = await razorpay.orders.create({
      amount: amount_paise,
      currency: 'INR',
      notes: { user_id: req.user.id, charity_id, charity_name: charity.name }
    })

    res.json({ order_id: order.id, key_id: process.env.RAZORPAY_KEY_ID, amount: amount_paise, currency: 'INR', charity_name: charity.name })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create donation order' })
  }
})

// POST /api/donations/verify
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, charity_id, amount_paise } = req.body

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex')

    if (expected !== razorpay_signature) return res.status(400).json({ error: 'Payment verification failed' })

    const donation = await prisma.donation.create({
      data: { userId: req.user.id, charityId: charity_id, amountPence: amount_paise, razorpayPaymentId: razorpay_payment_id }
    })
    res.json(donation)
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify donation' })
  }
})

// GET /api/donations/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const donations = await prisma.donation.findMany({
      where: { userId: req.user.id },
      include: { charity: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(donations)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch donations' })
  }
})

// POST /api/donations/webhook
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature']
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body))

    if (process.env.NODE_ENV !== 'development' || process.env.RAZORPAY_WEBHOOK_SECRET !== 'your-webhook-secret') {
      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex')
      if (expected !== signature) return res.status(400).json({ error: 'Webhook signature invalid' })
    }

    res.json({ received: true })
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

module.exports = router
