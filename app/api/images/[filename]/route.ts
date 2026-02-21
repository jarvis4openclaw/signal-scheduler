import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const decodedFilename = decodeURIComponent(filename);
  const filepath = join('/opt/signal-scheduler/uploads', decodedFilename);

  try {
    const file = await readFile(filepath);
    const ext = filename.split('.').pop();

    const contentTypeMap: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentTypeMap[ext || ''] || 'image/jpeg',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
