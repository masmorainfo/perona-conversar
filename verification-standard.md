# Verification Standard

Este documento define os critérios objetivos e absolutos de qualidade (Verification Gates) exigidos para cada peça de conteúdo gerada pelo sistema para a KAIRO.

## Acceptance Criteria (7 Critérios)

1. **Duração real vs. Planejada**
   - A duração do artefato final (vídeo renderizado) deve corresponder à duração calculada no planejamento, com variação máxima tolerada de +/- 2 segundos.

2. **Ausência de Silêncio Anômalo**
   - O arquivo de áudio final ou a trilha combinada não deve conter blocos contínuos de silêncio acima de 1.5 segundos a menos que intencionalmente roteirizado (pausa dramática explícita).

3. **Tamanho de Arquivo dentro do Limite**
   - O payload e o arquivo final devem respeitar os limites operacionais da plataforma de destino (ex: < 50MB ou specs do TikTok) sem estourar limites de memória durante o upload.

4. **Aprovação do Critic**
   - A camada `Critic` (ou Cinematic Review) emitiu explicitamente o veredito "Assinável (Signable)" indicando que a KAIRO assumiria a autoria do material.

5. **QA Checklist Completo**
   - Nenhum log de warning severo na renderização. Todos os assets (áudios, imagens, fontes) resolvidos com sucesso (HTTP 200 ou file exists). Nenhuma tela preta residual.

6. **Gene do DNA Rastreável**
   - O conteúdo faz uso de pelo menos um "Gene" rastreável (visual ou narrativo) registrado em `kairo_dna.json` e o pipeline de aprendizado consegue identificar qual foi utilizado para o VLS testar.

7. **Publicação Confirmada com Post ID Real**
   - O pipeline não é considerado finalizado no ato do envio ("disparado para API"), mas sim quando retorna e persiste o `Post ID` ou link permanente provando que o ativo está online e público.

## Baseline de Qualidade
- **Referência Aprovada:** `KAI-HIP-007` (Vídeos gerados e publicados com sucesso e Post IDs salvos: `6a5c57fc18bb8b79257e7f8b` e `6a5c57bb94f59c8d4a1a0c2c`). Qualquer nova geração deve manter, no mínimo, este patamar técnico.

## Output de um Check Run
Cada validação deverá gerar um relatório binário (PASS/FAIL) para os 7 critérios antes da autorização de encerramento do ciclo de geração.
