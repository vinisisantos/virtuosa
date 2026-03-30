import { NextRequest, NextResponse } from 'next/server';

const TOKEN_API = process.env.D4SIGN_TOKEN_API || '';
const CRYPT_KEY = process.env.D4SIGN_CRYPT_KEY || '';
const BASE_URL = process.env.D4SIGN_BASE_URL || 'https://sandbox.d4sign.com.br/api/v1';

function authParams() {
  return `tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`;
}

function log(msg: string, data?: any) {
  console.log(`[D4Sign] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    log(`Action: ${action}`);

    if (!TOKEN_API || !CRYPT_KEY) {
      return NextResponse.json({ error: 'D4Sign credentials not configured' }, { status: 500 });
    }

    switch (action) {
      // ─── List safes ───
      case 'listSafes': {
        const res = await fetch(`${BASE_URL}/safes?${authParams()}`);
        const data = await res.json();
        log('List safes:', data);
        return NextResponse.json({ success: true, safes: data });
      }

      // ─── Upload document (base64) ───
      case 'upload': {
        const { pdfBase64, fileName, safeUuid } = body;
        if (!pdfBase64) return NextResponse.json({ error: 'pdfBase64 is required' }, { status: 400 });

        // Auto-discover safe if not provided
        let targetSafe = safeUuid;
        if (!targetSafe) {
          const safesRes = await fetch(`${BASE_URL}/safes?${authParams()}`);
          const safesData = await safesRes.json();
          log('Safes for auto-discover:', safesData);
          
          if (Array.isArray(safesData) && safesData.length > 0) {
            targetSafe = safesData[0].uuid_safe || safesData[0].uuid;
          } else {
            return NextResponse.json({ 
              error: 'Nenhum cofre encontrado. Crie um cofre no painel D4Sign primeiro.',
              safes: safesData 
            }, { status: 400 });
          }
        }

        log(`Uploading to safe: ${targetSafe}, fileName: ${fileName}`);

        const uploadRes = await fetch(`${BASE_URL}/documents/${targetSafe}/uploadbinary?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64_binary_file: pdfBase64,
            mime_type: 'application/pdf',
            name: fileName || 'contrato.pdf',
          }),
        });

        const uploadText = await uploadRes.text();
        log(`Upload response: ${uploadRes.status}`, uploadText);

        let uploadData;
        try { uploadData = JSON.parse(uploadText); } catch { uploadData = { raw: uploadText }; }

        if (!uploadRes.ok) {
          return NextResponse.json({
            error: `Upload falhou (HTTP ${uploadRes.status}): ${uploadData?.message || uploadText.substring(0, 200)}`,
            details: uploadData,
          }, { status: uploadRes.status });
        }

        const docUuid = uploadData?.uuid || '';
        return NextResponse.json({ success: true, document: uploadData, documentId: docUuid });
      }

      // ─── Create signer list ───
      case 'createSigner': {
        const { documentId, email, name } = body;
        if (!documentId || !email) {
          return NextResponse.json({ error: 'documentId and email are required' }, { status: 400 });
        }

        const signerBody = {
          signers: [{
            email,
            act: '1', // 1 = assinar
            foreign: '0',
            certificadoicpbr: '0',
            skipemail: '1', // Don't send email, we'll use the link
            ...(name && { name }),
          }],
        };

        log(`Create signer for doc ${documentId}:`, signerBody);

        const signerRes = await fetch(`${BASE_URL}/documents/${documentId}/createlist?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(signerBody),
        });

        const signerText = await signerRes.text();
        log(`Signer response: ${signerRes.status}`, signerText);

        let signerData;
        try { signerData = JSON.parse(signerText); } catch { signerData = { raw: signerText }; }

        return NextResponse.json({ success: signerRes.ok, signer: signerData });
      }

      // ─── Send document to signer ───
      case 'sendToSign': {
        const { documentId, message, skip_email } = body;
        if (!documentId) {
          return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
        }

        const sendBody: any = {
          message: message || 'Por favor, assine o contrato.',
          skip_email: skip_email || '0',
          workflow: '0',
        };

        log(`Send to sign doc ${documentId}:`, sendBody);

        const sendRes = await fetch(`${BASE_URL}/documents/${documentId}/sendtosigner?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sendBody),
        });

        const sendText = await sendRes.text();
        log(`Send response: ${sendRes.status}`, sendText);

        let sendData;
        try { sendData = JSON.parse(sendText); } catch { sendData = { raw: sendText }; }

        return NextResponse.json({ success: sendRes.ok, data: sendData });
      }

      // ─── Get document status / signing URL ───
      case 'getDocument': {
        const { documentId } = body;
        if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

        const docRes = await fetch(`${BASE_URL}/documents/${documentId}?${authParams()}`);
        const docData = await docRes.json();
        log(`Document status:`, docData);

        return NextResponse.json({ success: true, document: docData });
      }

      // ─── Full flow: upload → add signer → send ───
      case 'fullFlow': {
        const { pdfBase64, fileName, signerEmail, signerName, safeUuid } = body;
        if (!pdfBase64 || !signerEmail) {
          return NextResponse.json({ error: 'pdfBase64 and signerEmail are required' }, { status: 400 });
        }

        // Step 1: Auto-discover safe
        let targetSafe = safeUuid;
        if (!targetSafe) {
          const safesRes = await fetch(`${BASE_URL}/safes?${authParams()}`);
          const safesData = await safesRes.json();
          if (Array.isArray(safesData) && safesData.length > 0) {
            targetSafe = safesData[0].uuid_safe || safesData[0].uuid;
          } else {
            return NextResponse.json({ error: 'Nenhum cofre encontrado. Crie um cofre no painel D4Sign.' }, { status: 400 });
          }
        }

        // Step 2: Upload document
        log(`[fullFlow] Uploading to safe ${targetSafe}`);
        const uploadRes = await fetch(`${BASE_URL}/documents/${targetSafe}/uploadbinary?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64_binary_file: pdfBase64,
            mime_type: 'application/pdf',
            name: fileName || 'contrato.pdf',
          }),
        });
        const uploadData = await uploadRes.json();
        log(`[fullFlow] Upload result:`, uploadData);

        if (!uploadRes.ok || !uploadData?.uuid) {
          return NextResponse.json({ error: `Upload falhou: ${uploadData?.message || JSON.stringify(uploadData)}` }, { status: 400 });
        }
        const docUuid = uploadData.uuid;

        // Step 3: Add signer
        log(`[fullFlow] Adding signer ${signerEmail} to doc ${docUuid}`);
        const signerRes = await fetch(`${BASE_URL}/documents/${docUuid}/createlist?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signers: [{
              email: signerEmail,
              act: '1',
              foreign: '0',
              certificadoicpbr: '0',
              skipemail: '1',
              ...(signerName && { name: signerName }),
            }],
          }),
        });
        const signerData = await signerRes.json();
        log(`[fullFlow] Signer result:`, signerData);

        // Step 4: Send to sign
        log(`[fullFlow] Sending doc ${docUuid} to sign`);
        const sendRes = await fetch(`${BASE_URL}/documents/${docUuid}/sendtosigner?${authParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Por favor, assine o contrato.',
            skip_email: '1',
            workflow: '0',
          }),
        });
        const sendData = await sendRes.json();
        log(`[fullFlow] Send result:`, sendData);

        // Build signing URL
        const signingUrl = `${BASE_URL.replace('/api/v1', '')}/embed/viewblob/${docUuid}`;

        return NextResponse.json({
          success: true,
          documentId: docUuid,
          signingUrl,
          uploadData,
          signerData,
          sendData,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[D4Sign API Error]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
