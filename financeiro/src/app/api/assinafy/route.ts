import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.ASSINAFY_API_KEY || '';
const ACCOUNT_ID = process.env.ASSINAFY_ACCOUNT_ID || '';
const BASE_URL = process.env.ASSINAFY_BASE_URL || 'https://api.assinafy.com.br/v1';

// POST /api/assinafy — Proxy for Assinafy API actions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!API_KEY || !ACCOUNT_ID) {
      return NextResponse.json({ error: 'Assinafy credentials not configured' }, { status: 500 });
    }

    switch (action) {
      case 'upload': {
        // Upload a PDF (from base64) to Assinafy
        const { pdfBase64, fileName } = body;
        if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 is required' }, { status: 400 });

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const formData = new FormData();
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        formData.append('file', blob, fileName || 'contrato.pdf');

        const uploadRes = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/documents`, {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY },
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          return NextResponse.json({ error: 'Upload failed', details: uploadData }, { status: uploadRes.status });
        }

        return NextResponse.json({ success: true, document: uploadData.data || uploadData });
      }

      case 'createSigner': {
        // Create a signer
        const { fullName, email } = body;
        if (!fullName || !email) return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });

        const signerRes = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/signers`, {
          method: 'POST',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ full_name: fullName, email }),
        });

        const signerData = await signerRes.json();
        if (!signerRes.ok) {
          return NextResponse.json({ error: 'Create signer failed', details: signerData }, { status: signerRes.status });
        }

        return NextResponse.json({ success: true, signer: signerData.data || signerData });
      }

      case 'createAssignment': {
        // Create assignment (request signature)
        const { documentId, signerIds, expiration } = body;
        if (!documentId || !signerIds?.length) {
          return NextResponse.json({ error: 'documentId and signerIds are required' }, { status: 400 });
        }

        // Try with signerIds format first (Quick Start format)
        const assignBody: any = {
          method: 'virtual',
          signerIds: signerIds,
        };
        if (expiration) assignBody.expiration = expiration;

        console.log('[Assinafy] Creating assignment:', JSON.stringify(assignBody));
        let assignRes = await fetch(`${BASE_URL}/documents/${documentId}/assignments`, {
          method: 'POST',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(assignBody),
        });

        let assignData = await assignRes.json();

        // If signerIds format fails, try with signers format (detailed docs format)
        if (!assignRes.ok) {
          console.log('[Assinafy] signerIds format failed, trying signers format. Error:', JSON.stringify(assignData));
          const altBody: any = {
            method: 'virtual',
            signers: signerIds.map((id: string) => ({ id })),
          };
          if (expiration) altBody.expiration = expiration;

          assignRes = await fetch(`${BASE_URL}/documents/${documentId}/assignments`, {
            method: 'POST',
            headers: {
              'X-Api-Key': API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(altBody),
          });
          assignData = await assignRes.json();
        }

        if (!assignRes.ok) {
          const errorMsg = assignData?.message || assignData?.error || JSON.stringify(assignData);
          console.error('[Assinafy] Assignment failed:', errorMsg);
          return NextResponse.json({ error: `Assignment falhou: ${errorMsg}`, details: assignData }, { status: assignRes.status });
        }

        return NextResponse.json({ success: true, assignment: assignData.data || assignData });
      }

      case 'getDocument': {
        // Get document status
        const { documentId } = body;
        if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 });

        const docRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
          headers: { 'X-Api-Key': API_KEY },
        });

        const docData = await docRes.json();
        return NextResponse.json({ success: true, document: docData.data || docData });
      }

      case 'listDocuments': {
        const docRes = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/documents`, {
          headers: { 'X-Api-Key': API_KEY },
        });
        const docData = await docRes.json();
        return NextResponse.json({ success: true, documents: docData.data || docData });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[Assinafy API Error]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
