const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAdmin } = require('../middleware/auth')

// GET /api/charities
router.get('/', async (req, res) => {
  try {
    const { search, featured } = req.query
    const charities = await prisma.charity.findMany({
      where: {
        isActive: true,
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
        ...(featured === 'true' && { isFeatured: true })
      },
      include: { events: true },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }]
    })
    res.json(charities)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch charities' })
  }
})

// GET /api/charities/:id
router.get('/:id', async (req, res) => {
  try {
    const charity = await prisma.charity.findFirst({
      where: { id: req.params.id, isActive: true },
      include: { events: true }
    })
    if (!charity) return res.status(404).json({ error: 'Charity not found' })
    res.json(charity)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch charity' })
  }
})

// POST /api/charities
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, image_url, website_url, is_featured } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const charity = await prisma.charity.create({
      data: { name, description, imageUrl: image_url, websiteUrl: website_url, isFeatured: is_featured || false }
    })
    res.status(201).json(charity)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create charity' })
  }
})

// PATCH /api/charities/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, image_url, website_url, is_featured, is_active } = req.body
    const charity = await prisma.charity.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(image_url !== undefined && { imageUrl: image_url }),
        ...(website_url !== undefined && { websiteUrl: website_url }),
        ...(is_featured !== undefined && { isFeatured: is_featured }),
        ...(is_active !== undefined && { isActive: is_active })
      }
    })
    res.json(charity)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update charity' })
  }
})

// DELETE /api/charities/:id — soft delete
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.charity.update({ where: { id: req.params.id }, data: { isActive: false } })
    res.json({ message: 'Charity deactivated' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate charity' })
  }
})

// POST /api/charities/:id/events
router.post('/:id/events', requireAdmin, async (req, res) => {
  try {
    const { title, event_date, description } = req.body
    if (!title || !event_date) return res.status(400).json({ error: 'title and event_date are required' })
    const event = await prisma.charityEvent.create({
      data: { charityId: req.params.id, title, eventDate: new Date(event_date), description }
    })
    res.status(201).json(event)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create event' })
  }
})

// DELETE /api/charities/events/:eventId
router.delete('/events/:eventId', requireAdmin, async (req, res) => {
  try {
    await prisma.charityEvent.delete({ where: { id: req.params.eventId } })
    res.json({ message: 'Event deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete event' })
  }
})

module.exports = router
