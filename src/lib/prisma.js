const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  })
}

const prisma = global._prisma ?? createPrismaClient()
if (process.env.NODE_ENV === 'development') global._prisma = prisma

module.exports = prisma
