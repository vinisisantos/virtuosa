import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status, resolutionNotes, conclusionText, action, notes, actorId, actorName } = body;

    const updatedData: any = {};
    if (status) updatedData.status = status;
    if (resolutionNotes !== undefined) updatedData.resolutionNotes = resolutionNotes;
    if (conclusionText !== undefined) updatedData.conclusionText = conclusionText;

    const complaint = await prisma.complaint.update({
      where: { id },
      data: {
        ...updatedData,
        history: {
          create: {
            action: action || 'status_change',
            notes: notes || `Status alterado para ${status}`,
            actorId: actorId,
            actorName: actorName || 'Sistema'
          }
        }
      },
      include: {
        history: { orderBy: { createdAt: 'desc' } },
        attachments: { select: { id: true, fileName: true, mimeType: true, createdAt: true, uploadedByName: true } }
      }
    });

    return NextResponse.json(complaint);
  } catch (error) {
    console.error('Error updating complaint:', error);
    return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await prisma.complaint.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting complaint:', error);
    return NextResponse.json({ error: 'Failed to delete complaint' }, { status: 500 });
  }
}
