const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

// GET /api/profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await prisma.profile.findUnique({ where: { id: req.user.id } })
    if (!profile) return res.status(404).json({ error: 'Profile not found' })
    res.json(profile)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

// PATCH /api/profile
router.patch('/', requireAuth, async (req, res) => {
  try {
    const { full_name, avatar_url } = req.body
    const profile = await prisma.profile.update({
      where: { id: req.user.id },
      data: {
        ...(full_name && { fullName: full_name }),
        ...(avatar_url && { avatarUrl: avatar_url })
      }
    })
    res.json(profile)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

module.exports = router
