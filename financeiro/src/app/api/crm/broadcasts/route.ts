import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/crm/broadcasts — listar broadcasts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unit = searchParams.get("unit");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (unit) where.unit = unit;
    if (status) where.status = status;

    const broadcasts = await prisma.broadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });

    return NextResponse.json({ broadcasts });
  } catch (error) {
    console.error("[GET /api/crm/broadcasts]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/crm/broadcasts — criar + enviar broadcast
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, message, audienceType, audienceFilter, unit, createdBy, contacts } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    if (!message?.trim()) {
      return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 });
    }

    // Resolve audience
    let recipientList: { phone: string; name: string | null }[] = [];

    if (audienceType === "manual" && Array.isArray(contacts)) {
      // Manual list provided by client
      recipientList = contacts.map((c: { phone: string; name?: string }) => ({
        phone: c.phone,
        name: c.name || null,
      }));
    } else {
      // Query Client table based on filters
      const clientWhere: Record<string, unknown> = {};
      if (unit) clientWhere.unit = unit;

      if (audienceType === "stage" && audienceFilter?.stages?.length) {
        clientWhere.stage = { in: audienceFilter.stages };
      }
      if (audienceType === "source" && audienceFilter?.sources?.length) {
        clientWhere.source = { in: audienceFilter.sources };
      }

      const clients = await prisma.client.findMany({
        where: {
          ...clientWhere,
          phone: { not: null },
          isActive: true,
        },
        select: { phone: true, name: true },
      });

      recipientList = clients
        .filter((c) => c.phone)
        .map((c) => ({ phone: c.phone!, name: c.name }));
    }

    if (recipientList.length === 0) {
      return NextResponse.json(
        { error: "Nenhum contato encontrado com os filtros selecionados" },
        { status: 400 }
      );
    }

    // Deduplicate by phone
    const seen = new Set<string>();
    recipientList = recipientList.filter((r) => {
      const key = r.phone.replace(/\D/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Create broadcast + recipients
    const broadcast = await prisma.broadcast.create({
      data: {
        name: name.trim(),
        message: message.trim(),
        audienceType: audienceType || "all",
        audienceFilter: audienceFilter || null,
        unit: unit || null,
        createdBy: createdBy || null,
        status: "sending",
        totalRecipients: recipientList.length,
        sentAt: new Date(),
        recipients: {
          create: recipientList.map((r) => ({
            contactPhone: r.phone,
            contactName: r.name,
            status: "pending",
          })),
        },
      },
    });

    // Send messages asynchronously (don't block response)
    sendBroadcastMessages(broadcast.id, message.trim()).catch(console.error);

    return NextResponse.json({
      id: broadcast.id,
      totalRecipients: recipientList.length,
      status: "sending",
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/crm/broadcasts]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/crm/broadcasts?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    await prisma.broadcast.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/crm/broadcasts]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// ─── Background sender ──────────────────────────────────────
async function sendBroadcastMessages(broadcastId: string, message: string) {
  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId, status: "pending" },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      // Send via WhatsApp API
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance: "virtuosa-main",
          contactId: recipient.contactPhone,
          body: message,
          type: "text",
        }),
      });

      if (res.ok) {
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date() },
        });
        sentCount++;
      } else {
        const errData = await res.json().catch(() => ({}));
        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", error: errData.error || `HTTP ${res.status}` },
        });
        failedCount++;
      }

      // Small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: String(error) },
      });
      failedCount++;
    }

    // Update broadcast counts periodically
    if ((sentCount + failedCount) % 10 === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { sentCount, failedCount },
      });
    }
  }

  // Final update
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      sentCount,
      failedCount,
      status: failedCount === recipients.length ? "failed" : "sent",
      completedAt: new Date(),
    },
  });
}
