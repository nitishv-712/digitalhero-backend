const supabase = require('../lib/supabase')
const prisma = require('../lib/prisma')

const profileCache = new Set()
const adminCache = new Map()

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' })
  }

  const token = authHeader.split(' ')[1]
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Invalid token' })

  req.user = data.user

  if (!profileCache.has(data.user.id)) {
    await prisma.profile.upsert({
      where: { id: data.user.id },
      update: {},
      create: {
        id: data.user.id,
        fullName: data.user.user_metadata?.full_name || data.user.email,
        email: data.user.email
      }
    })
    profileCache.add(data.user.id)
  }

  next()
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    const userId = req.user.id

    if (!adminCache.has(userId)) {
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: { isAdmin: true }
      })
      adminCache.set(userId, profile?.isAdmin ?? false)
    }

    if (!adminCache.get(userId)) return res.status(403).json({ error: 'Admin access required' })
    next()
  })
}

module.exports = { requireAuth, requireAdmin }
