import { NextRequest, NextResponse } from 'next/server';
import { requireUnitGuard } from '@/lib/unit-guard';

const API_KEY = process.env.ASSINAFY_API_KEY || '';
const ACCOUNT_ID = process.env.ASSINAFY_ACCOUNT_ID || '';
const BASE_URL = process.env.ASSINAFY_BASE_URL || 'https://api.assinafy.com.br/v1';

function log(msg: string, data?: any) {
  console.log(`[Assinafy] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

// POST /api/assinafy — Proxy for Assinafy API actions
export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;

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

        // If signer already exists, search for them by email
        if (!signerRes.ok && (signerText.includes('já existe') || signerText.includes('already exists') || signerRes.status === 400)) {
          log(`Signer already exists, searching by email: ${email}`);
          const searchRes = await fetch(`${url}?email=${encodeURIComponent(email)}`, {
            headers: { 'X-Api-Key': API_KEY },
          });
          const searchText = await searchRes.text();
          log(`Search signers response: ${searchRes.status}, body: ${searchText.substring(0, 300)}`);

          let searchData;
          try { searchData = JSON.parse(searchText); } catch { searchData = {}; }

          const signers = searchData?.data || searchData?.signers || (Array.isArray(searchData) ? searchData : []);
          const existing = Array.isArray(signers)
            ? signers.find((s: any) => s.email === email)
            : null;

          if (existing) {
            log(`Found existing signer: ${existing.id || existing.uuid}`);
            return NextResponse.json({ success: true, signer: existing });
          }

          // If search didn't work, try listing all signers
          const listRes = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
          const listText = await listRes.text();
          let listData;
          try { listData = JSON.parse(listText); } catch { listData = {}; }

          const allSigners = listData?.data || listData?.signers || (Array.isArray(listData) ? listData : []);
          const found = Array.isArray(allSigners)
            ? allSigners.find((s: any) => s.email === email)
            : null;

          if (found) {
            log(`Found signer in full list: ${found.id || found.uuid}`);
            return NextResponse.json({ success: true, signer: found });
          }

          return NextResponse.json({
            error: `Criar signatário falhou (HTTP ${signerRes.status}): ${signerData?.message || signerText.substring(0, 200)}`,
            details: signerData,
          }, { status: signerRes.status });
        }

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

        // Quick status check (no polling — frontend already waits)
        const statusRes = await fetch(`${BASE_URL}/documents/${documentId}`, {
          headers: { 'X-Api-Key': API_KEY },
        });
        const statusText = await statusRes.text();
        let statusData;
        try { statusData = JSON.parse(statusText); } catch { statusData = {}; }
        const doc = statusData?.data || statusData;
        log(`Document status: ${doc?.status || 'unknown'}`);

        if (doc?.status === 'error' || doc?.status === 'failed') {
          return NextResponse.json({ error: `Documento com erro: ${doc.status}` }, { status: 400 });
        }

        // Try to create assignment directly
        const url = `${BASE_URL}/documents/${documentId}/assignments`;
        const exp = expiration || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();

        // Attempt 1: signerIds format
        const body1 = { method: 'virtual', signerIds, expiration: exp };
        log(`Assignment URL: ${url}, body:`, body1);

        let assignRes = await fetch(url, {
          method: 'POST',
          headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(body1),
        });

        let assignText = await assignRes.text();
        log(`Assignment response: ${assignRes.status}, body: ${assignText.substring(0, 300)}`);

        let assignData;
        try { assignData = JSON.parse(assignText); } catch { assignData = { raw: assignText }; }

        // Attempt 2: signers format (if first failed)
        if (!assignRes.ok) {
          const body2 = { method: 'virtual', signers: signerIds.map((id: string) => ({ id })), expiration: exp };
          log(`Assignment attempt 2:`, body2);

          assignRes = await fetch(url, {
            method: 'POST',
            headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body2),
          });

          assignText = await assignRes.text();
          log(`Assignment attempt 2: ${assignRes.status}, body: ${assignText.substring(0, 300)}`);
          try { assignData = JSON.parse(assignText); } catch { assignData = { raw: assignText }; }
        }

        if (!assignRes.ok) {
          return NextResponse.json({
            error: `Assignment falhou (HTTP ${assignRes.status}): ${assignData?.message || assignText.substring(0, 200)}`,
            details: assignData,
          }, { status: assignRes.status });
        }

        // Extract signing URL
        const assignment = assignData?.data || assignData;
        const signingUrl = assignment?.signing_urls?.[0]?.url
          || assignment?.signers?.[0]?.signing_url
          || '';

        return NextResponse.json({ success: true, assignment, signingUrl });
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
