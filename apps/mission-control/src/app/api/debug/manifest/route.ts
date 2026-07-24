import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';



/**
 * GET /api/debug/manifest?contentId=<uuid>
 * Lê o story_manifest.json do /tmp do container e retorna os campos de auditoria C5/C6.
 * TEMPORÁRIO — remover após validação do gate de qualidade.
 */
export async function GET(req: NextRequest) {
  // ── 1. Autenticação ────────────────────────────────────────────────────
  const token = req.headers.get('x-operator-token');
  if (!process.env.MISSION_CONTROL_OPERATOR_TOKEN) {
    return NextResponse.json(
      { error: 'MISSION_CONTROL_OPERATOR_TOKEN não configurado no servidor.' },
      { status: 500 }
    );
  }
  if (token !== process.env.MISSION_CONTROL_OPERATOR_TOKEN) {
    return NextResponse.json({ error: 'Token de operador inválido.' }, { status: 401 });
  }

  const contentId = req.nextUrl.searchParams.get('contentId');
  if (!contentId) {
    return NextResponse.json({ error: 'contentId required' }, { status: 400 });
  }

  // Sanitize: contentId deve ser UUID
  if (!/^[0-9a-f-]{36}$/.test(contentId)) {
    return NextResponse.json({ error: 'Invalid contentId' }, { status: 400 });
  }

  const manifestPath = path.resolve(
    process.cwd(),
    `../../../tmp/assets/${contentId}/story_manifest.json`
  );

  if (!fs.existsSync(manifestPath)) {
    return NextResponse.json(
      { error: `Manifest not found: ${manifestPath}`, contentId },
      { status: 404 }
    );
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);

    // Extrai apenas os campos relevantes para auditoria (C5/C6)
    const audit = {
      contentId,
      manifestPath,
      totalScenes: manifest.scenes?.length ?? 0,
      scenes: (manifest.scenes || []).map((scene: any) => ({
        id: scene.id,
        isAiFallback: scene.layout?.isAiFallback ?? false,
        isAbstraction: scene.layout?.isAbstraction ?? false,
        sourcingMetadata: scene.layout?.sourcingMetadata ?? null,
        wordTimestamps_count: Array.isArray(scene.captions?.wordTimestamps)
          ? scene.captions.wordTimestamps.length
          : 0,
        narrationPath_present: !!scene.layout?.narrationPath,
        voiceModel: scene.layout?.voiceModel ?? null,
      })),
      globalVoiceModel: manifest.globalStyle?.voiceModel ?? null,
    };

    return NextResponse.json({ ok: true, audit });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
