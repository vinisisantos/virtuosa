import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createDocument, getDocument, resendSignature, listDocuments } from '@/lib/autentique';

function log(msg: string, data?: unknown) {
  console.log(`[Autentique API] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;
    log(`Action: ${action}`);

    if (!process.env.AUTENTIQUE_API_KEY) {
      return NextResponse.json({ error: 'AUTENTIQUE_API_KEY não configurada.' }, { status: 500 });
    }

    switch (action) {
      case 'send': {
        const { contractId } = body;
        if (!contractId) return NextResponse.json({ error: 'contractId é obrigatório' }, { status: 400 });

        const contract = await prisma.digitalContract.findUnique({ where: { id: contractId } });
        if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

        if (contract.autentiqueDocId) {
          return NextResponse.json({
            error: 'Contrato já enviado para Autentique',
            signatureLink: contract.signatureLink,
            autentiqueDocId: contract.autentiqueDocId,
          }, { status: 400 });
        }

        const htmlContent = wrapHtml(contract.content, contract.clientName, contract.templateName);

        const result = await createDocument({
          name: `${contract.templateName} — ${contract.clientName}`,
          htmlContent,
          signerName: contract.clientName,
          signerCpf: contract.clientCpf || undefined,
          sandbox: true,
        });

        if (!result.success || !result.document) {
          return NextResponse.json({ error: result.error || 'Erro ao criar documento' }, { status: 500 });
        }

        const updated = await prisma.digitalContract.update({
          where: { id: contractId },
          data: {
            autentiqueDocId: result.document.id,
            autentiqueSignId: result.signaturePublicId || null,
            signatureLink: result.signatureLink || null,
            deliveryMethod: 'link',
            autentiqueStatus: 'pending',
            status: 'enviado',
          },
        });

        return NextResponse.json({
          success: true,
          signatureLink: result.signatureLink,
          autentiqueDocId: result.document.id,
          contract: updated,
        });
      }

      case 'status': {
        const { autentiqueDocId, contractId: cid } = body;
        let docId = autentiqueDocId;
        if (!docId && cid) {
          const c = await prisma.digitalContract.findUnique({ where: { id: cid }, select: { autentiqueDocId: true } });
          docId = c?.autentiqueDocId;
        }
        if (!docId) return NextResponse.json({ error: 'ID necessário' }, { status: 400 });

        const result = await getDocument(docId);
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

        const sig = result.document?.signatures?.[0];
        let status = 'pending';
        if (sig?.signed) status = 'signed';
        else if (sig?.rejected) status = 'rejected';
        else if (sig?.viewed) status = 'viewed';

        return NextResponse.json({
          success: true,
          document: result.document,
          signatureStatus: status,
          signedPdfUrl: result.document?.files?.signed,
        });
      }

      case 'resend': {
        const { autentiqueDocId: rid, contractId: rcid } = body;
        let docId = rid;
        if (!docId && rcid) {
          const c = await prisma.digitalContract.findUnique({ where: { id: rcid }, select: { autentiqueDocId: true } });
          docId = c?.autentiqueDocId;
        }
        if (!docId) return NextResponse.json({ error: 'ID necessário' }, { status: 400 });

        const result = await resendSignature(docId);
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
        return NextResponse.json({ success: true, message: 'Reenviado com sucesso' });
      }

      case 'list': {
        const { sandbox = true, page = 1, limit = 20 } = body;
        const result = await listDocuments({ sandbox, page, limit });
        if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
        return NextResponse.json({ success: true, documents: result.documents });
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Autentique API Error]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function wrapHtml(content: string, clientName: string, templateName: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${templateName} — ${clientName}</title>
<style>body{font-family:'Segoe UI',Roboto,Arial,sans-serif;max-width:800px;margin:0 auto;padding:48px 40px;line-height:1.8;color:#1a1a1a;font-size:14px}.header{text-align:center;margin-bottom:40px;padding-bottom:20px;border-bottom:2px solid #e600a0}.header h1{font-size:20px;font-weight:800;color:#e600a0;margin:0}.header p{font-size:12px;color:#666;margin:8px 0 0}.content{white-space:pre-wrap}.footer{margin-top:60px;padding-top:20px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}</style>
</head><body>
<div class="header"><h1>VIRTUOSA ESTÉTICA</h1><p>${templateName}</p></div>
<div class="content">${content}</div>
<div class="footer"><p>Documento gerado eletronicamente por Virtuosa Estética</p><p>Assinatura digital com validade jurídica — Autentique</p></div>
</body></html>`;
}
