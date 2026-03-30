import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.ASSINAFY_API_KEY || '';
const BASE_URL = process.env.ASSINAFY_BASE_URL || 'https://api.assinafy.com.br/v1';

function log(msg: string, data?: any) {
  console.log(`[Assinafy Webhook] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event || body.type || '';
    const data = body.data || body;

    log(`Received event: ${event}`, body);

    // ─── document_metadata_ready: Document finished processing, create assignment ───
    if (event === 'document_metadata_ready') {
      const documentId = data.document?.id || data.id || '';
      if (!documentId) {
        log('No documentId in webhook payload');
        return NextResponse.json({ ok: true });
      }

      // Find our contract by Assinafy document ID
      const contract = await prisma.digitalContract.findFirst({
        where: { assifanyDocId: documentId },
      });

      if (!contract) {
        log(`No contract found for documentId: ${documentId}`);
        return NextResponse.json({ ok: true });
      }

      if (!contract.assifanySignId) {
        log(`Contract ${contract.id} has no signerId, skipping assignment`);
        return NextResponse.json({ ok: true });
      }

      // Create assignment now that document is ready
      log(`Creating assignment for document ${documentId}, signer ${contract.assifanySignId}`);
      const exp = new Date();
      exp.setDate(exp.getDate() + 30);

      const assignBody = {
        method: 'virtual',
        signerIds: [contract.assifanySignId],
        expiration: exp.toISOString().slice(0, 10),
      };

      const assignRes = await fetch(`${BASE_URL}/documents/${documentId}/assignments`, {
        method: 'POST',
        headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(assignBody),
      });

      const assignText = await assignRes.text();
      log(`Assignment response: ${assignRes.status}`, assignText);

      let assignData;
      try { assignData = JSON.parse(assignText); } catch { assignData = {}; }

      const signingUrl = assignData?.data?.signing_urls?.[0]?.url
        || assignData?.signing_urls?.[0]?.url
        || assignData?.data?.signers?.[0]?.signing_url
        || '';

      // Update our contract with the signing URL
      await prisma.digitalContract.update({
        where: { id: contract.id },
        data: {
          assifanyUrl: signingUrl,
          status: signingUrl ? 'aguardando_assinatura' : 'pendente',
        },
      });

      log(`Assignment created, signing URL: ${signingUrl ? 'YES' : 'NO'}`);
      return NextResponse.json({ ok: true, signingUrl });
    }

    // ─── signer_signed_document: Client signed ───
    if (event === 'signer_signed_document') {
      const documentId = data.document?.id || data.document_id || '';
      if (!documentId) return NextResponse.json({ ok: true });

      const contract = await prisma.digitalContract.findFirst({
        where: { assifanyDocId: documentId },
      });

      if (contract) {
        await prisma.digitalContract.update({
          where: { id: contract.id },
          data: { status: 'assinado', signedAt: new Date() },
        });
        log(`Contract ${contract.id} marked as signed`);
      }

      return NextResponse.json({ ok: true });
    }

    // ─── document_ready: All signers done ───
    if (event === 'document_ready') {
      const documentId = data.document?.id || data.id || '';
      if (!documentId) return NextResponse.json({ ok: true });

      const contract = await prisma.digitalContract.findFirst({
        where: { assifanyDocId: documentId },
      });

      if (contract && contract.status !== 'assinado') {
        await prisma.digitalContract.update({
          where: { id: contract.id },
          data: { status: 'assinado', signedAt: contract.signedAt || new Date() },
        });
        log(`Contract ${contract.id} document_ready, marked as signed`);
      }

      return NextResponse.json({ ok: true });
    }

    log(`Unhandled event: ${event}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Assinafy Webhook Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — Health check for webhook
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok', service: 'assinafy-webhook' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// HEAD — Webhook validation
export async function HEAD() {
  return new Response(null, { status: 200 });
}

// OPTIONS — CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS, PUT',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    },
  });
}

// PUT — Some webhook validators use PUT
export async function PUT() {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
