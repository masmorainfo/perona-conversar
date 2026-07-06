# Content Operating System (COS)

> Uma plataforma capaz de transformar informação em conteúdo distribuído automaticamente,
> operando múltiplos canais e aprendendo continuamente com seus próprios resultados.

---

## Estado Atual do Sistema

### Status Operacional

**Pipeline Principal**

* 🟢 World Observer
* 🟢 Editorial Intelligence
* 🟢 Research Agent
* 🟢 Script Agent
* 🟢 Critic Agent
* 🟢 NVIDIA NIM (LLM)
* 🟢 Edge-TTS
* 🟡 Image Provider (Placeholder)
* 🟢 Render Engine
* 🟢 TikTok Publisher
* 🟢 VLS
* 🔴 Analytics Reais
* 🔴 QC Inteligente

### Próxima Missão

* ➡️ Fazer o COS trabalhar continuamente e notificar o operador via Telegram.

---

## Arquitetura

O COS é organizado em camadas de inteligência progressiva:

```
Input → Editorial Intelligence → Decision Engine → Research
     → Script → Critic → Media → Render → Quality → Publisher
     → Analytics → Learning → (volta para Editorial Intelligence)
```

Cada camada tem responsabilidade única. Nenhuma camada assume o papel de outra.

---

## Estrutura do projeto

```
cos/
├── apps/
│   ├── supervisor/    # Orquestrador do pipeline (XState + BullMQ)
│   ├── agents/        # Agentes TypeScript (editorial, research, script, critic...)
│   ├── render/        # Remotion render server
│   ├── learning/      # Learning Engine (Python)
│   └── registry/      # Channel Registry REST API
│
├── packages/
│   ├── types/         # Contratos TypeScript compartilhados
│   ├── events/        # Definições de eventos BullMQ
│   ├── state-machine/ # XState machine (máquina de estados do conteúdo)
│   └── knowledge/     # Acesso aos 3 Knowledge Stores
│
├── infra/
│   ├── docker-compose.yml
│   └── postgres/migrations/
│
└── channels/
    └── templates/     # Templates de canal (technology, entertainment, education)
```

---

## Início rápido

### Pré-requisitos
- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Configurar variáveis de ambiente
```bash
cp .env.example .env
# editar .env com suas configurações
```

### 3. Subir infraestrutura
```bash
pnpm infra:up
```

### 4. Executar migrações
```bash
pnpm db:migrate
```

### 5. Criar um canal
```bash
pnpm --filter supervisor run cli channel:create --template technology --name "TechBR"
```

### 6. Injetar um tema manualmente (Phase 1 — intervenção humana)
```bash
pnpm --filter supervisor run cli content:inject --channel tech-br-001 --topic "Novo modelo de IA da OpenAI"
```

### 7. Ver status do pipeline
```bash
pnpm --filter supervisor run cli status --channel tech-br-001
```

---

## Filosofia

> Nunca automatizar um processo ruim.
> Primeiro validar. Depois otimizar. Depois automatizar. Depois escalar.

Fase 1 do desenvolvimento é deliberadamente manual — o objetivo é validar
que a arquitetura funciona antes de automatizar qualquer decisão.

---

## Documentação arquitetural

- [SYSTEM_BLUEPRINT.md](./docs/SYSTEM_BLUEPRINT.md) — Visão e princípios
- [ARCHITECTURAL_DECISIONS.md](./docs/ARCHITECTURAL_DECISIONS.md) — Decisões tomadas e justificativas
- [TECH_STACK.md](./docs/TECH_STACK.md) — Stack técnica e justificativas
