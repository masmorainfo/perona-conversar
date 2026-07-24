# learnings.md — execution memory

## Protocol
- START of session: read this file before acting
- END of session (mandatory wrap-up): record what to avoid, which rule should change, what to do differently

## Active rules (semantic — always apply)
- **Operação Destrutiva/Massa**: Operação destrutiva ou em massa no banco de produção exige relatar o estado ANTES, o critério exato e a contagem afetada. Quando o objetivo é auditar, o critério deve ser por CONTEÚDO (ex: frases específicas), não apenas por janela de tempo.
- **E2E e Anti-Mock**: E2E significa ponta a ponta de verdade: research real → script real → render real. Sem exceção, nem "só em teste". Mock de roteiro fora de arquivos scratch (scripts de teste locais) é terminantemente proibido. Corolário da regra de Proibição Absoluta de Fallbacks com Mock.
- **Editorial vs. Factual**: Agentes de julgamento editorial não devem fazer verificação factual, assumindo os tópicos sugeridos como reais. Sua função é julgar estritamente a adequação ao CANON KAIRO e a qualidade narrativa. A verificação factual deve ocorrer estritamente na etapa seguinte, pelo Agente de Pesquisa (Research Agent).
- **Proibição Absoluta de Fallbacks com Mock/Template**: Para tarefas críticas do pipeline de produção (como geração de roteiros), o sistema deve falhar de forma explícita e imediata em vez de retornar dados falsos ou roteiros mock. Mocks que vazam para produção são incidentes graves de integridade do pipeline.
- **Proibição de Degradação Silenciosa em Fallback**: Fallback que degrada o produto final sem sinalizar é proibido — degradação silenciosa é falha, não resiliência. Se um renderizador principal (ex: Remotion) falhar, o job deve falhar explicitamente lançando erro, em vez de gerar um MP4 de qualidade inferior em silêncio.
- **Precisão das Ferramentas de Medição (Anti-Falso PASSOU)**: Ferramenta de medição precisa corresponder ao critério. `blackdetect` mede preto absoluto (RGB 0,0,0) e não serve para medir escuridão perceptual — use luminância média e percentual de pixels abaixo de limiar (luminância <10% / 26 de 255 em >90% dos pixels). Métrica que não mede o que o critério pede é pior que não medir, porque produz falso PASSOU.
- **Verificação Visual de Conteúdo (Fato vs. Imagem)**: Imagem buscada não é imagem verificada. Nenhum asset que afirme representar uma pessoa ou evento entra no vídeo sem verificação de conteúdo — relevância textual de busca não garante correspondência factual.
- **Licenciamento Estrito de Ativos (Anti-Fair Use)**: Fair use não é licença. Só entram no vídeo imagens com licença verificável registrada no manifest, ou geradas por IA. Doutrina de uso editorial não protege canal de detecção automática de direitos autorais.

## Incident log (episodic)

### [2026-07-24] Concorrência de jobId no BullMQ e falso modo de falha na camada de idempotência
- Incident: Adição de custom `jobId: ${contentId}:${state}` para garantir idempotência usava caractere `:` proibido pelo BullMQ. O `queue.add()` falhava capturado no Supervisor, deixando 13 units em limbo sem enfileiramento, posteriormente varridas pelo Reconciler como `QUEUE_ERROR`.
- Root cause: Falta de validação comportamental de runtime para nova camada de proteção e uso de caractere delimitador reservado pelo BullMQ.
- Rule learned: "Correção que adiciona mecanismo pode criar modo de falha novo — toda camada de proteção precisa de validação comportamental em ambiente real, não só build."

### [2026-07-20] Validação de encanamento com manifest incorreto (Fase 0)
- Incident: O re-render de validação local usou o manifest do Zidane (contendo ebfc no meio do UUID) em vez do ID correto do Neymar (ebfc1302).
- Root cause: Confusão de UUIDs parciais e falta de verificação explícita do ID do manifest.
- Rules learned:
  1. "Critério objetivo reprovado não se reclassifica por argumento estético." (Se a métrica de QA falhar, o status é FAILED, independente de justificativas artísticas/estéticas).
  2. "Validação por re-render exige confirmação explícita do contentId do manifest antes de renderizar."

### [2026-07-19] Repetição de tema (Baggio) + "sinal insuficiente" apesar de fontes ativas
- Root cause: Trends24 falha silenciosamente em produção (spawnSync /bin/sh ENOENT ao chamar Python via execSync); 5 dos 6 sensores do World Observer eram mocks hardcoded (Baggio, Zidane, Ronaldo, Adriano) nunca substituídos por integração real
- Fix applied: Substituição de execSync por execFileSync; remoção de mocks hardcoded
- Rule learned: "Nenhum sensor/fonte de dado pode ter fallback com conteúdo fixo — sempre retornar vazio honestamente se a fonte real falhar, nunca mascarar com exemplo hardcoded"
- Scope: apps/agents/world-observer/src/sensors.ts, Dockerfile (Python)
- Reversible: 3ee821f
- Status: candidate

## Consolidation (run periodically)
- Proven recurrence (2–3x) → promote the rule into CLAUDE.md and mark the entry retired
- Remove obsolete entries / ones referencing deleted files
- Keep the file lean (mirror the ~200-line budget)

