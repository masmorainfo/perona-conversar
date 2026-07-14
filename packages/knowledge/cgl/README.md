# Cinematic Genome Library (CGL)

A biblioteca de conhecimento cinematográfico da KAIRO.

## O que é

A CGL armazena referências visuais, princípios narrativos e vocabulário técnico organizados por área temática. Cada área é um arquivo JSON com entradas padronizadas, consumíveis pelo Director, Storyboard Planner e KDR.

## Relação com Canon e DNA

| Camada | Pergunta | Mutabilidade |
|---|---|---|
| **CANON** (`dna/CANON.md`) | *Por que fazer?* | Permanente — só muda por decisão do editor-chefe |
| **DNA** (`dna/kairo_dna.json`) | *O que fazer agora?* | Operacional — mutável pelo VLS com evidências |
| **CGL** (`packages/knowledge/cgl/`) | *Como fazer?* | Técnico — cresce por inserção manual ou pesquisa KDR |

## Áreas (13)

| Arquivo | Área | Escopo |
|---|---|---|
| `fotografia.json` | Fotografia | Enquadramentos, iluminação, composição |
| `storytelling.json` | Storytelling | Arcos narrativos, gancho, clímax, subtexto |
| `ritmo.json` | Ritmo | BPM narrativo, cadência de cortes, respiração visual |
| `montagem.json` | Montagem | Jump cut, match cut, L-cut, J-cut, continuidade |
| `som.json` | Som | Soundscape, silêncio, leitmotif, crescendo |
| `cor.json` | Cor | Paletas, temperatura, dessaturação, contraste simbólico |
| `futebol.json` | Futebol | Jogadores-arquétipo, momentos históricos, contexto |
| `emocoes.json` | Emoções | Taxonomia emocional, mapeamento emoção→técnica visual |
| `simbolismo.json` | Simbolismo | Objetos simbólicos, metáforas visuais, iconografia |
| `cinema.json` | Cinema | Mestres (Salgado, Kubrick, Marker, Wong Kar-wai, Richter) |
| `referencias.json` | Referências | Filmes, documentários, séries — referências externas |
| `documentarios.json` | Documentários | Técnicas documentaristas, vérité, narração |
| `linguagem_visual.json` | Linguagem Visual | Tipografia, overlays, vignettes, transições |

## Formato de entrada

```json
{
  "id": "foto-001",
  "concept": "Close-up extremo de rosto",
  "description": "Enquadramento que isola a emoção pura",
  "tags": ["close-up", "rosto", "emoção"],
  "canon_link": "Parte II — Mestre I (Sebastião Salgado)",
  "source": "manual",
  "added_at": "2026-07-08T06:30:00Z"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | ✅ | Prefixo da área + sequencial (ex: `foto-001`) |
| `concept` | ✅ | Nome curto do conceito/técnica |
| `description` | ✅ | Quando e por que usar |
| `tags` | ✅ | Tokens para busca semântica |
| `canon_link` | ❌ | Referência à seção do CANON |
| `source` | ✅ | `"manual"` ou `"kdr"` |
| `added_at` | ✅ | ISO 8601 |

## Como adicionar entradas

1. Abra o arquivo da área correspondente (ex: `fotografia.json`)
2. Adicione um objeto ao array `entries` seguindo o formato acima
3. Incremente o `entry_count` da área no `index.json`
4. Incremente o `total_entries` no `index.json`

Entradas vindas do KDR passam por aprovação do operador antes de serem gravadas.
