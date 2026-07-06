# COS Design Language v1.0
*(Documento Congelado - Referência Obrigatória para todas as telas futuras)*

## Conceito Central: "Mission Control & Intelligence"
Uma interface que não tenta ser um site de marketing ou um painel SaaS genérico. É uma ferramenta de operação densa, focada em observabilidade, tomada de decisão rápida e fluxo contínuo. 

O design favorece a densidade de informações, legibilidade absoluta e uma hierarquia tática rigorosa. O usuário não deve sentir que está navegando em uma página web, mas sim pilotando um sistema inteligente.

---

## Princípio de UX: Clareza e Ação
Toda tela deve responder imediatamente às seguintes perguntas:
1. **O que aconteceu?**
2. **Por que aconteceu?**
3. **O que exige minha atenção?**
4. **Qual é a próxima ação?**

---

## 1. Design Tokens (Fundamentos)

A fonte da verdade para as cores são as variáveis CSS `--cos-*` definidas em `globals.css`. O Tailwind consome essas variáveis como tokens semânticos.

### Cores (Palette)
A paleta é construída sobre tons de cinza profundos e um azul-escuro quase preto, utilizando a cor lavanda como o farol de atenção (signal). Não usaremos cores puras e genéricas; tudo tem uma saturação levemente acinzentada para conforto visual em uso contínuo.

- **Base/Background:** `--cos-background` (`#0b0b10` / Dark Void) - Usado no fundo principal (body).
- **Surface 1:** `--cos-surface-1` (`#11111b` / Mantle) - Usado para modais, painéis secundários, e divisões de tela (sidebars).
- **Surface 2:** `--cos-surface-2` (`#181825` / Crust) - Usado para cards, botões inativos e fundos de hover.
- **Accent (Signal):** `--cos-accent` (`#cba6f7` / Lavender) - Nossa "cor inteligente". Usada exclusivamente para ações primárias, focos de input, e estados de "Ação Requerida". 
- **Cores Semânticas:**
  - **Success:** `--cos-success` (`#a6e3a1` / Green) - Processos concluídos, Scores altos.
  - **Warning:** `--cos-warning` (`#f9e2af` / Yellow) - Processamento em andamento, Alertas.
  - **Danger:** `--cos-danger` (`#f38ba8` / Red) - Rejeições, Erros, Interrupção de automação.
  - **Info:** `--cos-info` (`#89b4fa` / Blue) - Informações complementares, links, estados neutros.

### Tipografia
Fugimos da monotonia do padrão web. Misturamos a precisão técnica com legibilidade.

- **Monospace (Tática/Dados):** Usada para metadados, status, IDs, labels de pequenos formulários e numerais. (Exemplo: Tags como `Aguardando`). Traz a estética "Terminal/Dev".
- **Sans-Serif (Primária):** Usada para títulos principais, nomes de funcionalidades e leitura limpa. 
- **Serif (Editorial):** Usada apenas dentro de inputs de texto longos que representam o "conteúdo bruto" (ex: roteiros e roteiros), separando psicologicamente o que é *ferramenta* do que é *produto*.

### Espaçamento & Bordas
- **Rhythm:** Densidade controlada. Espaços não servem para "embelezar", mas para separar áreas lógicas.
- **Bordas (Radius):** Menos arredondamentos exagerados. Modais e cards usam `rounded-xl` ou `rounded-2xl`, botões primários também, criando uma sensação moderna porém de "ferramenta séria".
- **Linhas (Strokes):** Uso intenso de bordas hiperfinas (`border-white/5` ou `border-white/10`) para delimitar espaços, evitando pesados contrastes de blocos de cor.

---

## 2. Componentes e Comportamentos

### Efeito de Profundidade ("Liquid Glass")
- Usado de maneira utilitária, não apenas estética. O `backdrop-blur` é reservado para separar camadas ativas (Modais, Notificações, Overlays flutuantes) do fundo da aplicação, mantendo o contexto visível mas fora de foco.

### Painéis de Decisão (Decision Docks)
- As ações de qualquer página (Aprovar, Salvar, Rejeitar) não devem ficar soltas no layout. Elas serão aglutinadas em painéis no rodapé da área de trabalho, funcionando como "Control Panels". 
- O botão primário é o único que ganha preenchimento total e brilho suave.

### Indicadores de Estado (Tags/Badges)
- Sempre em letras maiúsculas (`UPPERCASE`), fonte `mono`, tamanho minúsculo (`text-[10px]`) e com letras espaçadas (`tracking-widest`).

### Experiência de Inputs
- Formulários não têm cara de formulário web tradicional. Possuem fundo escuro `bg-black/40` e bordas tênues. Ao receber foco, iluminam apenas a borda na cor lavanda e a Label do campo brilha junto.
