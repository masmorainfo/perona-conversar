import express, { type Request, type Response, type NextFunction } from 'express'
import pg from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { CreateChannelSchema, UpdateStrategySchema } from './schemas/channel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://cos:cos_dev@localhost:5432/cos_db',
})

// ─── Template Loader ──────────────────────────────────────────────────────────

function loadTemplate(slug: string): Record<string, unknown> | null {
  try {
    const templatePath = join(__dirname, '../../../../channels/templates', `${slug}.json`)
    return JSON.parse(readFileSync(templatePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function mergeWithTemplate(
  templateSlug: string | undefined,
  data: Record<string, unknown>
): Record<string, unknown> {
  if (!templateSlug) return data
  const template = loadTemplate(templateSlug)
  if (!template) return data
  // Deep merge: data overrides template
  return deepMerge(template, data)
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = target[key]
    if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
        tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>)
    } else {
      result[key] = srcVal
    }
  }
  return result
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /channels — list all channels */
app.get('/channels', async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, slug, name, inherits_from, is_active, priority, created_at, updated_at
     FROM channel_registry
     ORDER BY created_at DESC`
  )
  res.json({ channels: rows })
})

/** GET /channels/:slug — get channel by slug */
app.get('/channels/:slug', async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    'SELECT * FROM channel_registry WHERE slug = $1',
    [req.params['slug']]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'Channel not found' })
  res.json(rows[0])
})

/** POST /channels — create channel */
app.post('/channels', async (req: Request, res: Response) => {
  const parsed = CreateChannelSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  }

  const { slug, name, inheritsFrom, core, strategy, priority } = parsed.data

  // Merge with template if specified
  const mergedCore = inheritsFrom
    ? mergeWithTemplate(inheritsFrom, core as unknown as Record<string, unknown>)
    : core
  const mergedStrategy = inheritsFrom
    ? mergeWithTemplate(inheritsFrom + '_strategy', strategy as unknown as Record<string, unknown>)
    : strategy

  const { rows } = await pool.query(
    `INSERT INTO channel_registry (slug, name, inherits_from, core, strategy, priority)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [slug, name, inheritsFrom ?? null, JSON.stringify(mergedCore), JSON.stringify(mergedStrategy), priority]
  )

  res.status(201).json(rows[0])
})

/** PATCH /channels/:slug/strategy — update channel strategy (Learning Engine or human) */
app.patch('/channels/:slug/strategy', async (req: Request, res: Response) => {
  const parsed = UpdateStrategySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  }

  const { rows: existing } = await pool.query(
    'SELECT * FROM channel_registry WHERE slug = $1',
    [req.params['slug']]
  )
  if (existing.length === 0) return res.status(404).json({ error: 'Channel not found' })

  const channel = existing[0]
  const currentStrategy = channel.strategy as Record<string, unknown>
  const updates = parsed.data
  const { updatedBy, reason, ...strategyUpdates } = updates

  const newStrategy = deepMerge(currentStrategy, strategyUpdates as Record<string, unknown>)

  // Save history
  await pool.query(
    `INSERT INTO channel_registry_history (channel_id, version, field, snapshot, changed_by, reason)
     VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM channel_registry_history WHERE channel_id = $1), 'strategy', $2, $3, $4)`,
    [channel.id, JSON.stringify(currentStrategy), updatedBy, reason ?? null]
  )

  const { rows: updated } = await pool.query(
    `UPDATE channel_registry SET strategy = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(newStrategy), channel.id]
  )

  res.json(updated[0])
})

/** PATCH /channels/:slug/core — update channel core (REQUIRES human actor) */
app.patch('/channels/:slug/core', async (req: Request, res: Response) => {
  const { actor, reason, ...coreUpdates } = req.body as {
    actor: string; reason?: string; [key: string]: unknown
  }

  if (!actor || actor === 'learning_engine') {
    return res.status(403).json({
      error: 'Channel Core can only be updated by a human actor',
    })
  }

  const { rows: existing } = await pool.query(
    'SELECT * FROM channel_registry WHERE slug = $1',
    [req.params['slug']]
  )
  if (existing.length === 0) return res.status(404).json({ error: 'Channel not found' })

  const channel = existing[0]
  const currentCore = channel.core as Record<string, unknown>
  const newCore = deepMerge(currentCore, coreUpdates)

  await pool.query(
    `INSERT INTO channel_registry_history (channel_id, version, field, snapshot, changed_by, reason)
     VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM channel_registry_history WHERE channel_id = $1), 'core', $2, $3, $4)`,
    [channel.id, JSON.stringify(currentCore), actor, reason ?? null]
  )

  const { rows: updated } = await pool.query(
    `UPDATE channel_registry SET core = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(newCore), channel.id]
  )

  res.json(updated[0])
})

/** GET /channels/:slug/history — audit trail */
app.get('/channels/:slug/history', async (req: Request, res: Response) => {
  const { rows: channel } = await pool.query(
    'SELECT id FROM channel_registry WHERE slug = $1',
    [req.params['slug']]
  )
  if (channel.length === 0) return res.status(404).json({ error: 'Channel not found' })

  const { rows } = await pool.query(
    `SELECT version, field, changed_by, reason, changed_at
     FROM channel_registry_history WHERE channel_id = $1
     ORDER BY changed_at DESC LIMIT 50`,
    [channel[0].id]
  )
  res.json({ history: rows })
})

/** GET /templates — list available templates */
app.get('/templates', (_req: Request, res: Response) => {
  const templates = ['technology', 'entertainment', 'education']
  res.json({ templates })
})

/** GET /templates/:slug — get template */
app.get('/templates/:slug', (req: Request, res: Response) => {
  const template = loadTemplate(req.params['slug'] ?? '')
  if (!template) return res.status(404).json({ error: 'Template not found' })
  res.json(template)
})

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['REGISTRY_PORT'] ?? '3001', 10)
app.listen(PORT, () => {
  console.log(`✓ Channel Registry running on http://localhost:${PORT}`)
})
