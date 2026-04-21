require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

// Use service role key to bypass email restrictions
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, family: 4 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const ADMIN_EMAIL    = 'admin@digitalheroes.co.in'
const ADMIN_PASSWORD = 'Admin@1234!'
const ADMIN_NAME     = 'Digital Heroes Admin'

async function main() {
  console.log('🌱 Seeding...\n')

  // 1. Create admin user via service role (bypasses email confirmation)
  const { data: signupData, error: signupError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    user_metadata: { full_name: ADMIN_NAME },
    email_confirm: true
  })

  let adminId = signupData?.user?.id

  if (signupError && signupError.message.includes('already been registered')) {
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const existing = users.find(u => u.email === ADMIN_EMAIL)
    adminId = existing?.id
    console.log('ℹ️  Admin already exists, updating profile...')
  } else if (signupError) {
    throw new Error(`Signup error: ${signupError.message}`)
  }

  if (!adminId) throw new Error('Could not resolve admin user ID')

  // 2. Upsert profile with is_admin = true
  await prisma.profile.upsert({
    where: { id: adminId },
    update: { isAdmin: true },
    create: {
      id: adminId,
      fullName: ADMIN_NAME,
      email: ADMIN_EMAIL,
      isAdmin: true
    }
  })

  console.log('✅ Admin user ready')
  console.log(`   Email    : ${ADMIN_EMAIL}`)
  console.log(`   Password : ${ADMIN_PASSWORD}`)
  console.log(`   ID       : ${adminId}\n`)

  // 3. Seed charities (skip if already exist)
  const charities = [
    { name: 'Golf for Good',       description: 'Using golf to raise funds for underprivileged youth sports programmes across India.', isFeatured: true  },
    { name: 'Fairway Foundation',  description: 'Supporting mental health initiatives through sport and outdoor activity.',             isFeatured: false },
    { name: 'Green Hearts',        description: 'Environmental charity planting trees and restoring natural habitats.',                 isFeatured: false },
    { name: 'Birdie for Life',     description: 'Providing adaptive golf equipment and coaching for people with disabilities.',         isFeatured: true  },
    { name: 'The 19th Hole Trust', description: 'Combating food poverty in communities surrounding golf clubs.',                       isFeatured: false }
  ]

  let seeded = 0
  for (const c of charities) {
    const exists = await prisma.charity.findFirst({ where: { name: c.name } })
    if (!exists) {
      await prisma.charity.create({ data: c })
      seeded++
    }
  }

  console.log(`✅ ${seeded} new charities seeded (${charities.length - seeded} already existed)\n`)
  console.log('🎉 Done.')
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
