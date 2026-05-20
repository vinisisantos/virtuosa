import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST - Upload attachment (base64 encoded)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { complaintId, fileName, mimeType, fileBase64, uploadedBy, uploadedByName } = body;

    if (!complaintId || !fileName || !fileBase64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Convert base64 to Buffer for DB storage
    const fileData = Buffer.from(fileBase64, 'base64');

    const attachment = await prisma.complaintAttachment.create({
      data: {
        complaintId,
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        fileData,
        uploadedBy,
        uploadedByName
      },
      select: { id: true, fileName: true, mimeType: true, createdAt: true, uploadedByName: true }
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return NextResponse.json({ error: 'Failed to upload attachment' }, { status: 500 });
  }
}
