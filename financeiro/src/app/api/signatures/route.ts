import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getUserFromHeaders } from '@/lib/auth';

import { prisma } from "@/lib/db";

// POST — handles multiple actions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // PUBLIC actions: sign and get (client does not need to be logged in)
    if (action === 'sign') {
      const { token, signatureImage, signerIp } = body;
      if (!token || !signatureImage) {
        return NextResponse.json({ error: 'token and signatureImage are required' }, { status: 400 });
      }

      const contract = await prisma.digitalContract.findUnique({
        where: { signingToken: token },
      });

      if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
      if (contract.status === 'assinado') return NextResponse.json({ error: 'Este contrato já foi assinado' }, { status: 400 });
      if (contract.status === 'cancelado') return NextResponse.json({ error: 'Este contrato foi cancelado' }, { status: 400 });

      await prisma.digitalContract.update({
        where: { signingToken: token },
        data: {
          signatureImage,
          signatureIp: signerIp || null,
          signedAt: new Date(),
          status: 'assinado',
        },
      });

      return NextResponse.json({ success: true, message: 'Contrato assinado com sucesso!' });
    }

    if (action === 'get') {
      const { token } = body;
      if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

      const contract = await prisma.digitalContract.findUnique({
        where: { signingToken: token },
      });

      if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

      if (contract.status === 'assinado') {
        return NextResponse.json({
          success: true,
          contract: {
            clientName: contract.clientName?.split(' ')[0] || 'Cliente',
            templateName: contract.templateName,
            pdfContent: contract.pdfContent || null,
            status: contract.status,
            signedAt: contract.signedAt,
            signatureImage: contract.signatureImage || null,
          },
        });
      }

      return NextResponse.json({
        success: true,
        contract: {
          clientName: contract.clientName,
          templateName: contract.templateName,
          content: contract.content,
          pdfContent: contract.pdfContent || null,
          status: contract.status,
          signedAt: contract.signedAt,
          createdAt: contract.createdAt,
        },
      });
    }

    // PROTECTED actions: require authentication
    if (action === 'create') {
      const user = getUserFromHeaders(req);
      if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

      const { clientName, clientCpf, clientEmail, templateName, content, pdfContent, unit, assifanyDocId, assifanySignId } = body;
      if (!clientName || !content) {
        return NextResponse.json({ error: 'clientName and content are required' }, { status: 400 });
      }

      const signingToken = crypto.randomBytes(24).toString('hex');

      const contract = await prisma.digitalContract.create({
        data: {
          clientName,
          clientCpf: clientCpf || null,
          clientEmail: clientEmail || null,
          templateName: templateName || 'Contrato',
          content,
          pdfContent: pdfContent || null,
          unit: user.isAdmin ? (unit || 'SCS') : user.unit,
          signingToken,
          status: 'pendente',
          assifanyDocId: assifanyDocId || null,
          assifanySignId: assifanySignId || null,
        },
      });

      const baseUrl = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
      const protocol = req.headers.get('x-forwarded-proto') || 'https';
      const signingUrl = `${protocol}://${baseUrl}/assinar/${signingToken}`;

      return NextResponse.json({ success: true, contract: { id: contract.id, signingToken }, signingUrl });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[Signatures API Error]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET — List contracts (admin/authenticated only)
export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const status = url.searchParams.get('status');

    if (token) {
      const contract = await prisma.digitalContract.findUnique({ where: { signingToken: token } });
      if (!contract) return NextResponse.json({ success: false, contract: null });
      if (!user.isAdmin && contract.unit !== user.unit) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }
      return NextResponse.json({ success: true, contract });
    }

    const where: any = {};
    if (status) where.status = status;
    if (!user.isAdmin) where.unit = user.unit;

    const contracts = await prisma.digitalContract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, contracts });
  } catch (err: any) {
    console.error('[Signatures GET Error]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
