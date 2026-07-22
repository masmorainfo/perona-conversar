export interface SourcedVisual {
  url: string;
  source: string;
  license: string;
  author?: string;
  title?: string;
  queryUsed: string;
}

/**
 * Constrói a cascata de queries de busca (Query Fallback Cascade)
 * Separando busca de entidades concretas do prompt poético.
 */
export function getQueryVariants(topic: string, visualDescription: string, sceneText: string): string[] {
  const queries: string[] = [];

  // 1. Extrair Entidades do Tópico (jogadores, times, campeonatos)
  const topicClean = topic
    .replace(/[:,-]/g, ' ')
    .replace(/\b(no|nos|na|nas|do|dos|da|das|de|em|um|uma|o|a|e|que|para|com|por)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const entities: string[] = [];
  if (/neymar/i.test(topic)) entities.push('Neymar');
  if (/santos/i.test(topic)) entities.push('Santos');
  if (/pel[eé]/i.test(topic)) entities.push('Pele');
  if (/messi/i.test(topic)) entities.push('Messi');
  if (/ronaldo|cr7/i.test(topic)) entities.push('Ronaldo');
  if (/flamengo/i.test(topic)) entities.push('Flamengo');
  if (/palmeiras/i.test(topic)) entities.push('Palmeiras');
  if (/corinthians/i.test(topic)) entities.push('Corinthians');
  if (/real madrid/i.test(topic)) entities.push('Real Madrid');
  if (/barcelona/i.test(topic)) entities.push('Barcelona');

  // Query Nível 1: Par Entidade Principal + Time/Contexto
  if (entities.length >= 2) {
    queries.push(`${entities[0]} ${entities[1]}`);
    queries.push(`${entities[0]} 2011`);
  } else if (entities.length === 1) {
    queries.push(`${entities[0]} Santos`);
    queries.push(entities[0]);
  }

  // Query Nível 2: Contexto Específico da Cena (estádio, torcida, troféu, drible)
  const visualClean = visualDescription.replace(/Hook visual:|CTA visual:|Cena \d+:|visual:/gi, '').trim();
  if (/est[aá]dio|stadium|torcida|crowd/i.test(visualClean + ' ' + sceneText)) {
    queries.push('football stadium');
    queries.push('soccer crowd');
  } else if (/trof[eé]u|ta[çc]a|trophy|cup|libertadores/i.test(visualClean + ' ' + sceneText)) {
    queries.push('Copa Libertadores');
    queries.push('football trophy');
  } else {
    queries.push('football match');
    queries.push('soccer game');
  }

  // Query Nível 3: Time / Termos Genéricos
  if (/santos/i.test(topic)) {
    queries.push('Santos FC');
  }
  queries.push('football stadium');
  queries.push('soccer match');

  return Array.from(new Set(queries.filter(q => q.trim().length > 0)));
}

/**
 * Tenta buscar imagem real licenciada através da cascata de fontes (Wikimedia → Openverse → Pexels).
 * Mantém histórico de URLs usadas para garantir diversidade visual no vídeo.
 */
export async function sourceVisual(
  topic: string,
  visualDescription: string,
  sceneText: string,
  usedUrls: Set<string> = new Set()
): Promise<SourcedVisual | null> {
  const queries = getQueryVariants(topic, visualDescription, sceneText);
  console.log(`[Sourcing] Cascata de queries para cena: [${queries.map(q => `"${q}"`).join(', ')}]`);
  const failures: string[] = [];

  for (const searchQuery of queries) {
    // 1. Tentar Wikimedia Commons
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=filetype:bitmap|drawing+${encodeURIComponent(searchQuery)}&gsrlimit=10&prop=imageinfo&iiprop=url|extmetadata&origin=*`;
      const res = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'KairoVideoSourcingEngine/1.0 (contact@kairo.media)' }
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.query && data.query.pages) {
          const pages = Object.values(data.query.pages) as any[];
          for (const page of pages) {
            const info = page.imageinfo?.[0];
            if (info && info.url && !usedUrls.has(info.url)) {
              const ext = info.extmetadata;
              const licenseName = ext?.LicenseShortName?.value || 'CC BY-SA';
              const nameLower = licenseName.toLowerCase();

              // Filtro de licença comercial válida
              const isValidLicense =
                nameLower.includes('pd') ||
                nameLower.includes('cc0') ||
                nameLower.includes('public domain') ||
                nameLower.includes('cc-by') ||
                nameLower.includes('cc by') ||
                nameLower.includes('fal');

              if (isValidLicense) {
                usedUrls.add(info.url);
                console.log(`[Sourcing] ✅ Wikimedia Commons encontrou para "${searchQuery}": ${page.title} (${licenseName})`);
                return {
                  url: info.url,
                  source: 'Wikimedia Commons',
                  license: licenseName,
                  author: ext?.Artist?.value ? ext.Artist.value.replace(/<[^>]*>?/gm, '').trim() : 'Colaborador Wikimedia',
                  title: ext?.ObjectName?.value || page.title.replace(/^File:/i, ''),
                  queryUsed: searchQuery
                };
              }
            }
          }
        }
      } else {
        failures.push(`Wikimedia ("${searchQuery}"): Erro HTTP ${res.status}`);
      }
    } catch (err: any) {
      failures.push(`Wikimedia ("${searchQuery}"): ${err.message}`);
    }

    // 2. Tentar Openverse
    try {
      const openverseUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(searchQuery)}&license=by,by-sa,cc0,pdm&page_size=5`;
      const res = await fetch(openverseUrl, {
        headers: { 'User-Agent': 'KairoVideoSourcingEngine/1.0 (contact@kairo.media)' }
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.results && data.results.length > 0) {
          for (const item of data.results) {
            if (item.url && !usedUrls.has(item.url)) {
              usedUrls.add(item.url);
              const licenseStr = `${item.license} ${item.license_version || ''}`.trim();
              console.log(`[Sourcing] ✅ Openverse encontrou para "${searchQuery}": ${item.title} (${licenseStr})`);
              return {
                url: item.url,
                source: 'Openverse',
                license: licenseStr,
                author: item.creator || 'Criador Openverse',
                title: item.title || searchQuery,
                queryUsed: searchQuery
              };
            }
          }
        }
      } else {
        failures.push(`Openverse ("${searchQuery}"): Erro HTTP ${res.status}`);
      }
    } catch (err: any) {
      failures.push(`Openverse ("${searchQuery}"): ${err.message}`);
    }

    // 3. Tentar Pexels (se houver chave de API)
    if (process.env.PEXELS_API_KEY) {
      try {
        const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5`;
        const res = await fetch(pexelsUrl, {
          headers: { 'Authorization': process.env.PEXELS_API_KEY }
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.photos && data.photos.length > 0) {
            for (const item of data.photos) {
              const photoUrl = item.src?.original || item.src?.large;
              if (photoUrl && !usedUrls.has(photoUrl)) {
                usedUrls.add(photoUrl);
                console.log(`[Sourcing] ✅ Pexels encontrou para "${searchQuery}": ${item.alt || searchQuery}`);
                return {
                  url: photoUrl,
                  source: 'Pexels',
                  license: 'Pexels License (Gratuito/Comercial)',
                  author: item.photographer || 'Fotógrafo Pexels',
                  title: item.alt || searchQuery,
                  queryUsed: searchQuery
                };
              }
            }
          }
        } else {
          failures.push(`Pexels ("${searchQuery}"): Erro HTTP ${res.status}`);
        }
      } catch (err: any) {
        failures.push(`Pexels ("${searchQuery}"): ${err.message}`);
      }
    }
  }

  console.log(`[Sourcing] 🟡 Todas as buscas da cascata falharam → caindo para geração IA`);
  return null;
}
