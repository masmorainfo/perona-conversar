import { verifyVisualCoherence, ExpectedContext } from './visual-verifier.js';

export interface VerificationLog {
  url: string;
  source: string;
  query: string;
  license: string;
  visionDescription: string;
  verdict: 'ACCEPTED' | 'DISCARDED';
  reason?: string;
}

export interface SourcedVisual {
  url: string;
  source: string;
  license: string;
  author?: string;
  title?: string;
  queryUsed: string;
  visionDescription?: string;
  verificationLogs: VerificationLog[];
}

/**
 * Constrói a cascata de queries de busca (Query Fallback Cascade)
 */
export function getQueryVariants(topic: string, visualDescription: string, sceneText: string): string[] {
  const queries: string[] = [];

  const entities: string[] = [];
  if (/neymar/i.test(topic + ' ' + visualDescription)) entities.push('Neymar');
  if (/santos/i.test(topic + ' ' + visualDescription)) entities.push('Santos');
  if (/pel[eé]/i.test(topic + ' ' + visualDescription)) entities.push('Pele');
  if (/messi/i.test(topic + ' ' + visualDescription)) entities.push('Messi');
  if (/ronaldo|cr7/i.test(topic + ' ' + visualDescription)) entities.push('Ronaldo');
  if (/flamengo/i.test(topic + ' ' + visualDescription)) entities.push('Flamengo');
  if (/palmeiras/i.test(topic + ' ' + visualDescription)) entities.push('Palmeiras');
  if (/corinthians/i.test(topic + ' ' + visualDescription)) entities.push('Corinthians');
  if (/manchester united|solskj[æa]er|sheringham/i.test(topic + ' ' + visualDescription)) {
    entities.push('Manchester United');
    entities.push('Sheringham');
  }

  // Query Nível 1: Entidades com ano/clube específico
  if (entities.length >= 2) {
    queries.push(`${entities[0]} ${entities[1]}`);
    if (/santos/i.test(topic)) queries.push(`${entities[0]} Santos FC 2011`);
  } else if (entities.length === 1) {
    if (/santos/i.test(topic)) {
      queries.push(`${entities[0]} Santos FC`);
    } else {
      queries.push(entities[0]);
    }
  }

  const isBrazilian = /neymar|santos|pel[eé]|flamengo|palmeiras|corinthians|brasil/i.test(topic + ' ' + visualDescription);

  // Query Nível 2: Contexto da Cena
  const visualClean = visualDescription.replace(/Hook visual:|CTA visual:|Cena \d+:|visual:/gi, '').trim();
  if (/est[aá]dio|stadium|torcida|crowd/i.test(visualClean + ' ' + sceneText)) {
    if (isBrazilian) {
      queries.push('torcida estádio futebol');
      if (/santos/i.test(topic)) queries.push('torcida Vila Belmiro');
    } else {
      queries.push('soccer stadium crowd');
    }
  } else if (/trof[eé]u|ta[çc]a|trophy|cup|libertadores/i.test(visualClean + ' ' + sceneText)) {
    queries.push('Copa Libertadores trophy');
  } else {
    if (isBrazilian) {
      queries.push('partida de futebol');
    } else {
      queries.push('soccer match');
    }
  }

  return Array.from(new Set(queries.filter(q => q.trim().length > 0)));
}

/**
 * Cascata de Sourcing de Imagens com Gate de Verificação Visual e Licenciamento Estrito.
 * Ordem: Wikimedia Commons → Openverse → Pexels (apenas contexto) → Google CSE (rights=cc_publicdomain|cc_attribute).
 */
export async function sourceVisual(
  topic: string,
  visualDescription: string,
  sceneText: string,
  usedUrls: Set<string> = new Set(),
  isSubjectScene: boolean = false
): Promise<SourcedVisual | null> {
  const queries = getQueryVariants(topic, visualDescription, sceneText);
  console.log(`[Sourcing Cascade] Buscando candidato para: [${queries.map(q => `"${q}"`).join(', ')}] (Cena de Sujeito: ${isSubjectScene})`);

  const verificationLogs: VerificationLog[] = [];

  const yearMatch = (topic + ' ' + sceneText).match(/\b(19\d{2}|20\d{2})\b/);
  const expectedYear = yearMatch ? yearMatch[1] : undefined;

  const expectedContext: ExpectedContext = {
    subject: topic,
    club: /santos/i.test(topic) ? 'Santos FC' : undefined,
    sceneText: visualDescription + ' ' + sceneText,
    year: expectedYear
  };

  const isTragicOrAccident = (text: string) => /collapse|crash|disaster|injury|riot|acidente|trag[eé]dia|desastre|ferido|briga|viol[êe]ncia|morte/i.test(text);

  const checkTemporalAndSafety = (title: string, url: string, description?: string): string | null => {
    const fullText = (title + ' ' + url + ' ' + (description || '')).toLowerCase();
    if (isTragicOrAccident(fullText)) {
      return 'Imagem contém termos de acidente, tragédia ou violência.';
    }
    const itemYearMatch = fullText.match(/\b(19\d{2}|20\d{2})\b/g);
    if (expectedYear && itemYearMatch) {
      if (!itemYearMatch.includes(expectedYear)) {
         return `Incoerência temporal: O contexto pede ${expectedYear}, mas os metadados indicam ${itemYearMatch.join(', ')}.`;
      }
    }
    return null;
  };

  for (const searchQuery of queries) {
    // ─── 1. WIKIMEDIA COMMONS ───────────────────────────────────────────────
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

              const isValidLicense =
                nameLower.includes('pd') ||
                nameLower.includes('cc0') ||
                nameLower.includes('public domain') ||
                nameLower.includes('cc-by') ||
                nameLower.includes('cc by') ||
                nameLower.includes('fal');

              if (isValidLicense) {
                // Gate de Segurança e Temporal
                const titleForCheck = ext?.ObjectName?.value || page.title;
                const safetyError = checkTemporalAndSafety(titleForCheck, info.url, ext?.ImageDescription?.value);
                
                if (safetyError) {
                  console.warn(`[Sourcing Cascade] 🚨 WIKIMEDIA COMMONS DESCARTADO por safety/temporal: ${safetyError}`);
                  verificationLogs.push({
                    url: info.url,
                    source: 'Wikimedia Commons',
                    query: searchQuery,
                    license: licenseName,
                    visionDescription: 'N/A (Metadados)',
                    verdict: 'DISCARDED',
                    reason: safetyError
                  });
                  continue;
                }

                // Gate de Verificação Visual por Modelo de Visão
                const verification = await verifyVisualCoherence(info.url, expectedContext);
                
                verificationLogs.push({
                  url: info.url,
                  source: 'Wikimedia Commons',
                  query: searchQuery,
                  license: licenseName,
                  visionDescription: verification.visionDescription,
                  verdict: verification.accepted ? 'ACCEPTED' : 'DISCARDED',
                  reason: verification.reason
                });

                if (verification.accepted) {
                  usedUrls.add(info.url);
                  console.log(`[Sourcing Cascade] ✅ WIKIMEDIA COMMONS APROVADO: ${page.title} (${licenseName})`);
                  return {
                    url: info.url,
                    source: 'Wikimedia Commons',
                    license: licenseName,
                    author: ext?.Artist?.value ? ext.Artist.value.replace(/<[^>]*>?/gm, '').trim() : 'Wikimedia Commons',
                    title: ext?.ObjectName?.value || page.title.replace(/^File:/i, ''),
                    queryUsed: searchQuery,
                    visionDescription: verification.visionDescription,
                    verificationLogs
                  };
                } else {
                  console.warn(`[Sourcing Cascade] 🚨 WIKIMEDIA COMMONS DESCARTADO por incoerência visual: ${verification.reason}`);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Sourcing Cascade] Wikimedia error:`, err.message);
    }

    // ─── 2. OPENVERSE API ──────────────────────────────────────────────────
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
              const licenseStr = `${item.license} ${item.license_version || ''}`.trim();

              const safetyError = checkTemporalAndSafety(item.title || '', item.url, item.tags?.map((t: any) => t.name).join(' '));
              if (safetyError) {
                  console.warn(`[Sourcing Cascade] 🚨 OPENVERSE DESCARTADO por safety/temporal: ${safetyError}`);
                  verificationLogs.push({
                    url: item.url,
                    source: 'Openverse',
                    query: searchQuery,
                    license: licenseStr,
                    visionDescription: 'N/A (Metadados)',
                    verdict: 'DISCARDED',
                    reason: safetyError
                  });
                  continue;
              }

              const verification = await verifyVisualCoherence(item.url, expectedContext);

              verificationLogs.push({
                url: item.url,
                source: 'Openverse',
                query: searchQuery,
                license: licenseStr,
                visionDescription: verification.visionDescription,
                verdict: verification.accepted ? 'ACCEPTED' : 'DISCARDED',
                reason: verification.reason
              });

              if (verification.accepted) {
                usedUrls.add(item.url);
                console.log(`[Sourcing Cascade] ✅ OPENVERSE APROVADO: ${item.title} (${licenseStr})`);
                return {
                  url: item.url,
                  source: 'Openverse',
                  license: licenseStr,
                  author: item.creator || 'Criador Openverse',
                  title: item.title || searchQuery,
                  queryUsed: searchQuery,
                  visionDescription: verification.visionDescription,
                  verificationLogs
                };
              } else {
                console.warn(`[Sourcing Cascade] 🚨 OPENVERSE DESCARTADO por incoerência visual: ${verification.reason}`);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Sourcing Cascade] Openverse error:`, err.message);
    }

    // ─── 3. PEXELS API (Apenas para Contexto Genérico, NUNCA para Sujeito Humano) ──
    if (!isSubjectScene && process.env.PEXELS_API_KEY) {
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
                const verification = await verifyVisualCoherence(photoUrl, expectedContext);

                verificationLogs.push({
                  url: photoUrl,
                  source: 'Pexels',
                  query: searchQuery,
                  license: 'Pexels License (Gratuito/Comercial)',
                  visionDescription: verification.visionDescription,
                  verdict: verification.accepted ? 'ACCEPTED' : 'DISCARDED',
                  reason: verification.reason
                });

                if (verification.accepted) {
                  usedUrls.add(photoUrl);
                  console.log(`[Sourcing Cascade] ✅ PEXELS CONTEXTO APROVADO: ${item.alt || searchQuery}`);
                  return {
                    url: photoUrl,
                    source: 'Pexels',
                    license: 'Pexels License (Gratuito/Comercial)',
                    author: item.photographer || 'Fotógrafo Pexels',
                    title: item.alt || searchQuery,
                    queryUsed: searchQuery,
                    visionDescription: verification.visionDescription,
                    verificationLogs
                  };
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Sourcing Cascade] Pexels error:`, err.message);
      }
    }

    // ─── 4. GOOGLE CSE (Com filtro de licença explícito de direitos) ───────────
    if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
      try {
        const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_CSE_KEY}&cx=${process.env.GOOGLE_CSE_CX}&q=${encodeURIComponent(searchQuery)}&searchType=image&rights=cc_publicdomain|cc_attribute|cc_sharealike&num=5`;
        const res = await fetch(googleUrl);
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.items && data.items.length > 0) {
            for (const item of data.items) {
              const imgUrl = item.link || item.pagemap?.cse_image?.[0]?.src;
              if (imgUrl && !usedUrls.has(imgUrl)) {
                const verification = await verifyVisualCoherence(imgUrl, expectedContext);

                verificationLogs.push({
                  url: imgUrl,
                  source: 'Google CSE (Licensed)',
                  query: searchQuery,
                  license: 'CC / Open Rights Filtered',
                  visionDescription: verification.visionDescription,
                  verdict: verification.accepted ? 'ACCEPTED' : 'DISCARDED',
                  reason: verification.reason
                });

                if (verification.accepted) {
                  usedUrls.add(imgUrl);
                  console.log(`[Sourcing Cascade] ✅ GOOGLE CSE LICENCIADO APROVADO: ${item.title}`);
                  return {
                    url: imgUrl,
                    source: 'Google CSE',
                    license: 'CC / Public Domain (Google Filtered)',
                    author: item.displayLink || 'Google CSE Source',
                    title: item.title || searchQuery,
                    queryUsed: searchQuery,
                    visionDescription: verification.visionDescription,
                    verificationLogs
                  };
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Sourcing Cascade] Google CSE error:`, err.message);
      }
    }
  }

  console.log(`[Sourcing Cascade] 🟡 Nenhuma imagem licenciada e coerente passou pelos gates de verificação.`);
  return null;
}
