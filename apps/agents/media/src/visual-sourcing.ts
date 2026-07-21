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

  // 1. Tentar Wikimedia Commons (Prioriza CC0 / Domínio Público / CC-BY / CC-BY-SA)
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrsearch=filetype:bitmap|drawing+${encodeURIComponent(searchQuery)}&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&origin=*`;
    const res = await fetch(wikiUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages) as any[];
        
        // Ordenar por licença (preferência CC0/PD > CC-BY > CC-BY-SA)
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
        }
      }
    }
  } catch (err) {
    console.warn(`[Sourcing] Erro ao buscar no Wikimedia Commons: ${err}`);
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
      }
    }
  } catch (err) {
    console.warn(`[Sourcing] Erro ao buscar no Openverse: ${err}`);
  }

  // Se nenhuma fonte real encontrou, retorna null (fará fallback para IA se configurado no caller)
  console.warn(`[Sourcing] Nenhuma imagem real encontrada para "${searchQuery}".`);
  return null;
}

