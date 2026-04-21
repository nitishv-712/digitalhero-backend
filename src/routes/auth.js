const router = require('express').Router()
const supabase = require('../lib/supabase')
const prisma = require('../lib/prisma')

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body
    if (!email || !password || !full_name)
      return res.status(400).json({ error: 'email, password and full_name are required' })

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name },
      email_confirm: true
    })
    if (error) return res.status(400).json({ error: error.message })

    await prisma.profile.upsert({
      where: { id: data.user.id },
      update: {},
      create: { id: data.user.id, fullName: full_name, email }
    })

    res.status(201).json({ user: data.user })
  } catch (err) {
    res.status(500).json({ error: 'Signup failed' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ error: error.message })
    res.json({ session: data.session, user: data.user })
  } catch (err) {
    res.status(500).json({ error: 'Login failed' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) await supabase.auth.admin.signOut(token)
    res.json({ message: 'Logged out' })
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' })
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' })

    const { data, error } = await supabase.auth.refreshSession({ refresh_token })
    if (error) return res.status(401).json({ error: error.message })
    res.json({ session: data.session })
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' })
  }
})

module.exports = router
