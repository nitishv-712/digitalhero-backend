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

const app = express()
const isDev = process.env.NODE_ENV === 'development'

// Razorpay webhook needs raw body for HMAC verification — register before express.json()
app.use('/api/subscriptions/webhook', express.raw({ type: '*/*' }))
app.use('/api/donations/webhook',     express.raw({ type: '*/*' }))

// CORS — allow web (3000) and admin (3001) in dev, or CLIENT_URL + ADMIN_URL in prod
const allowedOrigins = isDev
  ? ['http://localhost:3000', 'http://localhost:3001']
  : [process.env.CLIENT_URL, process.env.ADMIN_URL].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, Razorpay webhooks, mobile)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true
}))

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
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV}]`))
