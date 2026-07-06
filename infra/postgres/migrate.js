#!/usr/bin/env node
// infra/postgres/migrate.js
// Simple migration runner — reads files from migrations/ in order and executes

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://cos:cos_dev@localhost:5432/cos_db',
})

async function migrate() {
  await client.connect()
  console.log('✓ Connected to database')

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Get already-applied migrations
  const { rows: applied } = await client.query('SELECT filename FROM _migrations ORDER BY id')
  const appliedSet = new Set(applied.map(r => r.filename))

  // Find migration files
  const migrationsDir = join(__dirname, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file} (already applied)`)
      continue
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    console.log(`  run   ${file}`)

    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      ran++
      console.log(`  ✓     ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`  ✗     ${file}: ${err.message}`)
      process.exit(1)
    }
  }

  if (ran === 0) {
    console.log('✓ Database is up to date')
  } else {
    console.log(`✓ Applied ${ran} migration(s)`)
  }

  await client.end()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
