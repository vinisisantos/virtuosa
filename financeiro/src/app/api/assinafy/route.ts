import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.ASSINAFY_API_KEY || '';
const ACCOUNT_ID = process.env.ASSINAFY_ACCOUNT_ID || '';
const BASE_URL = process.env.ASSINAFY_BASE_URL || 'https://api.assinafy.com.br/v1';

function log(msg: string, data?: any) {
  console.log(`[Assinafy] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

// POST /api/assinafy — Proxy for Assinafy API actions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    log(`Action: ${action}, API_KEY present: ${!!API_KEY}, ACCOUNT_ID: ${ACCOUNT_ID}`);

    if (!API_KEY || !ACCOUNT_ID) {
      return NextResponse.json({ error: 'Assinafy credentials not configured' }, { status: 500 });
    }

    switch (action) {
      case 'upload': {
        const { pdfBase64, fileName } = body;
        if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 is required' }, { status: 400 });

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        log(`Uploading PDF: ${fileName}, size: ${pdfBuffer.length} bytes`);

        const formData = new FormData();
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        formData.append('file', blob, fileName || 'contrato.pdf');

        const url = `${BASE_URL}/accounts/${ACCOUNT_ID}/documents`;
        log(`Upload URL: ${url}`);

        const uploadRes = await fetch(url, {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY },
          body: formData,
        });

        const uploadText = await uploadRes.text();
        log(`Upload response status: ${uploadRes.status}, body: ${uploadText.substring(0, 300)}`);

        let uploadData;
        try { uploadData = JSON.parse(uploadText); } catch { uploadData = { raw: uploadText }; }

        if (!uploadRes.ok) {
          return NextResponse.json({
            error: `Upload falhou (HTTP ${uploadRes.status}): ${uploadData?.message || uploadText.substring(0, 200)}`,
            details: uploadData,
          }, { status: uploadRes.status });
        }

        // Assinafy might return { status, data } or flat response
        const doc = uploadData?.data || uploadData;
        return NextResponse.json({ success: true, document: doc });
      }

      case 'createSigner': {
        const { fullName, email } = body;
        if (!fullName || !email) return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });

        const url = `${BASE_URL}/accounts/${ACCOUNT_ID}/signers`;
        const reqBody = { full_name: fullName, email };
        log(`Create signer URL: ${url}, body:`, reqBody);

        const signerRes = await fetch(url, {
          method: 'POST',
          headers: {
            'X-Api-Key': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reqBody),
        });

        const signerText = await signerRes.text();
        log(`Signer response status: ${signerRes.status}, body: ${signerText.substring(0, 300)}`);

        let signerData;
        try { signerData = JSON.parse(signerText); } catch { signerData = { raw: signerText }; }

        if (!signerRes.ok) {
          return NextResponse.json({
            error: `Criar signatário falhou (HTTP ${signerRes.status}): ${signerData?.message || signerText.substring(0, 200)}`,
            details: signerData,
          }, { status: signerRes.status });
        }

        const signer = signerData?.data || signerData;
        return NextResponse.json({ success: true, signer });
      }

      case 'createAssignment': {
        const { documentId, signerIds, expiration } = body;
        if (!documentId || !signerIds?.length) {
          return NextResponse.json({ error: 'documentId and signerIds are required' }, { status: 400 });
        }

        // Wait for document to finish processing (max 30s, poll every 2s)
        log(`Waiting for document ${documentId} to finish processing...`);
        let docReady = false;
        for (let attempt = 0; attempt < 15; attempt++) {
          const statusRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
            headers: { 'X-Api-Key': API_KEY },
          });
          const statusText = await statusRes.text();
          let statusData;
          try { statusData = JSON.parse(statusText); } catch { statusData = {}; }
          const doc = statusData?.data || statusData;
          const docStatus = doc?.status || '';
          log(`Document status check #${attempt + 1}: ${docStatus}`);

          if (docStatus === 'uploaded' || docStatus === 'ready' || docStatus === 'completed' || docStatus === 'active') {
            docReady = true;
            break;
          }
          if (docStatus === 'error' || docStatus === 'failed') {
            return NextResponse.json({ error: `Documento com erro: ${docStatus}` }, { status: 400 });
          }
          // Wait 2 seconds before next check
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (!docReady) {
          return NextResponse.json({ error: 'Documento ainda processando. Tente novamente em alguns segundos.' }, { status: 400 });
        }

        const url = `${BASE_URL}/documents/${documentId}/assignments`;

        // Try signerIds format first (Quick Start)
        const body1 = { method: 'virtual', signerIds, ...(expiration && { expiration }) };
        log(`Assignment attempt 1 URL: ${url}, body:`, body1);

        let assignRes = await fetch(url, {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(body1),
        });

        let assignText = await assignRes.text();
        log(`Assignment attempt 1 status: ${assignRes.status}, body: ${assignText.substring(0, 300)}`);

        let assignData;
        try { assignData = JSON.parse(assignText); } catch { assignData = { raw: assignText }; }

        // If first format fails, try signers format
        if (!assignRes.ok) {
          const body2 = { method: 'virtual', signers: signerIds.map((id: string) => ({ id })), ...(expiration && { expiration }) };
          log(`Assignment attempt 2 body:`, body2);

          assignRes = await fetch(url, {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body2),
          });

          assignText = await assignRes.text();
          log(`Assignment attempt 2 status: ${assignRes.status}, body: ${assignText.substring(0, 300)}`);
          try { assignData = JSON.parse(assignText); } catch { assignData = { raw: assignText }; }
        }

        if (!assignRes.ok) {
          return NextResponse.json({
            error: `Assignment falhou (HTTP ${assignRes.status}): ${assignData?.message || assignText.substring(0, 200)}`,
            details: assignData,
          }, { status: assignRes.status });
        }

        const assignment = assignData?.data || assignData;
        return NextResponse.json({ success: true, assignment });
      }

      case 'getDocument': {
        const { documentId } = body;
        if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 });

        const docRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
          headers: { 'X-Api-Key': API_KEY },
        });
        const docData = await docRes.json();
        return NextResponse.json({ success: true, document: docData?.data || docData });
      }

      case 'listDocuments': {
        const docRes = await fetch(`${BASE_URL}/accounts/${ACCOUNT_ID}/documents`, {
          headers: { 'X-Api-Key': API_KEY },
        });
        const docData = await docRes.json();
        return NextResponse.json({ success: true, documents: docData?.data || docData });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[Assinafy API Error]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
