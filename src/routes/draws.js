const router = require('express').Router()
const prisma = require('../lib/prisma')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { sendWinnerEmail } = require('../lib/mailer')

// GET /api/draws — published only (public)
router.get('/', async (req, res) => {
  try {
    const draws = await prisma.draw.findMany({
      where: { status: 'published' },
      orderBy: { drawMonth: 'desc' }
    })
    res.json(draws)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch draws' })
  }
})

// GET /api/draws/entries/me
router.get('/entries/me', requireAuth, async (req, res) => {
  try {
    const entries = await prisma.drawEntry.findMany({
      where: { userId: req.user.id },
      include: { draw: { select: { title: true, drawMonth: true, status: true, drawnNumbers: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(entries)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries' })
  }
})

// GET /api/draws/all — admin
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const draws = await prisma.draw.findMany({ orderBy: { drawMonth: 'desc' } })
    res.json(draws)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch draws' })
  }
})

// GET /api/draws/:id — admin
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const draw = await prisma.draw.findUnique({
      where: { id: req.params.id },
      include: { entries: { include: { user: { select: { fullName: true, email: true } } } } }
    })
    if (!draw) return res.status(404).json({ error: 'Draw not found' })
    res.json(draw)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch draw' })
  }
})

// POST /api/draws
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, draw_month, logic = 'random' } = req.body
    if (!title || !draw_month) return res.status(400).json({ error: 'title and draw_month are required' })
    const draw = await prisma.draw.create({
      data: { title, drawMonth: new Date(draw_month), logic, drawnNumbers: [] }
    })
    res.status(201).json(draw)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create draw' })
  }
})

function randomDraw() {
  const numbers = new Set()
  while (numbers.size < 5) numbers.add(Math.floor(Math.random() * 45) + 1)
  return [...numbers]
}

async function algorithmicDraw() {
  const scores = await prisma.score.findMany({ select: { score: true } })
  const freq = {}
  for (const { score } of scores) freq[score] = (freq[score] || 0) + 1
  const pool = []
  for (let n = 1; n <= 45; n++) pool.push(...Array(freq[n] || 1).fill(n))
  const picked = new Set()
  while (picked.size < 5) picked.add(pool[Math.floor(Math.random() * pool.length)])
  return [...picked]
}

function countMatches(userScores, drawn) {
  return userScores.filter(s => drawn.includes(s)).length
}

function matchType(count) {
  if (count >= 5) return 'match_5'
  if (count === 4) return 'match_4'
  if (count === 3) return 'match_3'
  return null
}

// Get latest 5 scores per user (any subscriber with at least 1 score)
async function getScoresByUser(userIds) {
  const allScores = await prisma.score.findMany({
    where: { userId: { in: userIds } },
    orderBy: { scoreDate: 'desc' },
    select: { userId: true, score: true }
  })
  const byUser = {}
  for (const row of allScores) {
    if (!byUser[row.userId]) byUser[row.userId] = []
    if (byUser[row.userId].length < 5) byUser[row.userId].push(row.score)
  }
  return byUser
}

// POST /api/draws/:id/simulate
router.post('/:id/simulate', requireAdmin, async (req, res) => {
  try {
    const draw = await prisma.draw.findUnique({ where: { id: req.params.id } })
    if (!draw) return res.status(404).json({ error: 'Draw not found' })
    if (draw.status === 'published') return res.status(400).json({ error: 'Draw already published. Use republish to re-run.' })

    const drawn = draw.logic === 'algorithmic' ? await algorithmicDraw() : randomDraw()

    const activeSubs = await prisma.subscription.findMany({
      where: { status: 'active' },
      select: { userId: true }
    })
    const userIds = activeSubs.map(s => s.userId)
    const byUser = await getScoresByUser(userIds)

    const subCount = activeSubs.length
    const totalPool = subCount * 100000
    const pool3 = Math.floor(totalPool * 0.25)
    const pool4 = Math.floor(totalPool * 0.35)
    const pool5 = Math.floor(totalPool * 0.40) + (draw.jackpotRollover || 0)

    const matches = Object.entries(byUser)
      .map(([userId, scores]) => ({
        user_id: userId,
        scores,
        matched_count: countMatches(scores, drawn),
        match_type: matchType(countMatches(scores, drawn))
      }))
      .filter(r => r.match_type !== null)

    await prisma.draw.update({
      where: { id: req.params.id },
      data: { drawnNumbers: drawn, status: 'simulation', totalPool, pool3, pool4, pool5 }
    })

    res.json({ drawnNumbers: drawn, totalPool, pool3, pool4, pool5, matches })
  } catch (err) {
    res.status(500).json({ error: 'Failed to simulate draw' })
  }
})

async function runPublish(draw) {
  const activeSubs = await prisma.subscription.findMany({
    where: { status: 'active' },
    select: { userId: true }
  })
  const userIds = activeSubs.map(s => s.userId)
  const byUser = await getScoresByUser(userIds)

  // Clear previous entries and winners for this draw
  await prisma.winner.deleteMany({ where: { drawId: draw.id } })
  await prisma.drawEntry.deleteMany({ where: { drawId: draw.id } })

  const entries = Object.entries(byUser).map(([userId, scores]) => {
    const matched = countMatches(scores, draw.drawnNumbers)
    return { drawId: draw.id, userId, scores, matchedCount: matched, matchType: matchType(matched) }
  })

  if (entries.length) {
    await prisma.drawEntry.createMany({ data: entries, skipDuplicates: true })
  }

  const w3 = entries.filter(e => e.matchType === 'match_3')
  const w4 = entries.filter(e => e.matchType === 'match_4')
  const w5 = entries.filter(e => e.matchType === 'match_5')

  const winnerRows = [
    ...w3.map(w => ({ drawId: draw.id, userId: w.userId, matchType: 'match_3', prizeAmount: Math.floor(draw.pool3 / w3.length) })),
    ...w4.map(w => ({ drawId: draw.id, userId: w.userId, matchType: 'match_4', prizeAmount: Math.floor(draw.pool4 / w4.length) })),
    ...w5.map(w => ({ drawId: draw.id, userId: w.userId, matchType: 'match_5', prizeAmount: Math.floor(draw.pool5 / w5.length) }))
  ]

  if (winnerRows.length) {
    await prisma.winner.createMany({ data: winnerRows })

    // Send winner notification emails
    const winnerProfiles = await prisma.profile.findMany({
      where: { id: { in: winnerRows.map(w => w.userId) } },
      select: { id: true, fullName: true, email: true }
    })
    const profileMap = Object.fromEntries(winnerProfiles.map(p => [p.id, p]))
    const dashboardUrl = `${process.env.CLIENT_URL}/dashboard`

    await Promise.allSettled(
      winnerRows.map(w => {
        const profile = profileMap[w.userId]
        if (!profile) return Promise.resolve()
        return sendWinnerEmail({
          to: profile.email,
          name: profile.fullName,
          matchType: w.matchType,
          prizeAmount: w.prizeAmount,
          drawTitle: draw.title,
          dashboardUrl
        }).catch(err => console.error(`[mailer] Failed to send to ${profile.email}:`, err.message))
      })
    )
  }

  const nextRollover = w5.length === 0 ? draw.pool5 : 0
  if (nextRollover > 0) {
    const nextDraw = await prisma.draw.findFirst({
      where: { status: 'draft' },
      orderBy: { drawMonth: 'asc' }
    })
    if (nextDraw) {
      await prisma.draw.update({
        where: { id: nextDraw.id },
        data: { jackpotRollover: nextDraw.jackpotRollover + nextRollover }
      })
    }
  }

  await prisma.draw.update({
    where: { id: draw.id },
    data: { status: 'published', publishedAt: new Date() }
  })

  return { winners: winnerRows.length, jackpotRolledOver: nextRollover > 0, nextRolloverAmount: nextRollover }
}

// POST /api/draws/:id/publish
router.post('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const draw = await prisma.draw.findUnique({ where: { id: req.params.id } })
    if (!draw) return res.status(404).json({ error: 'Draw not found' })
    if (!draw.drawnNumbers?.length) return res.status(400).json({ error: 'Run simulation first' })
    const result = await runPublish(draw)
    res.json({ message: 'Draw published', ...result })
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish draw' })
  }
})

// POST /api/draws/:id/republish — re-run publish on already published draw
router.post('/:id/republish', requireAdmin, async (req, res) => {
  try {
    const draw = await prisma.draw.findUnique({ where: { id: req.params.id } })
    if (!draw) return res.status(404).json({ error: 'Draw not found' })
    if (!draw.drawnNumbers?.length) return res.status(400).json({ error: 'Run simulation first' })
    const result = await runPublish(draw)
    res.json({ message: 'Draw republished', ...result })
  } catch (err) {
    res.status(500).json({ error: 'Failed to republish draw' })
  }
})

module.exports = router
