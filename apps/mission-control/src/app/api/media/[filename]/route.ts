import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  
  try {
    // Determine the absolute path to the workspace root's tmp/outputs directory
    let filePath = path.resolve(process.cwd(), '../../tmp/outputs', filename);
    
    if (!fs.existsSync(filePath)) {
      // Try absolute path fallback for production alignment
      const fallbackPath = path.join('/tmp/outputs', filename);
      if (fs.existsSync(fallbackPath)) {
        filePath = fallbackPath;
      } else {
        return NextResponse.json({ error: `File not found at ${filePath} or ${fallbackPath}` }, { status: 404 });
      }
    }

    const fileBuffer = fs.readFileSync(filePath);
    
    // Determine content type based on extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    if (ext === '.webm') contentType = 'video/webm';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    if (ext === '.bmp') contentType = 'image/bmp';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Error serving media file:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
