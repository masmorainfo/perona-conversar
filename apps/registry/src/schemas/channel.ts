import { z } from 'zod'

// ─── Zod Schemas — Channel Core ────────────────────────────────────────────────

const AudienceSchema = z.object({
  ageRange: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
  interests: z.array(z.string().min(1)).min(1),
  painPoints: z.array(z.string().min(1)).min(1),
  aspiration: z.string().min(1),
})

const PersonaSchema = z.object({
  archetype: z.string().min(1),
  tone: z.string().min(1),
  forbiddenWords: z.array(z.string()),
  preferredWords: z.array(z.string()),
})

const EditorialLimitsSchema = z.object({
  alwaysIn: z.array(z.string()).min(1, 'At least one always-in topic required'),
  alwaysOut: z.array(z.string()),
  humanReviewRequired: z.array(z.string()),
})

export const ChannelCoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  niche: z.string().min(1),
  language: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/, 'Must be BCP 47 format, e.g. pt-BR'),
  mission: z.string().min(10),
  audience: AudienceSchema,
  values: z.array(z.string().min(1)).min(1),
  editorialLimits: EditorialLimitsSchema,
  persona: PersonaSchema,
})

// ─── Zod Schemas — Channel Strategy ──────────────────────────────────────────

const ContentFormatSchema = z.enum([
  'explicativo', 'comparativo', 'analise', 'reacao', 'tutorial', 'noticia',
])

const PlatformSchema = z.enum(['youtube', 'tiktok', 'instagram', 'facebook', 'threads'])

const ContentPreferencesSchema = z.object({
  preferredFormats: z.array(ContentFormatSchema).min(1),
  avoidFormats: z.array(ContentFormatSchema),
  optimalDurationSeconds: z.object({
    min: z.number().min(15),
    max: z.number().max(3600),
  }),
  optimalPostingTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)),
  preferredEmotions: z.array(z.string().min(1)),
})

const PerformanceThresholdsSchema = z.object({
  editorialApprovalMinScore: z.number().min(0).max(1),
  criticApprovalMinScore: z.number().min(0).max(1),
  qcApprovalMinScore: z.number().min(0).max(1),
  publishMinScore: z.number().min(0).max(1),
})

export const ChannelStrategySchema = z.object({
  updatedAt: z.coerce.date(),
  updatedBy: z.string(),
  contentPreferences: ContentPreferencesSchema,
  performanceThresholds: PerformanceThresholdsSchema,
  platformWeights: z.record(PlatformSchema, z.number().min(0).max(1)),
  ctaPatterns: z.array(z.string().min(1)),
})

// ─── Zod Schemas — Create Channel Request ─────────────────────────────────────

export const CreateChannelSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  inheritsFrom: z.string().optional(),  // template slug
  core: ChannelCoreSchema,
  strategy: ChannelStrategySchema,
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
})

export const UpdateStrategySchema = ChannelStrategySchema.partial().extend({
  updatedBy: z.string(),
  reason: z.string().optional(),
})

export type CreateChannelInput = z.infer<typeof CreateChannelSchema>
export type UpdateStrategyInput = z.infer<typeof UpdateStrategySchema>
