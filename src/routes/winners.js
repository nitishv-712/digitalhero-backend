const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAuth, requireAdmin } = require('../middleware/auth')

// GET /api/winners/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const winners = await prisma.winner.findMany({
      where: { userId: req.user.id },
      include: { draw: { select: { title: true, drawMonth: true, drawnNumbers: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(winners)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch winners' })
  }
})

// PATCH /api/winners/:id/proof
router.patch('/:id/proof', requireAuth, async (req, res) => {
  try {
    const { proof_url } = req.body
    if (!proof_url) return res.status(400).json({ error: 'proof_url is required' })

    const updated = await prisma.winner.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { proofUrl: proof_url, status: 'pending' }
    })
    if (updated.count === 0) return res.status(404).json({ error: 'Winner record not found' })

    const result = await prisma.winner.findUnique({ where: { id: req.params.id } })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update proof' })
  }
})

// GET /api/winners — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const winners = await prisma.winner.findMany({
      include: {
        user: { select: { fullName: true, email: true } },
        draw: { select: { title: true, drawMonth: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(winners)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch winners' })
  }
})

// PATCH /api/winners/:id/verify — admin
router.patch('/:id/verify', requireAdmin, async (req, res) => {
  try {
    const { status, admin_note } = req.body
    if (!['verified', 'rejected'].includes(status))
      return res.status(400).json({ error: 'status must be verified or rejected' })

    const winner = await prisma.winner.update({
      where: { id: req.params.id },
      data: { status, adminNote: admin_note }
    })
    res.json(winner)
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify winner' })
  }
})

// PATCH /api/winners/:id/paid — admin
router.patch('/:id/paid', requireAdmin, async (req, res) => {
  try {
    const existing = await prisma.winner.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.status !== 'verified')
      return res.status(400).json({ error: 'Winner must be verified before marking as paid' })

    const winner = await prisma.winner.update({
      where: { id: req.params.id },
      data: { status: 'paid', paidAt: new Date() }
    })
    res.json(winner)
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark winner as paid' })
  }
})

module.exports = router
