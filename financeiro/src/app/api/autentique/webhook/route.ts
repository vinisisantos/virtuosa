import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

function log(msg: string, data?: unknown) {
  console.log(`[Autentique Webhook] ${msg}`, data ? JSON.stringify(data).substring(0, 500) : '');
}

/**
 * POST /api/autentique/webhook
 * 
 * Receives webhook events from Autentique.
 * Must be registered in the Autentique dashboard.
 * 
 * Key events:
 * - signature.accepted → Mark contract as signed
 * - signature.rejected → Mark contract as cancelled
 * - document.finished → Save signed PDF URL
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    
    // HMAC verification (optional — only if AUTENTIQUE_WEBHOOK_SECRET is set)
    const webhookSecret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get('x-autentique-signature');
      if (!signature) {
        log('Missing x-autentique-signature header');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      const calculated = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(calculated, 'hex'),
        Buffer.from(signature, 'hex'),
      );
      if (!isValid) {
        log('Invalid HMAC signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const event = payload?.event;
    if (!event) {
      log('No event in payload');
      return NextResponse.json({ error: 'No event' }, { status: 400 });
    }

    const eventType = event.type;
    const eventId = event.id;
    const eventData = event.data;

    log(`Event: ${eventType}, ID: ${eventId}`);

    // Log webhook to database for auditability
    try {
      await prisma.webhookLog.create({
        data: {
          source: 'autentique',
          eventType: eventType || 'unknown',
          payload: rawBody.substring(0, 10000),
          status: 'received',
        },
      });
    } catch (e) {
      log('Failed to log webhook', e);
    }

    // Return 200 immediately (best practice from Autentique docs)
    // Process the event after responding
    const response = NextResponse.json({ received: true });

    // Process events
    switch (eventType) {
      case 'signature.accepted': {
        await handleSignatureAccepted(eventData);
        break;
      }
      case 'signature.rejected': {
        await handleSignatureRejected(eventData);
        break;
      }
      case 'document.finished': {
        await handleDocumentFinished(eventData);
        break;
      }
      case 'signature.viewed': {
        log(`Document viewed by signer: ${eventData?.user?.name || 'unknown'}`);
        break;
      }
      default:
        log(`Unhandled event type: ${eventType}`);
    }

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Autentique Webhook Error]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also handle GET for webhook verification (some services send GET to verify)
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'autentique-webhook' });
}

async function handleSignatureAccepted(data: Record<string, unknown>) {
  // data contains the signature object
  // data.document is the document ID string
  const documentId = data?.document as string;
  const signedAt = (data as Record<string, unknown>)?.signed as string;
  
  // Get signer geolocation/IP from events array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (data as any)?.events as any[];
  const acceptEvent = events?.find((e: { type: string }) => e.type === 'accepted');
  const ip = acceptEvent?.ip || null;

  if (!documentId) {
    log('signature.accepted: No document ID in payload');
    return;
  }

  log(`Signature accepted for document: ${documentId}`);

  try {
    const contract = await prisma.digitalContract.findFirst({
      where: { autentiqueDocId: documentId },
    });

    if (!contract) {
      log(`No contract found for autentiqueDocId: ${documentId}`);
      return;
    }

    await prisma.digitalContract.update({
      where: { id: contract.id },
      data: {
        status: 'assinado',
        autentiqueStatus: 'signed',
        signedAt: signedAt ? new Date(signedAt) : new Date(),
        signatureIp: ip,
      },
    });

    log(`Contract ${contract.id} marked as signed`);
  } catch (err) {
    log('Error updating contract on signature.accepted', err);
  }
}

async function handleSignatureRejected(data: Record<string, unknown>) {
  const documentId = data?.document as string;
  if (!documentId) return;

  log(`Signature rejected for document: ${documentId}`);

  try {
    const contract = await prisma.digitalContract.findFirst({
      where: { autentiqueDocId: documentId },
    });

    if (!contract) return;

    await prisma.digitalContract.update({
      where: { id: contract.id },
      data: {
        status: 'cancelado',
        autentiqueStatus: 'rejected',
      },
    });

    log(`Contract ${contract.id} marked as rejected`);
  } catch (err) {
    log('Error updating contract on signature.rejected', err);
  }
}

async function handleDocumentFinished(data: Record<string, unknown>) {
  // data is the document object itself (with files.signed URL)
  const documentId = (data as Record<string, unknown>)?.id as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const files = (data as any)?.files as { original?: string; signed?: string };
  const signedPdfUrl = files?.signed || null;

  if (!documentId) return;

  log(`Document finished: ${documentId}, signedPdf: ${signedPdfUrl}`);

  try {
    const contract = await prisma.digitalContract.findFirst({
      where: { autentiqueDocId: documentId },
    });

    if (!contract) return;

    await prisma.digitalContract.update({
      where: { id: contract.id },
      data: {
        autentiqueStatus: 'finished',
        signedPdfUrl: signedPdfUrl,
        status: 'assinado',
      },
    });

    log(`Contract ${contract.id} finished with PDF: ${signedPdfUrl}`);
  } catch (err) {
    log('Error updating contract on document.finished', err);
  }
}
