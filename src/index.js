require('dotenv').config()
const express = require('express')
const cors = require('cors')

const authRoutes         = require('./routes/auth')
const profileRoutes      = require('./routes/profile')
const scoresRoutes       = require('./routes/scores')
const subscriptionRoutes = require('./routes/subscriptions')
const charitiesRoutes    = require('./routes/charities')
const drawsRoutes        = require('./routes/draws')
const winnersRoutes      = require('./routes/winners')
const adminRoutes        = require('./routes/admin')
const donationsRoutes    = require('./routes/donations')

const { startCron } = require('./lib/cron')

const app = express()
const isDev = process.env.NODE_ENV === 'development'

// Razorpay webhook needs raw body for HMAC verification — register before express.json()
app.use('/api/subscriptions/webhook', express.raw({ type: '*/*' }))
app.use('/api/donations/webhook',     express.raw({ type: '*/*' }))

// CORS — always allow configured origins from env
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  process.env.PRODUCTION_CLIENT_URL,
  process.env.PRODUCTION_ADMIN_URL
].filter(Boolean)

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}

app.options('*', cors(corsOptions))
app.use(cors(corsOptions))

app.use(express.json())

app.use('/api/auth',          authRoutes)
app.use('/api/profile',       profileRoutes)
app.use('/api/scores',        scoresRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/charities',     charitiesRoutes)
app.use('/api/draws',         drawsRoutes)
app.use('/api/winners',       winnersRoutes)
app.use('/api/admin',         adminRoutes)
app.use('/api/donations',     donationsRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }))

app.use((err, req, res, next) => {
  if (isDev) console.error(err)
  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

// Start server locally; export for Vercel serverless
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV}]`)
    startCron()
  })
}

module.exports = app
