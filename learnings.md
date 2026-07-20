# learnings.md — execution memory

## Protocol
- START of session: read this file before acting
- END of session (mandatory wrap-up): record what to avoid, which rule should change, what to do differently

## Active rules (semantic — always apply)
- [ainda vazio — regras entram aqui quando um padrão se repetir 2-3x]

## Incident log (episodic)

### [2026-07-19] Repetição de tema (Baggio) + "sinal insuficiente" apesar de fontes ativas
- Root cause: Trends24 falha silenciosamente em produção (spawnSync /bin/sh ENOENT ao chamar Python via execSync); 5 dos 6 sensores do World Observer eram mocks hardcoded (Baggio, Zidane, Ronaldo, Adriano) nunca substituídos por integração real
- Fix applied: [preencher após a correção ser aplicada]
- Rule learned: "Nenhum sensor/fonte de dado pode ter fallback com conteúdo fixo — sempre retornar vazio honestamente se a fonte real falhar, nunca mascarar com exemplo hardcoded"
- Scope: apps/agents/world-observer/src/sensors.ts, Dockerfile (Python)
- Reversible: [preencher com hash do commit de correção]
- Status: candidate

## Consolidation (run periodically)
- Proven recurrence (2–3x) → promote the rule into CLAUDE.md and mark the entry retired
- Remove obsolete entries / ones referencing deleted files
- Keep the file lean (mirror the ~200-line budget)
