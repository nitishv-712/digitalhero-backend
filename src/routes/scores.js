const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

// GET /api/scores
router.get('/', requireAuth, async (req, res) => {
  try {
    const scores = await prisma.score.findMany({
      where: { userId: req.user.id },
      orderBy: { scoreDate: 'desc' },
      take: 5
    })
    res.json(scores)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scores' })
  }
})

// POST /api/scores
router.post('/', requireAuth, async (req, res) => {
  try {
    const { score } = req.body
    if (!score) return res.status(400).json({ error: 'score is required' })
    if (score < 1 || score > 45) return res.status(400).json({ error: 'Score must be between 1 and 45' })

    const count = await prisma.score.count({ where: { userId: req.user.id } })
    if (count >= 5) {
      const oldest = await prisma.score.findFirst({
        where: { userId: req.user.id },
        orderBy: { scoreDate: 'asc' }
      })
      await prisma.score.delete({ where: { id: oldest.id } })
    }

    const created = await prisma.score.create({
      data: { userId: req.user.id, score, scoreDate: new Date() }
    })
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create score' })
  }
})

// PATCH /api/scores/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { score } = req.body
    if (!score) return res.status(400).json({ error: 'score is required' })
    if (score < 1 || score > 45) return res.status(400).json({ error: 'Score must be between 1 and 45' })

    const updated = await prisma.score.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { score }
    })
    if (updated.count === 0) return res.status(404).json({ error: 'Score not found' })

    const result = await prisma.score.findUnique({ where: { id: req.params.id } })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update score' })
  }
})

// DELETE /api/scores/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await prisma.score.deleteMany({
      where: { id: req.params.id, userId: req.user.id }
    })
    if (deleted.count === 0) return res.status(404).json({ error: 'Score not found' })
    res.json({ message: 'Score deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete score' })
  }
})

module.exports = router
