require('dotenv').config()
const express = require('express')
const cors = require('cors')

const  authRoutes         = require('./routes/auth')
const  profileRoutes      = require('./routes/profile')
const  scoresRoutes       = require('./routes/scores')
const  subscriptionRoutes = require('./routes/subscriptions')
const  charitiesRoutes    = require('./routes/charities')
const  drawsRoutes        = require('./routes/draws')
const  winnersRoutes      = require('./routes/winners')
const  adminRoutes        = require('./routes/admin')
const  donationsRoutes    = require('./routes/donations')

let startCron = () => {}
try {
  startCron = require('./lib/cron').startCron
} catch (err) {
  console.error('Failed to load cron:', err.message)
}

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
  process.env.PRODUCTION_CLIENT_URL || 'https://digitalhero-web.vercel.app',
  process.env.PRODUCTION_ADMIN_URL || 'https://digitalhero-admin.vercel.app'
].filter(Boolean)

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true)
    } else {
      cb(null, true) // Allow all in production, restrict if needed
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))

app.use(express.json())

if (authRoutes) app.use('/api/auth',          authRoutes)
if (profileRoutes) app.use('/api/profile',       profileRoutes)
if (scoresRoutes) app.use('/api/scores',        scoresRoutes)
if (subscriptionRoutes) app.use('/api/subscriptions', subscriptionRoutes)
if (charitiesRoutes) app.use('/api/charities',     charitiesRoutes)
if (drawsRoutes) app.use('/api/draws',         drawsRoutes)
if (winnersRoutes) app.use('/api/winners',       winnersRoutes)
if (adminRoutes) app.use('/api/admin',         adminRoutes)
if (donationsRoutes) app.use('/api/donations',     donationsRoutes)

app.get('/health', (_, res) => res.json({ status: 'ok', env: process.env.NODE_ENV }))

app.use((err, req, res, next) => {
  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  if (isDev) console.error('[ERROR]', err.stack || err.message)
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
