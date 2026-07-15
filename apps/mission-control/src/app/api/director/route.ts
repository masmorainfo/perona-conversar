import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Busca a unidade de conteúdo mais recente que já passou pelo Director
    const { rows } = await query(`
      SELECT id, topic, state
      FROM content_units
      WHERE state IN ('SCRIPTED', 'MEDIA_SYNTHESIZED', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Nenhuma pauta recente processada pelo Director.',
      });
    }

    const latestUnit = rows[0];
    const manifestPath = path.resolve(process.cwd(), `../../../tmp/assets/${latestUnit.id}/story_manifest.json`);

    if (!fs.existsSync(manifestPath)) {
      return NextResponse.json({
        success: false,
        message: 'Manifesto não encontrado em disco para a última pauta.',
        unit: latestUnit,
      });
    }

    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    return NextResponse.json({
      success: true,
      unit: latestUnit,
      direction: manifestData.direction || manifestData.cinematicDirection || manifestData,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
