import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET - Download attachment file
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const attachment = await prisma.complaintAttachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    return new NextResponse(attachment.fileData, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${attachment.fileName}"`,
      }
    });
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
  }
}

// DELETE - Remove attachment
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await prisma.complaintAttachment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
  }
}
