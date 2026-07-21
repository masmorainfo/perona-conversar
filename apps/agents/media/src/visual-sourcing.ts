export interface SourcedVisual {
  url: string;
  source: string;
  license: string;
  author?: string;
  title?: string;
}

export async function sourceVisual(query: string, sceneSubject?: string): Promise<SourcedVisual | null> {
  const searchQuery = sceneSubject || query;
  console.log(`[Sourcing] Buscando imagem real para: "${searchQuery}"`);
  const failures: string[] = [];

  // 1. Tentar Wikimedia Commons
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=filetype:bitmap|drawing+${encodeURIComponent(searchQuery)}&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&origin=*`;
    const res = await fetch(wikiUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages) as any[];
        const getLicenseScore = (extmetadata: any) => {
          if (!extmetadata || !extmetadata.LicenseShortName) return 99;
          const name = extmetadata.LicenseShortName.value.toLowerCase();
          if (name.includes('pd') || name.includes('cc0') || name.includes('public domain')) return 1;
          if (name === 'cc-by' || name.includes('cc by 4.0') || name.includes('cc by 3.0')) return 2;
          if (name.includes('cc-by-sa') || name.includes('cc by-sa')) return 3;
          return 10;
        };
        
        pages.sort((a, b) => {
          const scoreA = a.imageinfo?.[0]?.extmetadata ? getLicenseScore(a.imageinfo[0].extmetadata) : 99;
          const scoreB = b.imageinfo?.[0]?.extmetadata ? getLicenseScore(b.imageinfo[0].extmetadata) : 99;
          return scoreA - scoreB;
        });

        const bestPage = pages[0];
        if (bestPage && bestPage.imageinfo && bestPage.imageinfo[0]) {
          const info = bestPage.imageinfo[0];
          const ext = info.extmetadata;
          return {
            url: info.url,
            source: 'Wikimedia Commons',
            license: ext?.LicenseShortName?.value || 'Desconhecida',
            author: ext?.Artist?.value ? ext.Artist.value.replace(/<[^>]*>?/gm, '') : 'Desconhecido',
            title: ext?.ObjectName?.value || bestPage.title
          };
        } else {
           failures.push('Wikimedia: 0 resultados úteis');
        }
      } else {
        failures.push('Wikimedia: 0 resultados úteis');
      }
    } else {
      failures.push(`Wikimedia: Erro HTTP ${res.status}`);
    }
  } catch (err) {
    failures.push(`Wikimedia: Erro de requisição`);
  }

  // 2. Tentar Openverse
  try {
    const openverseUrl = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(searchQuery)}&license=by,by-sa,cc0,pdm&page_size=3`;
    const res = await fetch(openverseUrl, {
      headers: {
        'User-Agent': 'KairoVideoSourcingEngine/1.0 (contact@kairo.media)'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        return {
          url: item.url,
          source: 'Openverse',
          license: `${item.license} ${item.license_version}`,
          author: item.creator,
          title: item.title
        };
      } else {
        failures.push('Openverse: 0 resultados úteis');
      }
    } else {
      failures.push(`Openverse: Erro HTTP ${res.status}`);
    }
  } catch (err) {
    failures.push(`Openverse: Erro de requisição`);
  }

  // 3. Tentar Pexels (se houver chave de API)
  if (process.env.PEXELS_API_KEY) {
    try {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=3`;
      const res = await fetch(pexelsUrl, {
        headers: {
          'Authorization': process.env.PEXELS_API_KEY
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.photos && data.photos.length > 0) {
          const item = data.photos[0];
          return {
            url: item.src.original || item.src.large,
            source: 'Pexels',
            license: 'Pexels License (Gratuito)',
            author: item.photographer,
            title: item.alt || searchQuery
          };
        } else {
          failures.push('Pexels: 0 resultados úteis');
        }
      } else {
        failures.push(`Pexels: Erro HTTP ${res.status}`);
      }
    } catch (err) {
      failures.push(`Pexels: Erro de requisição`);
    }
  } else {
    failures.push('Pexels: sem chave');
  }

  // Se nenhuma fonte real encontrou, loga o caminho da falha
  console.log(`[Sourcing] ${failures.join(' → ')} → caindo pra geração IA`);
  return null;
}

