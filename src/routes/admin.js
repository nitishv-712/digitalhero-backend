const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAdmin } = require('../middleware/auth')

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { search } = req.query
    const users = await prisma.profile.findMany({
      where: search ? { fullName: { contains: search, mode: 'insensitive' } } : {},
      include: {
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { charity: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// GET /api/admin/users/:id
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await prisma.profile.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: { include: { charity: true } },
        scores: { orderBy: { scoreDate: 'desc' } }
      }
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { full_name, is_admin } = req.body
    const user = await prisma.profile.update({
      where: { id: req.params.id },
      data: {
        ...(full_name !== undefined && { fullName: full_name }),
        ...(is_admin !== undefined && { isAdmin: is_admin })
      }
    })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// PATCH /api/admin/users/:id/subscription
router.patch('/users/:id/subscription', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' }
    })
    if (!sub) return res.status(404).json({ error: 'No subscription found' })

    const updated = await prisma.subscription.update({
      where: { id: sub.id },
      data: { status }
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subscription' })
  }
})

// PATCH /api/admin/scores/:id
router.patch('/scores/:id', requireAdmin, async (req, res) => {
  try {
    const { score, score_date } = req.body
    if (score && (score < 1 || score > 45)) return res.status(400).json({ error: 'Score must be between 1 and 45' })

    const updated = await prisma.score.update({
      where: { id: req.params.id },
      data: {
        ...(score && { score }),
        ...(score_date && { scoreDate: new Date(score_date) })
      }
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update score' })
  }
})

// GET /api/admin/reports
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, activeSubscribers, draws, activeSubs] = await Promise.all([
      prisma.profile.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.draw.findMany({ select: { totalPool: true, status: true } }),
      prisma.subscription.findMany({
        where: { status: 'active' },
        select: { amountPence: true, charityPercentage: true }
      })
    ])

    const totalPrizePool = draws.reduce((sum, d) => sum + (d.totalPool || 0), 0)
    const totalCharityContributions = activeSubs.reduce((sum, s) =>
      sum + Math.floor((s.amountPence * s.charityPercentage) / 100), 0)

    res.json({
      total_users: totalUsers,
      active_subscribers: activeSubscribers,
      total_prize_pool_pence: totalPrizePool,
      total_charity_contributions_pence: totalCharityContributions,
      draw_stats: {
        total: draws.length,
        published: draws.filter(d => d.status === 'published').length,
        draft: draws.filter(d => d.status === 'draft').length
      }
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' })
  }
})

module.exports = router
