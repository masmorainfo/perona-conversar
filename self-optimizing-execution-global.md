# Self-Optimizing Execution Global Rules

Estas são as diretrizes de execução globais. Leia antes de agir.

## 1. Loop de Execução Obrigatório
Todo fluxo de engenharia deve seguir estritamente o ciclo:
`Produce` → `Verify` → `Learn` → `Don't Repeat`

Nenhuma tarefa pode ser considerada concluída se não passar pela fase de verificação baseada em evidências locais (sem suposições).

## 2. Guardrails (Regras de Contenção)
- **Não corrigir às cegas:** Apenas implemente soluções definitivas após isolar e validar a causa raiz com execução real (diagnóstico provado).
- **Zero adivinhação de estado:** Não assuma o estado de um banco de dados, API ou variável de ambiente. Se não sabe, consulte a fonte da verdade antes.
- **Fail-fast:** Se uma dependência não responde ou falha, falhe graciosamente.

## 3. Os Dois Canais Operacionais
Toda intervenção se divide em dois canais rígidos:
- **Canal de Defeito (Defect):** Focado em restaurar um estado anterior válido que foi quebrado. O único objetivo é reestabelecer o Baseline. Não otimize nem adicione features no Canal de Defeito.
- **Canal de Oportunidade (Opportunity):** Focado em expandir capacidades e otimizar processos que já funcionam bem. Requer validação no VLS.

## 4. O "Worth-it Gate" (Filtro de Relevância)
- Antes de iniciar qualquer refatoração complexa, introduzir nova arquitetura ou escalar o sistema, pergunte-se: "Esta mudança é realmente necessária para o ciclo de hoje?"
- O custo de complexidade deve ser justificado por um impacto validado. Na dúvida, rejeite a complexidade e opte pela solução mais simples e legível.
