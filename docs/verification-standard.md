# Padrão de Verificação Automática de Qualidade — KAIRO QC Gate

**Versão:** 1.1  
**Criado:** 2026-07-24  
**Estágio do Pipeline:** `RENDERED → CINEMATIC_REVIEWING`  
**Módulo:** `apps/agents/quality/src/quality-checker.ts`

---

## Status de Validação

| Critério | Implementado | Testado em regressão |
|---|---|---|
| C1 Áudio presente | ✅ 2026-07-24 | ✅ medido em `ebfc1302` e `19fc76ad` |
| C2 Dark frames ≤10% | ✅ 2026-07-24 | ✅ medido em `ebfc1302` e `19fc76ad` |
| C3 Resolução mínima | ✅ 2026-07-24 | ✅ medido em `ebfc1302` e `19fc76ad` |
| C4 Duração no intervalo | ✅ 2026-07-24 | ✅ medido em `ebfc1302` e `19fc76ad` |
| C5 Licença + Verdict | ✅ 2026-07-24 | ⏳ pendente — manifest não persistido em `ebfc1302`/`19fc76ad` (existentes antes de 2026-07-24); regressão em andamento |
| C6 Karaokê/timestamps | ✅ 2026-07-24 | ⏳ pendente — idem C5 |
| C7 LUFS | ✅ 2026-07-24 | ✅ medido: `ebfc1302` = −21.6 LUFS ✅, `19fc76ad` = −14.9 LUFS ✅ |

> **Nota de honestidade:** C5 e C6 foram implementados com os campos e paths corretos confirmados na estrutura real do manifest (`scene.layout.sourcingMetadata`, `scene.captions.wordTimestamps`, `verdict: 'ACCEPTED'|'DISCARDED'`). O teste de regressão com valores medidos ficará pendente até o primeiro vídeo processado com `storyManifestAudit` persistido no banco (a partir de 2026-07-24). Nenhum vídeo será declarado "aprovado em C5/C6" sem evidência medida.

---

## Princípio

> Nenhum vídeo avança do estado `RENDERED` para `CINEMATIC_REVIEWING` sem passar nos 7 critérios objetivos medidos por código. A avaliação é automática, determinística e registrada em log com os valores medidos — não apenas booleanos.

O gate é **conservador por padrão**: se o manifest não estiver disponível em disco (ex: container reiniciado), C5 e C6 **reprovam** — o pipeline trava em `RENDERED` até retry com manifest presente.

---

## Os 7 Critérios

| # | Critério | Ferramenta de Medição | Threshold / Gate | Campo no Checklist |
|---|---|---|---|---|
| C1 | **Áudio presente** | `ffprobe stream=codec_type` | faixa `audio` detectada | `hasAudio` |
| C2 | **Dark frames ≤10%** | FFmpeg `fps=1,format=gray` + análise pixel-a-pixel (raw YUV) | pixels < 26/255 em > 90% do frame = frame escuro; ≤10% dos frames amostrados podem ser escuros | `noBlackFrames` |
| C3 | **Resolução mínima** | `ffprobe stream=width,height` | width ≥ 720 **e** height ≥ 1280 (9:16 vertical) | `resolutionMeetsRequirements` |
| C4 | **Duração no intervalo** | `ffprobe format=duration` | 10s ≤ duração ≤ 120s | `durationWithinRange` |
| C5 | **Imagem licenciada + veredicto ACCEPTED** | Manifest JSON: `scene.layout.sourcingMetadata` | `license` presente + `source` em allowlist (wikimedia/openverse/pexels/google_cse) + `verdict === 'ACCEPTED'`. Cenas `isAiFallback=true` ou `isAbstraction=true` são isentas. | `allImagesLicensedAndVerified` |
| C6 | **Karaokê com timestamps sincronizados** | Manifest JSON: `scene.captions.wordTimestamps` | Pelo menos 1 cena narrada com `wordTimestamps.length > 0`. Cenas sem narração (`narrationPath` ausente) não são penalizadas. | `hasKaraokeTimestamps` |
| C7 | **Audio loudness na faixa** | FFmpeg `loudnorm=print_format=json` (campo `input_i`) | −24 LUFS ≤ LUFS integrado ≤ −9 LUFS | `audioLevelAcceptable` |

---

## Score de Qualidade

```
score = critérios_que_passaram / 7
```

Aprovação exige todos os 7: `approved = (score === 1.0)`.

O score proporcional é registrado no `metadata.qcScore` para fins de aprendizado VLS, mas **não é usado como threshold de aprovação** — é binário (todos ou nenhum).

---

## Allowlist de Fontes de Imagem (C5)

| Fonte | Identificador no `sourcingMetadata.source` |
|---|---|
| Wikimedia Commons | `wikimedia` |
| Openverse (Creative Commons) | `openverse` |
| Pexels | `pexels` |
| Google Custom Search (com direitos) | `google_cse` |

Qualquer outra fonte (`getty`, `shutterstock`, fonte desconhecida, etc.) **reprova** a cena automaticamente.

---

## Fluxo de Falha

Se o gate reprovar, o Supervisor recebe `QC_FAIL` com `reason` contendo o código do critério e o valor medido:

```
C2-DarkFrames: 8/12 (66.7% > 10%) | C5-Licença/Verdict: cenas com problema: [2efd782a:verdict_DISCARDED] | C7-LUFS: -6.2 LUFS (gate: -24 a -9)
```

O estado permanece em `RENDERED` (ou transiciona para estado de falha configurado no `pipeline-states.ts`). O operador recebe card no Telegram com os motivos.

---

## Lição Incorporada (2026-07-24)

> **"Métrica errada = falso PASSOU."**
>
> O gate anterior usava `hasAudio` como proxy para áudio aceitável (C1 e C7 eram o mesmo critério). Um vídeo com áudio muito silencioso (< −24 LUFS) ou saturado (> −9 LUFS) passava. C7 agora mede LUFS real via `loudnorm`.
>
> C5 antes verificava apenas a *presença* de `sourcingMetadata`. Agora exige `verdict === 'ACCEPTED'` — o Visual Verifier pode rejeitar uma imagem com licença válida mas sujeito errado (ex: estádio de futebol americano quando o tópico é futebol europeu).
>
> C6 era ausente. Narração com voz expressiva mas sem timestamps no manifest = karaokê falso na tela (legendas estáticas, não sincronizadas).

---

## Notas de Evolução (V2)

- **C6 V2:** Adicionar análise espectral de pitch variance para detectar monotonia de TTS sintetizado (FFmpeg `amultiply` + zero-crossing rate). Threshold preliminar: ZCR variance < 3 Hz → suspeito de TTS não-expressivo.
- **C2 refinamento:** Considerar luminância média < 40/255 como critério alternativo a pixel-a-pixel para cenários de contraste artístico intencional (fade-in escuro no hook).
- **C5 futuro:** Adicionar verificação de data da imagem quando disponível em EXIF (rejeitar imagens de época errada para o tópico histórico).
