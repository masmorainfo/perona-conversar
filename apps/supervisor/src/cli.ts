#!/usr/bin/env node
// ============================================================
// COS CLI — Interface de linha de comando para o Supervisor
//
// Uso: pnpm --filter supervisor run cli <command> [options]
//
// Comandos:
//   channel:create   Criar um novo canal
//   channel:list     Listar todos os canais
//   channel:show     Mostrar detalhes de um canal
//   content:inject   Injetar um tema manualmente no pipeline
//   content:advance  Avançar manualmente o estado de um conteúdo
//   content:abandon  Abandonar um conteúdo com motivo
//   status           Ver status do pipeline de um canal
//   history          Ver histórico de transições de um conteúdo
// ============================================================

import pg from 'pg'
import { CONTENT_STATES } from '@cos/types'

const db = new pg.Client({
  connectionString: process.env['DATABASE_URL'] ?? 'postgresql://cos:cos_dev@localhost:5432/cos_db',
})

async function main() {
  await db.connect()

  const [, , command, ...args] = process.argv
  const opts = parseArgs(args)

  try {
    switch (command) {
      case 'channel:create':  await createChannel(opts); break
      case 'channel:list':    await listChannels(); break
      case 'channel:show':    await showChannel(opts); break
      case 'content:inject':  await injectContent(opts); break
      case 'content:advance': await advanceContent(opts); break
      case 'content:abandon': await abandonContent(opts); break
      case 'status':          await showStatus(opts); break
      case 'history':         await showHistory(opts); break
      default:
        printHelp()
    }
  } finally {
    await db.end()
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function createChannel(opts: Record<string, string>) {
  const { template, name, slug } = opts
  if (!name) return error('--name is required')

  const generatedSlug = slug ?? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  // Fetch template from registry
  const registryUrl = `http://localhost:${process.env['REGISTRY_PORT'] ?? 3001}`
  const response = await fetch(`${registryUrl}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: generatedSlug,
      name,
      inheritsFrom: template,
      // Minimal core — should be expanded by user
      core: {
        id: generatedSlug,
        name,
        niche: template ?? 'general',
        language: 'pt-BR',
        mission: `Canal ${name} focado em produzir conteúdo de qualidade.`,
        audience: {
          ageRange: [18, 40],
          interests: ['conteúdo em geral'],
          painPoints: ['falta de tempo', 'excesso de informação'],
          aspiration: 'manter-se bem informado',
        },
        values: ['qualidade'],
        editorialLimits: { alwaysIn: ['conteúdo geral'], alwaysOut: [], humanReviewRequired: [] },
        persona: { archetype: 'criador', tone: 'casual', forbiddenWords: [], preferredWords: [] },
      },
      strategy: {
        updatedAt: new Date().toISOString(),
        updatedBy: 'human',
        contentPreferences: {
          preferredFormats: ['explicativo'],
          avoidFormats: [],
          optimalDurationSeconds: { min: 120, max: 600 },
          optimalPostingTimes: ['09:00', '19:00'],
          preferredEmotions: ['curiosidade'],
        },
        performanceThresholds: {
          editorialApprovalMinScore: 0.65,
          criticApprovalMinScore: 0.70,
          qcApprovalMinScore: 0.75,
          publishMinScore: 0.72,
        },
        platformWeights: { youtube: 1.0 },
        ctaPatterns: ['O que você acha? Conta nos comentários.'],
      },
    }),
  })

  if (!response.ok) {
    const body = await response.json() as Record<string, unknown>
    return error(`Failed to create channel: ${JSON.stringify(body)}`)
  }

  const channel = await response.json() as { id: string; slug: string; name: string }
  success(`Channel created: ${channel.name} (${channel.slug})`)
  console.log(`  ID: ${channel.id}`)
  if (template) console.log(`  Template: ${template}`)
  console.log(`\n  Next: edit the channel config at the registry`)
  console.log(`  Registry: http://localhost:${process.env['REGISTRY_PORT'] ?? 3001}/channels/${channel.slug}`)
}

async function listChannels() {
  const { rows } = await db.query(
    `SELECT slug, name, is_active, priority, created_at FROM channel_registry ORDER BY created_at DESC`
  )

  if (rows.length === 0) {
    console.log('No channels found. Create one with: channel:create --name "My Channel"')
    return
  }

  console.log('\n  CHANNELS\n')
  console.log(`  ${'SLUG'.padEnd(24)} ${'NAME'.padEnd(24)} ${'ACTIVE'.padEnd(8)} PRIORITY`)
  console.log(`  ${'-'.repeat(70)}`)
  for (const row of rows) {
    const active = row.is_active ? '✓' : '✗'
    console.log(`  ${String(row.slug).padEnd(24)} ${String(row.name).padEnd(24)} ${active.padEnd(8)} ${row.priority}`)
  }
  console.log()
}

async function showChannel(opts: Record<string, string>) {
  const { channel } = opts
  if (!channel) return error('--channel is required')

  const { rows } = await db.query(
    'SELECT * FROM channel_registry WHERE slug = $1',
    [channel]
  )
  if (rows.length === 0) return error(`Channel not found: ${channel}`)

  const ch = rows[0]
  console.log(`\n  CHANNEL: ${ch.name} (${ch.slug})\n`)
  console.log(`  ID:         ${ch.id}`)
  console.log(`  Active:     ${ch.is_active ? 'yes' : 'no'}`)
  console.log(`  Priority:   ${ch.priority}`)
  console.log(`  Template:   ${ch.inherits_from ?? 'none'}`)
  console.log(`  Created:    ${ch.created_at.toLocaleString()}`)
  console.log(`  Updated:    ${ch.updated_at.toLocaleString()}`)

  const core = ch.core as Record<string, unknown>
  console.log(`\n  CORE`)
  console.log(`  Niche:      ${core['niche']}`)
  console.log(`  Language:   ${core['language']}`)
  console.log(`  Mission:    ${core['mission']}`)

  const limits = core['editorialLimits'] as Record<string, string[]>
  console.log(`\n  EDITORIAL LIMITS`)
  console.log(`  Always in:  ${limits['alwaysIn']?.join(', ')}`)
  console.log(`  Always out: ${limits['alwaysOut']?.join(', ')}`)
  console.log()
}

async function injectContent(opts: Record<string, string>) {
  const { channel, topic } = opts
  if (!channel) return error('--channel is required')
  if (!topic) return error('--topic is required')

  const { rows: channelRows } = await db.query(
    'SELECT id FROM channel_registry WHERE slug = $1',
    [channel]
  )
  if (channelRows.length === 0) return error(`Channel not found: ${channel}`)

  const channelId = channelRows[0].id as string

  const { rows } = await db.query(
    `INSERT INTO content_units (channel_id, topic, state, metadata, attempt_counts, origin)
     VALUES ($1, $2, 'DISCOVERED', jsonb_build_object('topic', $2::text), '{}', 'manual')
     RETURNING id, topic, state, created_at`,
    [channelId, topic]
  )

  // Record initial transition
  await db.query(
    `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
     VALUES ($1, 'DISCOVERED', 'DISCOVERED', 'cli:human', 'Manual injection via CLI')`,
    [rows[0].id]
  )

  // Dispatch EVALUATE_TRIGGER to the pipeline queue (BullMQ) to start the automation
  const { Queue } = await import('bullmq')
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  }
  const supervisorQueue = new Queue('pipeline', { connection })
  await supervisorQueue.add('EVALUATE_TRIGGER', {
    contentId: rows[0].id,
    channelId,
    topic,
  })
  await supervisorQueue.close()

  success(`Content injected into pipeline and queued in BullMQ`)
  console.log(`  ID:      ${rows[0].id}`)
  console.log(`  Topic:   ${rows[0].topic}`)
  console.log(`  State:   ${rows[0].state}`)
  console.log(`  Channel: ${channel}`)
  console.log(`\n  View status: pnpm --filter supervisor run cli status --channel ${channel}`)
}

async function advanceContent(opts: Record<string, string>) {
  const { id, to, reason, actor = 'cli:human' } = opts
  if (!id) return error('--id is required')
  if (!to) return error(`--to is required. Valid states: ${CONTENT_STATES.join(', ')}`)

  if (!CONTENT_STATES.includes(to as (typeof CONTENT_STATES)[number])) {
    return error(`Invalid state: ${to}`)
  }

  const { rows } = await db.query(
    'SELECT id, state FROM content_units WHERE id = $1',
    [id]
  )
  if (rows.length === 0) return error(`Content not found: ${id}`)

  const fromState = rows[0].state as string

  await db.query(
    `UPDATE content_units SET state = $1, updated_at = NOW() WHERE id = $2`,
    [to, id]
  )

  await db.query(
    `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, fromState, to, actor, reason ?? 'Manual advance via CLI']
  )

  success(`Content advanced: ${fromState} → ${to}`)
  console.log(`  ID: ${id}`)
}

async function abandonContent(opts: Record<string, string>) {
  const { id, reason = 'Manually abandoned via CLI' } = opts
  if (!id) return error('--id is required')

  const { rows } = await db.query(
    'SELECT id, state FROM content_units WHERE id = $1',
    [id]
  )
  if (rows.length === 0) return error(`Content not found: ${id}`)

  const fromState = rows[0].state as string

  await db.query(
    `UPDATE content_units SET state = 'ABANDONED', updated_at = NOW() WHERE id = $1`,
    [id]
  )

  await db.query(
    `INSERT INTO content_transitions (content_id, from_state, to_state, actor, reason)
     VALUES ($1, $2, 'ABANDONED', 'cli:human', $3)`,
    [id, fromState, reason]
  )

  success(`Content abandoned (${fromState} → ABANDONED)`)
}

async function showStatus(opts: Record<string, string>) {
  const { channel } = opts
  if (!channel) return error('--channel is required')

  const { rows: channelRows } = await db.query(
    'SELECT id, name FROM channel_registry WHERE slug = $1',
    [channel]
  )
  if (channelRows.length === 0) return error(`Channel not found: ${channel}`)

  const channelId = channelRows[0].id as string

  const { rows } = await db.query(
    `SELECT id, topic, state, attempt_counts, created_at, updated_at
     FROM content_units
     WHERE channel_id = $1
     ORDER BY updated_at DESC
     LIMIT 20`,
    [channelId]
  )

  console.log(`\n  PIPELINE STATUS — ${channelRows[0].name} (${channel})\n`)

  if (rows.length === 0) {
    console.log('  No content in pipeline.')
    console.log(`\n  Inject content: pnpm --filter supervisor run cli content:inject --channel ${channel} --topic "Your topic"`)
    return
  }

  // Group by state
  const byState: Record<string, typeof rows> = {}
  for (const row of rows) {
    const s = row.state as string
    if (!byState[s]) byState[s] = []
    byState[s].push(row)
  }

  for (const state of CONTENT_STATES) {
    const items = byState[state]
    if (!items || items.length === 0) continue

    console.log(`  ─── ${state} (${items.length}) ───`)
    for (const item of items) {
      const attempts = Object.entries(item.attempt_counts as Record<string, number>)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')

      console.log(`  • ${item.topic}`)
      console.log(`    ID: ${item.id}`)
      if (attempts) console.log(`    Attempts: ${attempts}`)
      console.log(`    Updated: ${(item.updated_at as Date).toLocaleString()}`)
    }
    console.log()
  }
}

async function showHistory(opts: Record<string, string>) {
  const { id } = opts
  if (!id) return error('--id is required')

  const { rows: content } = await db.query(
    'SELECT topic, state FROM content_units WHERE id = $1',
    [id]
  )
  if (content.length === 0) return error(`Content not found: ${id}`)

  const { rows } = await db.query(
    `SELECT from_state, to_state, actor, reason, transitioned_at
     FROM content_transitions WHERE content_id = $1
     ORDER BY transitioned_at ASC`,
    [id]
  )

  console.log(`\n  HISTORY — ${content[0].topic}\n`)
  console.log(`  Current state: ${content[0].state}\n`)

  for (const row of rows) {
    const time = (row.transitioned_at as Date).toLocaleString()
    console.log(`  ${time}`)
    console.log(`  ${row.from_state} → ${row.to_state}`)
    console.log(`  Actor: ${row.actor}${row.reason ? ` | ${row.reason}` : ''}`)
    console.log()
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs(args: string[]): Record<string, string> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg && arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = args[i + 1]
      if (value && !value.startsWith('--')) {
        opts[key] = value
        i++
      } else {
        opts[key] = 'true'
      }
    }
  }
  return opts
}

function success(msg: string) {
  console.log(`\n  ✓ ${msg}`)
}

function error(msg: string) {
  console.error(`\n  ✗ ${msg}\n`)
  process.exit(1)
}

function printHelp() {
  console.log(`
  COS CLI — Content Operating System

  CHANNEL COMMANDS
    channel:create  --name "Name" [--template technology] [--slug my-channel]
    channel:list
    channel:show    --channel <slug>

  CONTENT COMMANDS
    content:inject  --channel <slug> --topic "Topic to produce"
    content:advance --id <uuid> --to <state> [--reason "why"]
    content:abandon --id <uuid> [--reason "why"]

  MONITORING
    status          --channel <slug>
    history         --id <uuid>

  STATES: ${CONTENT_STATES.join(' | ')}
  `)
}

main().catch(err => {
  console.error('CLI error:', err)
  process.exit(1)
})
