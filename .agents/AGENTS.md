# Regras do Projeto — Content Operating System (COS)

## Princípio da Aprovação Arquitetural

Sempre que uma decisão alterar qualquer um dos itens abaixo, o agente **deve interromper a execução e aguardar aprovação explícita** antes de prosseguir:

- **Arquitetura** — adição ou remoção de componentes, alteração do contrato entre componentes (eventos, filas, schemas de banco)
- **Filosofia operacional** — princípios que regem o comportamento do sistema (ex: Dupla Entrada, Lei Zero do VLS)
- **Domínio do problema** — o que o sistema faz, para quem, por quê
- **Comportamento do sistema** — o que um agente faz, quando age, em que ordem, com quais condições
- **Experiência do operador** — qualquer alteração no CLI, Mission Control ou qualquer interface humana

### Decisões que exigem aprovação (exemplos)
- Adicionar ou remover um componente ao sistema
- Alterar o contrato entre dois componentes (eventos, filas, schemas)
- Mudar o comportamento de um agente (o que ele faz, quando, em que ordem)
- Criar um novo estado na máquina de estados
- Alterar a experiência do operador no CLI ou Mission Control
- Qualquer desvio em relação a um plano já aprovado

### Decisões que podem ser assumidas autonomamente (exemplos)
- Nome de variável local ou estrutura interna de uma função
- Ordem de campos em um log ou comentário
- Refatoração interna que não altera o contrato externo do componente
- Formatação, tipagem, documentação de código

---

## Princípio do Mínimo Necessário

Implementar apenas o mínimo necessário para o ciclo atual. Não antecipar funcionalidades que ainda não foram validadas.

## Princípio da Dupla Entrada

O COS possui duas portas oficiais de entrada, ambas permanentes e igualmente válidas:
- **Entrada Autônoma** — iniciada pelo Cycle Clock
- **Entrada Manual** — iniciada pelo operador via CLI, Mission Control ou API autorizada

Ambas convergem para o mesmo pipeline operacional. Nenhuma recebe tratamento especial. A única diferença registrada é o campo `origin` em `content_units`.

## Filosofia de Automação

> Nunca automatizar um processo ruim.  
> Primeiro validar. Depois otimizar. Depois automatizar. Depois escalar.

## VLS — Lei Zero

> Um experimento científico válido manipula EXATAMENTE UMA variável independente.

O VLS não cria regras. O VLS não define templates. O VLS descobre o que funciona — e por quê.

---

## Fase 2 — Operação do Canal KAIRO (TikTok)

### 1. Foco do Ecossistema
O COS e o VLS agora operam como uma empresa de mídia focada no canal do TikTok **@90kairo** com o tema **Futebol Mundial**. Todo esforço do sistema deve servir a este canal.

### 2. Ciclo Evolutivo Obrigatório
Nenhuma funcionalidade deve ser construída em cascata. Toda evolução segue estritamente o fluxo:
`Construir` → `Validar` → `Operar` → `Observar` → `Aprender` → `Evoluir`.
Se uma alteração não puder ser validada no mesmo dia através de vídeos reais publicados, ela não deve ser implementada.

### 3. Responsabilidade de Menor Entrega
A prioridade do engenheiro/agente é propor a menor entrega possível que:
* Seja pequena e entregue no mesmo dia.
* Possa ser validada com vídeos publicados no TikTok.
* Produza dados e evidências científicas para o VLS.

### 4. Direção Cinematográfica e VLS
O gargalo atual é a direção cinematográfica (ritmo, narrativa, composição e identidade audiovisual). O VLS deve descobrir essa linguagem manipulando exatamente um gene do DNA Cinematográfico por vez. O DNA do canal não deve ser inventado, mas sim descoberto por evidências empíricas.

### 5. Escala Orgânica
A meta futura de 24 vídeos/dia (1 por hora) é um horizonte operacional. A progressão de escala deve ser estritamente gradual:
`1 vídeo excelente` → `2 vídeos` → `4` → `8` → `12` → `24`.
Apenas avançar para o próximo nível quando a frequência anterior estiver totalmente estável.### 6. Interface do Telegram (Painel Editorial Móvel)
O Telegram é o painel de decisão e curadoria móvel do operador. Ao finalizar um vídeo, o operador deve receber um card no Telegram contendo:
* Título, resumo, duração, status de assinatura e link de visualização.
* Botões de ação direta: **[▶ Assistir]**, **[🟢 Aprovar]**, **[🔴 Rejeitar]**, **[🟡 Solicitar Ajustes]**.
* Ao selecionar **[🔴 Rejeitar]**, o painel deve exibir opções rápidas de descarte com 1 toque:
  * *Não representa a marca*
  * *Narração artificial*
  * *Direção cinematográfica*
  * *Imagens inadequadas*
  * *Legendas ruins*
  * *Boa ideia, má execução*
* A resposta do operador deve realimentar o loop de aprendizado do VLS imediatamente.

### 7. Assinatura Editorial como Princípio Arquitetural
A etapa pós-renderização não visa calcular notas numéricas arbitrárias ou scores estatísticos de arte. Ela existe puramente para responder à pergunta: *"A KAIRO assinaria este vídeo?"*
* O sistema opera com vereditos binários: **Assinável (Signable)** ou **Não Assinável (Unsignable)**.
* Em caso de veredito *Não Assinável*, o agente deve mapear e listar os motivos qualitativos da falha estrutural para re-direção do processo.

### 8. Maturidade de Evidências do DNA
A evolução dos genes no DNA Cinematográfico e Narrativo (`dna/kairo_dna.json`) reflete o acúmulo de evidências científicas e maturidade de teste, seguindo a escala:
* **Experimental** — hipóteses estéticas novas com poucas amostras.
* **Validado** — genes que provaram performance e aderência em testes empíricos.
* **Consolidado** — base sólida e comprovada da identidade do canal.
* **Dormant (Adormecido)** — genes temporariamente descartados ou inaptos que mantêm seu histórico de dados para posterior ativação experimental deliberada via Mission Control. O VLS preserva a memória e nunca apaga decisões editoriais.

### 9. Princípio da Humildade Editorial
> Nenhum vídeo será publicado apenas porque o sistema acredita que está bom. A decisão final de representar a marca pertence sempre ao editor-chefe. O COS aprende. O VLS preserva a memória artística da KAIRO. Mas quem assina a obra continua sendo humano.

---

## Cinematic Engine — Princípios de Linguagem

### 1. Nomenclatura Semântica Obrigatória
Toda a base de código e documentação deve substituir a expressão **"Gerar vídeo"** pela intenção conceitual de **"Dirigir Narrativa Audiovisual"**. A KAIRO não cria arquivos de mídia; ela dirige narrativas.

### 2. Separação de Decisão e Execução
A Cinematic Engine divide a direção em 4 camadas bem delimitadas:
* **Director (Camada de Decisão):** Decisão artística abstrata (humor, ritmo, tom dramático). Livre de parâmetros de código de frontend ou renderização.
* **Storyboard Planner (Camada de Edição):** Organiza a narrativa em planos de corte e enquadramentos, consumindo as memórias do Memory Provider e emitindo o **Story Manifest (JSON)**.
* **Memory Provider (Camada de Ativos):** Responde se existe representação autêntica (foto, áudio original, vídeo) do fato histórico. A IA é estritamente o último fallback.
* **Remotion (Camada de Execução):** Executor técnico, burro e mecânico do Story Manifest.

