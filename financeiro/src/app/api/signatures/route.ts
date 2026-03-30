import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// POST — Create a signing request (from the contract generator)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      // Create a new signing request
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
          unit: unit || 'Barueri',
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

    if (action === 'sign') {
      // Sign a contract (public — from the signing page)
      const { token, signatureImage, signerIp } = body;
      if (!token || !signatureImage) {
        return NextResponse.json({ error: 'token and signatureImage are required' }, { status: 400 });
      }

      const contract = await prisma.digitalContract.findUnique({
        where: { signingToken: token },
      });

      if (!contract) {
        return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
      }
      if (contract.status === 'assinado') {
        return NextResponse.json({ error: 'Este contrato já foi assinado' }, { status: 400 });
      }
      if (contract.status === 'cancelado') {
        return NextResponse.json({ error: 'Este contrato foi cancelado' }, { status: 400 });
      }

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
      // Get contract by token (public)
      const { token } = body;
      if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

      const contract = await prisma.digitalContract.findUnique({
        where: { signingToken: token },
      });

      if (!contract) {
        return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
      }

      // For signed contracts: return only safe, read-only data (no CPF, IP, raw content)
      if (contract.status === 'assinado') {
        return NextResponse.json({
          success: true,
          contract: {
            clientName: contract.clientName?.split(' ')[0] || 'Cliente', // first name only
            templateName: contract.templateName,
            pdfContent: contract.pdfContent || null,
            status: contract.status,
            signedAt: contract.signedAt,
            signatureImage: contract.signatureImage || null,
          },
        });
      }

      // For unsigned contracts: return full data needed for signing
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[Signatures API Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — List contracts or get by token (for the admin contratos page)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const status = url.searchParams.get('status');

    if (token) {
      const contract = await prisma.digitalContract.findUnique({
        where: { signingToken: token },
      });
      return NextResponse.json({ success: true, contract });
    }

    const where: any = {};
    if (status) where.status = status;

    const contracts = await prisma.digitalContract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, contracts });
  } catch (err: any) {
    console.error('[Signatures GET Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
