import { NextRequest, NextResponse } from 'next/server';

// Store templates temporarily in memory (survives for the lifetime of the serverless function)
const templateCache = new Map<string, { data: Buffer; expires: number }>();

// Clean expired entries
function cleanup() {
  const now = Date.now();
  for (const [key, val] of templateCache) {
    if (val.expires < now) templateCache.delete(key);
  }
}

// POST: Store a base64 template and return a unique ID
export async function POST(request: NextRequest) {
  try {
    const { base64, fileName } = await request.json();
    if (!base64) {
      return NextResponse.json({ error: 'No base64 data provided' }, { status: 400 });
    }

    cleanup();

    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const data = Buffer.from(base64, 'base64');
    
    // Cache for 10 minutes
    templateCache.set(id, { data, expires: Date.now() + 10 * 60 * 1000 });

    return NextResponse.json({ id, fileName });
  } catch (err) {
    console.error('Template preview POST error:', err);
    return NextResponse.json({ error: 'Failed to store template' }, { status: 500 });
  }
}

// GET: Serve the DOCX file by ID
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'No ID provided' }, { status: 400 });
  }

  cleanup();

  const cached = templateCache.get(id);
  if (!cached) {
    return NextResponse.json({ error: 'Template not found or expired' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cached.data), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="preview.docx"`,
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
