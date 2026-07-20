# Graph Report - C:\AI\perona - conversar  (2026-07-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1965 nodes · 2185 edges · 147 communities (113 shown, 34 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3ee821f5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.ts
- dependencies
- dependencies
- page.tsx
- scripts
- query
- dependencies
- package.json
- dependencies
- dependencies
- dependencies
- index.ts
- package.json
- index.ts
- compilerOptions
- package.json
- index.ts
- package.json
- package.json
- package.json
- package.json
- package.json
- package.json
- package.json
- index.ts
- package.json
- package.json
- index.ts
- package.json
- index.ts
- package.json
- index.ts
- index.ts
- index.ts
- channel.ts
- index.ts
- index.ts
- package.json
- index.ts
- compilerOptions
- package.json
- package.json
- vie.ts
- index.ts
- dependencies
- devDependencies
- index.ts
- index.ts
- package.json
- index.tsx
- index.ts
- package.json
- compilerOptions
- compilerOptions
- eventHandler.ts
- package.json
- verify_analysis.sh
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- compilerOptions
- index.ts
- index.ts
- OpenAIProvider
- test_master_audio.mjs
- index.ts
- index.ts
- index.ts
- index.ts
- queue
- package.json
- compilerOptions
- compilerOptions
- tsconfig.json
- index.ts
- index.ts
- tsconfig.json
- tsconfig.json
- tsconfig.json
- tsconfig.json
- layout.tsx
- tsconfig.json
- tsconfig.json
- tsconfig.json
- tsconfig.json
- tsconfig.json
- ascii_diagrams.sh
- code_ref_formatter.sh
- config_manager.py
- extract-frames.sh
- video-info.sh
- inject_topic.cjs
- start_v8.mjs
- inject_topic.js
- inject_test_cycle.mjs
- start_pipeline.mjs
- test-insert.cjs
- reset_v8.mjs
- send_video.mjs
- migrate.js
- inject_test_signal.js
- production_db_sanitize.js
- scratch_query.js
- migrate.mjs
- insert-review-mock.mjs
- test-insert.mjs
- diagnose.ts
- LLMProvider
- Script
- test_agents.ts
- verify_all_refs.sh
- extract-audio.sh
- eslint.config.mjs
- migrate.js
- next.config.ts
- lucide-react
- @cos/events
- @cos/types
- framer-motion
- next
- pg
- recharts
- tailwind-merge
- @xyflow/react
- postcss.config.mjs
- check_kaka.mjs
- debug_cu.mjs
- reset_kaka.mjs
- test-query.cjs
- RenderEngine
- db_query.js
- needsTranslation

## God Nodes (most connected - your core abstractions)
1. `queue` - 25 edges
2. `compilerOptions` - 17 edges
3. `compilerOptions` - 16 edges
4. `MemoryProvider` - 15 edges
5. `query()` - 15 edges
6. `error()` - 13 edges
7. `main()` - 11 edges
8. `scripts` - 11 edges
9. `compilerOptions` - 11 edges
10. `compilerOptions` - 10 edges

## Surprising Connections (you probably didn't know these)
- `hasOverlappingPending()` --references--> `STOP_WORDS`  [EXTRACTED]
  packages/knowledge/cgl-writer/src/index.ts → apps/agents/media/src/memory-provider.ts
- `processCriticJob()` --indirect_call--> `error()`  [INFERRED]
  apps/agents/critic/src/index.ts → apps/supervisor/src/cli.ts
- `GET()` --indirect_call--> `error()`  [INFERRED]
  apps/mission-control/src/app/api/media/[filename]/route.ts → apps/supervisor/src/cli.ts
- `advanceContent()` --references--> `CONTENT_STATES`  [EXTRACTED]
  apps/supervisor/src/cli.ts → packages/types/src/index.ts
- `bootstrap()` --indirect_call--> `error()`  [INFERRED]
  apps/supervisor/src/index.ts → apps/supervisor/src/cli.ts

## Import Cycles
- None detected.

## Communities (147 total, 34 thin omitted)

### Community 0 - "index.ts"
Cohesion: 0.07
Nodes (35): AUDIO_GENES, CANON_DIRECTIONS, CinematicDirection, DEFAULT_DIRECTION, directNarrative(), __dirname, __filename, getActiveGeneOption() (+27 more)

### Community 1 - "dependencies"
Cohesion: 0.05
Nodes (41): dependencies, bullmq, @cos/events, @cos/types, dotenv, pg, react, react-dom (+33 more)

### Community 2 - "dependencies"
Cohesion: 0.05
Nodes (41): bin, cos, dependencies, bullmq, @cos/cgl-writer, @cos/events, @cos/notifications, @cos/state-machine (+33 more)

### Community 3 - "page.tsx"
Cohesion: 0.07
Nodes (22): AgentConversations(), AgentInspector(), CommandCenter(), ContentSandbox(), DailyBriefing(), DirectorView(), LearningCenter(), OverviewDashboard() (+14 more)

### Community 4 - "scripts"
Cohesion: 0.05
Nodes (40): dependencies, dotenv, @zernio/node, description, devDependencies, eslint, pg, tsx (+32 more)

### Community 5 - "query"
Cohesion: 0.10
Nodes (29): GET(), PATCH(), GET(), POST(), GET(), PATCH(), GET(), POST() (+21 more)

### Community 6 - "dependencies"
Cohesion: 0.06
Nodes (33): dependencies, bullmq, @cos/events, @cos/llm, @cos/types, dotenv, pg, @types/pg (+25 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (32): dependencies, bullmq, @cos/events, @cos/notifications, @cos/types, cron, dotenv, pg (+24 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bullmq, @cos/events, @cos/knowledge, @cos/llm, @cos/notifications, @cos/types, dotenv (+23 more)

### Community 9 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bullmq, @cos/events, @cos/types, dotenv, googleapis, pg, @types/pg (+23 more)

### Community 10 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bullmq, @cos/events, @cos/knowledge, @cos/llm, @cos/types, dotenv, @types/uuid (+23 more)

### Community 11 - "index.ts"
Cohesion: 0.06
Nodes (30): AnalyticsData, CanonArchetype, ChannelConfig, ChannelCore, ChannelStrategy, CinematicEvaluation, CLPResult, CLPStrategy (+22 more)

### Community 12 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, bullmq, @cos/events, @cos/llm, @cos/types, dotenv, pg, @types/pg (+21 more)

### Community 13 - "index.ts"
Cohesion: 0.10
Nodes (7): ChannelMemoryStore, PerformanceIndexStore, SignalTier, WorldKnowledgeStore, ChannelMemoryPgStore, PerformanceIndexPgStore, WorldKnowledgePgStore

### Community 14 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 15 - "package.json"
Cohesion: 0.07
Nodes (28): dependencies, @cos/types, express, pg, zod, devDependencies, tsx, @types/express (+20 more)

### Community 16 - "index.ts"
Cohesion: 0.07
Nodes (27): AnalyticsJobData, CinematicJobData, CinematicResultData, CriticJobData, CriticResultData, EditorialJobData, EditorialResultData, LearningJobData (+19 more)

### Community 17 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/types, dotenv, pg, devDependencies, tsx (+19 more)

### Community 18 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/knowledge, @cos/llm, @cos/types, dotenv, devDependencies (+19 more)

### Community 19 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/knowledge, @cos/llm, @cos/types, dotenv, devDependencies (+19 more)

### Community 20 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/types, dotenv, pg, devDependencies, tsx (+19 more)

### Community 21 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/types, dotenv, pg, @types/pg, devDependencies (+19 more)

### Community 22 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/knowledge, @cos/llm, @cos/types, dotenv, devDependencies (+19 more)

### Community 23 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/types, dotenv, ioredis, pg, devDependencies (+19 more)

### Community 24 - "index.ts"
Cohesion: 0.10
Nodes (21): bootstrap(), connection, __dirname, evaluateOpportunities(), __filename, opportunityQueue, pool, processSignal() (+13 more)

### Community 25 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, bullmq, @cos/events, @cos/llm, @cos/types, dotenv, pg, devDependencies (+19 more)

### Community 26 - "package.json"
Cohesion: 0.08
Nodes (25): dependencies, bullmq, @cos/cgl-writer, @cos/events, @cos/llm, dotenv, devDependencies, tsx (+17 more)

### Community 27 - "index.ts"
Cohesion: 0.13
Nodes (14): getPlatformAdapter(), InstagramAdapter, TikTokAdapter, PlatformAdapter, YouTubeAdapter, bootstrap(), connection, __dirname (+6 more)

### Community 28 - "package.json"
Cohesion: 0.08
Nodes (23): dependencies, bullmq, @cos/events, @cos/types, dotenv, devDependencies, tsx, typescript (+15 more)

### Community 29 - "index.ts"
Cohesion: 0.16
Nodes (19): escapeMarkdown(), EventPayload, formatDuration(), formatEvent(), NotificationEventType, shortId(), notify(), answerCallbackQuery() (+11 more)

### Community 30 - "package.json"
Cohesion: 0.09
Nodes (22): @anthropic-ai/sdk, openai, dependencies, @anthropic-ai/sdk, @cos/types, openai, devDependencies, dotenv (+14 more)

### Community 31 - "index.ts"
Cohesion: 0.13
Nodes (21): approveEntry(), AreaFile, CGL_ROOT, CGLArea, CGLEntry, __dirname, __filename, hasOverlappingPending() (+13 more)

### Community 32 - "index.ts"
Cohesion: 0.13
Nodes (20): bootstrap(), connection, __dirname, escMd(), __filename, KDRJobData, KDRResultData, mdCode() (+12 more)

### Community 33 - "index.ts"
Cohesion: 0.12
Nodes (17): calculateJaccard(), getWords(), GroupedSignal, groupSignals(), OpportunityEngine, OpportunityInput, bootstrap(), connection (+9 more)

### Community 34 - "channel.ts"
Cohesion: 0.11
Nodes (20): app, deepMerge(), __dirname, loadTemplate(), mergeWithTemplate(), pool, PORT, AudienceSchema (+12 more)

### Community 35 - "index.ts"
Cohesion: 0.14
Nodes (17): AudioQAResult, execAsync, runAudioQA(), bootstrap(), connection, __dirname, __filename, pool (+9 more)

### Community 36 - "index.ts"
Cohesion: 0.14
Nodes (19): bootstrap(), connection, __dirname, __filename, flushBuffer(), llm, normalizedQueue, pendingBuffer (+11 more)

### Community 37 - "package.json"
Cohesion: 0.10
Nodes (20): dependencies, @cos/types, pg, devDependencies, @types/pg, typescript, @cos/types, pg (+12 more)

### Community 38 - "index.ts"
Cohesion: 0.12
Nodes (10): VisualIdentityEngineAgent, CompletionOptions, ImageProvider, LLMProvider, LocalizationProvider, NVIDIA_TASK_MODELS, SpeechResult, TaskType (+2 more)

### Community 39 - "compilerOptions"
Cohesion: 0.11
Nodes (18): ES2022, compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, lib (+10 more)

### Community 40 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, bullmq, @cos/types, devDependencies, typescript, bullmq, @cos/types, typescript (+9 more)

### Community 41 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, @cos/types, xstate, devDependencies, typescript, @cos/types, typescript, xstate (+9 more)

### Community 42 - "vie.ts"
Cohesion: 0.11
Nodes (17): ChannelVisualDNA, DeepPartial, DnaAudio, DnaBranding, DnaLayout, DnaMotion, DnaPlatform, DnaStorytelling (+9 more)

### Community 43 - "index.ts"
Cohesion: 0.18
Nodes (15): bootstrap(), connection, __dirname, __filename, rawSignalsQueue, redisUrl, runSensorsCycle(), fetchAllSignals() (+7 more)

### Community 44 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bullmq, clsx, @monaco-editor/react, react, react-dom, @tanstack/react-query, @types/pg (+9 more)

### Community 45 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+9 more)

### Community 46 - "index.ts"
Cohesion: 0.23
Nodes (16): closeDb(), getPool(), initDb(), bootstrap(), connection, __dirname, escapeMarkdown(), __filename (+8 more)

### Community 47 - "index.ts"
Cohesion: 0.16
Nodes (15): bootstrap(), CRON_SCHEDULES, CycleResult, __dirname, __filename, logCycle(), MAX_OPPORTUNITIES_PER_CHANNEL, pool (+7 more)

### Community 48 - "package.json"
Cohesion: 0.12
Nodes (15): dependencies, undici, devDependencies, typescript, typescript, main, name, private (+7 more)

### Community 49 - "index.tsx"
Cohesion: 0.14
Nodes (6): CANON_THEMES, CanonTheme, MainVideoProps, TechnicalScene, VideoSection, WordTimestamp

### Community 50 - "index.ts"
Cohesion: 0.19
Nodes (12): assertNoCTA(), bootstrap(), connection, CTA_PATTERNS, __dirname, __filename, humanizerPass(), llm (+4 more)

### Community 51 - "package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, typescript, main, name, private, scripts, build (+5 more)

### Community 52 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir (+5 more)

### Community 53 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, jsx, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 54 - "eventHandler.ts"
Cohesion: 0.31
Nodes (11): getContentState(), persistTransition(), pool, dispatchNextAction(), getQueue(), handleCycleStarted(), handleSupervisorEvent(), mapJobToEvent() (+3 more)

### Community 55 - "package.json"
Cohesion: 0.15
Nodes (12): devDependencies, typescript, typescript, main, name, private, scripts, build (+4 more)

### Community 56 - "verify_analysis.sh"
Cohesion: 0.47
Nodes (11): log_check(), log_error(), log_info(), log_warning(), verify_analysis.sh script, verify_code_quote(), verify_document(), verify_file_exists() (+3 more)

### Community 57 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 58 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 59 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 60 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 61 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 62 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 63 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 64 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 65 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 66 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 67 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 68 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck, strict (+3 more)

### Community 69 - "index.ts"
Cohesion: 0.21
Nodes (7): contentMachine, ContentMachineContext, ContentMachineEvent, ContentMachineMetadata, isTerminalState(), makeContext(), runMachine()

### Community 70 - "index.ts"
Cohesion: 0.20
Nodes (9): bootstrap(), connection, __dirname, __filename, llm, pool, processResearchJob(), redisUrl (+1 more)

### Community 71 - "OpenAIProvider"
Cohesion: 0.24
Nodes (4): __dirname, __filename, execAsync, OpenAIProvider

### Community 72 - "test_master_audio.mjs"
Cohesion: 0.18
Nodes (9): audioFilter, __dirname, durationDiff, fadeStartSec, INPUT, inputDuration, OUTPUT, outputDuration (+1 more)

### Community 73 - "index.ts"
Cohesion: 0.22
Nodes (9): bootstrap(), connection, __dirname, __filename, llm, pool, processCinematicJob(), redisUrl (+1 more)

### Community 74 - "index.ts"
Cohesion: 0.22
Nodes (9): bootstrap(), connection, __dirname, __filename, llm, pool, processCriticJob(), redisUrl (+1 more)

### Community 75 - "index.ts"
Cohesion: 0.22
Nodes (9): bootstrap(), connection, __dirname, __filename, llm, pool, processEditorialJob(), redisUrl (+1 more)

### Community 76 - "index.ts"
Cohesion: 0.24
Nodes (9): bootstrap(), connection, __dirname, __filename, pool, processLearningJob(), processRejectionFeedback(), redisUrl (+1 more)

### Community 77 - "queue"
Cohesion: 0.20
Nodes (8): connection, __dirname, __filename, main(), pool, redisUrl, POST(), queue

### Community 78 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, start, type (+1 more)

### Community 79 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, outDir, rootDir, extends, include, src (+1 more)

### Community 80 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, outDir, rootDir, extends, include, src (+1 more)

### Community 81 - "tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, exclude, extends, include, src/**/*, ../../tsconfig.base.json (+1 more)

### Community 82 - "index.ts"
Cohesion: 0.25
Nodes (8): bootstrap(), connection, __dirname, __filename, pool, processAnalyticsJob(), redisUrl, supervisorQueue

### Community 83 - "index.ts"
Cohesion: 0.25
Nodes (8): bootstrap(), connection, __dirname, __filename, pool, processQualityJob(), redisUrl, supervisorQueue

### Community 84 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../../tsconfig.base.json

### Community 85 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../../tsconfig.base.json

### Community 86 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../../tsconfig.base.json

### Community 87 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../../tsconfig.base.json

### Community 88 - "layout.tsx"
Cohesion: 0.29
Nodes (5): metadata, oswald, roboto, GuidedTourOverlay(), TourState

### Community 89 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 90 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../../tsconfig.base.json

### Community 91 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 92 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 93 - "tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 94 - "ascii_diagrams.sh"
Cohesion: 0.52
Nodes (6): draw_box(), draw_flow(), draw_structure(), draw_table(), draw_tree(), ascii_diagrams.sh script

### Community 95 - "code_ref_formatter.sh"
Cohesion: 0.43
Nodes (4): format_ref(), code_ref_formatter.sh script, verify_check(), xref()

### Community 96 - "config_manager.py"
Cohesion: 0.38
Nodes (3): create_default_config(), get_config_file_path(), load_config()

### Community 97 - "extract-frames.sh"
Cohesion: 0.53
Nodes (4): is_positive_number(), is_time_value(), number_lte(), extract-frames.sh script

### Community 98 - "video-info.sh"
Cohesion: 0.53
Nodes (4): is_positive_number(), is_time_value(), number_lte(), video-info.sh script

### Community 99 - "inject_topic.cjs"
Cohesion: 0.33
Nodes (4): connection, { Pool }, { Queue }, redisUrl

### Community 100 - "start_v8.mjs"
Cohesion: 0.33
Nodes (5): connection, __dirname, __filename, pool, redisUrl

### Community 101 - "inject_topic.js"
Cohesion: 0.33
Nodes (4): connection, { Pool }, { Queue }, redisUrl

### Community 102 - "inject_test_cycle.mjs"
Cohesion: 0.40
Nodes (4): connection, pool, redisUrl, supervisorQueue

### Community 103 - "start_pipeline.mjs"
Cohesion: 0.40
Nodes (4): connection, pool, q, t

### Community 105 - "reset_v8.mjs"
Cohesion: 0.50
Nodes (3): __dirname, __filename, pool

### Community 106 - "send_video.mjs"
Cohesion: 0.50
Nodes (3): blob, formData, videoBuffer

## Knowledge Gaps
- **1052 isolated node(s):** `verify_all_refs.sh script`, `extract-audio.sh script`, `name`, `version`, `private` (+1047 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `queue` connect `queue` to `index.ts`, `index.ts`, `index.ts`, `query`, `start_v8.mjs`, `index.ts`, `index.ts`, `index.ts`, `index.ts`, `index.ts`, `index.ts`, `index.ts`, `eventHandler.ts`, `index.ts`, `index.ts`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `processCriticJob()` connect `index.ts` to `index.ts`, `queue`, `query`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `CONTENT_STATES` connect `query` to `index.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `verify_all_refs.sh script`, `extract-audio.sh script`, `name` to the rest of the system?**
  _1052 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._