import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/* ── GET: List reembolso tickets ── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const unit = searchParams.get('unit');
    const requesterId = searchParams.get('requesterId');

    const where: Record<string, unknown> = {};
    if (status && status !== 'todos') where.status = status;
    if (unit && unit !== 'Todas') where.unit = unit;
    if (requesterId) where.requesterId = requesterId;

    const tickets = await prisma.reembolsoTicket.findMany({
      where,
      include: {
        items: true,
        attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Strip large base64 payload from list response
    const safe = tickets.map(({ paymentProofData: _ppd, ...rest }) => rest);
    return NextResponse.json(safe);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar tickets' }, { status: 500 });
  }
}

/* ── POST: Create new reembolso ticket ── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterName, requesterId, unit, items, attachments } = body;

    if (!requesterName) return NextResponse.json({ error: 'Nome do solicitante obrigatório' }, { status: 400 });
    if (!items || !items.length) return NextResponse.json({ error: 'Pelo menos um produto é obrigatório' }, { status: 400 });
    if (!attachments || !attachments.length) return NextResponse.json({ error: 'Pelo menos um anexo/comprovante é obrigatório' }, { status: 400 });

    const totalAmount = items.reduce((sum: number, item: { price: number }) => sum + (item.price || 0), 0);

    const ticket = await prisma.reembolsoTicket.create({
      data: {
        requesterName,
        requesterId: requesterId || null,
        unit: unit || 'Barueri',
        totalAmount,
        items: {
          create: items.map((item: { name: string; price: number }) => ({
            name: item.name,
            price: item.price || 0,
          })),
        },
        attachments: {
          create: attachments.map((att: { fileName: string; fileType: string; fileSize: number; fileData: string }) => ({
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            fileData: att.fileData,
          })),
        },
      },
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    // Send notification to admins
    try {
      await prisma.notification.create({
        data: {
          type: 'alert',
          title: 'Nova Solicitação de Reembolso',
          message: `${requesterName} enviou uma solicitação de reembolso #${ticket.ticketNumber} no valor de R$ ${totalAmount.toFixed(2).replace('.', ',')} com ${items.length} item(ns).`,
          icon: 'receipt_long',
          link: '/?tab=reembolso',
        },
      });
    } catch {}

    return NextResponse.json(ticket, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao criar ticket' }, { status: 500 });
  }
}

/* ── PUT: Update ticket status (admin approve/reject/pay) ── */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, status, adminNotes, reviewedBy, paymentProof } = body;

    if (!ticketId) return NextResponse.json({ error: 'ticketId obrigatório' }, { status: 400 });
    if (!status) return NextResponse.json({ error: 'Status obrigatório' }, { status: 400 });

    const validStatuses = ['pendente', 'aprovado', 'reprovado', 'pago'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    // If marking as paid, require payment proof
    if (status === 'pago' && !paymentProof?.fileData) {
      return NextResponse.json({ error: 'Comprovante de pagamento obrigatório para dar baixa' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      status,
      adminNotes: adminNotes || undefined,
      reviewedBy: reviewedBy || undefined,
      reviewedAt: ['aprovado', 'reprovado'].includes(status) ? new Date() : undefined,
    };

    // Attach payment proof when marking as paid
    if (status === 'pago' && paymentProof) {
      updateData.paymentProofData = paymentProof.fileData;
      updateData.paymentProofName = paymentProof.fileName;
      updateData.paymentProofType = paymentProof.fileType;
      updateData.paidAt = new Date();
    }

    const ticket = await prisma.reembolsoTicket.update({
      where: { id: ticketId },
      data: updateData,
      include: { items: true, attachments: { select: { id: true, fileName: true, fileType: true, fileSize: true, createdAt: true } } },
    });

    // Notify requester about decision
    try {
      const statusLabel = status === 'aprovado' ? '✅ Aprovado' : status === 'reprovado' ? '❌ Reprovado' : status === 'pago' ? '💰 Pago' : 'Atualizado';
      const message = status === 'pago'
        ? `Seu reembolso #${ticket.ticketNumber} no valor de R$ ${ticket.totalAmount.toFixed(2).replace('.', ',')} foi pago! O comprovante de pagamento está disponível para visualização.${adminNotes ? ` Obs: ${adminNotes}` : ''}`
        : adminNotes
          ? `Observação: ${adminNotes}`
          : `Seu reembolso de R$ ${ticket.totalAmount.toFixed(2).replace('.', ',')} foi ${statusLabel.toLowerCase()}.`;

      await prisma.notification.create({
        data: {
          userId: ticket.requesterId,
          type: status === 'aprovado' ? 'success' : status === 'reprovado' ? 'warning' : status === 'pago' ? 'success' : 'info',
          title: `Reembolso #${ticket.ticketNumber} — ${statusLabel}`,
          message,
          icon: status === 'pago' ? 'paid' : 'receipt_long',
          link: '/?tab=reembolso',
        },
      });
    } catch {}

    return NextResponse.json(ticket);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao atualizar ticket' }, { status: 500 });
  }
}
