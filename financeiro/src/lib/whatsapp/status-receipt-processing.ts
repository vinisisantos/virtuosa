import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { broadcastInboxRealtimeChange } from "@/lib/whatsapp/inbox-realtime";
import {
  mergeWhatsAppMessageStatus,
  normalizeWhatsAppMessageStatus,
  whatsAppStatusUpdateFilter,
  type WhatsAppMessageStatus,
} from "@/lib/whatsapp/message-status";
import {
  completeStatusReceipt,
  retryStatusReceipt,
  type StatusReceiptClaim,
} from "@/lib/whatsapp/status-receipt-queue";

export function isStatusReceiptPilot(instance: { unit?: string | null; provider?: string | null }) {
  return instance.unit === "SBC" && instance.provider !== "waha";
}

export function normalizeReceiptJid(value: string) {
  const jid = value.trim().toLowerCase().replace(/@c\.us$/, "@s.whatsapp.net");
  if (/^\d{8,15}(?::\d+)?@s\.whatsapp\.net$/.test(jid)) {
    return jid.replace(/:\d+@/, "@");
  }
  return /^\d{1,20}@(?:hosted\.)?lid$/.test(jid) ? jid : null;
}

function receiptPhoneCandidates(jid: string) {
  if (!jid.endsWith("@s.whatsapp.net")) return null;
  const phone = jid.split("@")[0];
  const phones = [phone];
  if (/^55\d{2}9\d{8}$/.test(phone)) phones.push(`${phone.slice(0, 4)}${phone.slice(5)}`);
  else if (/^55\d{10}$/.test(phone)) phones.push(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  return phones;
}

export function applyObservedMessageStatus(
  message: { id: string; conversationId: string; messageId: string; instanceId: string; status: WhatsAppMessageStatus },
  database: typeof prisma | Prisma.TransactionClient = prisma,
) {
  return database.whatsAppMessage.updateMany({
    where: {
      id: message.id,
      conversationId: message.conversationId,
      messageId: message.messageId,
      fromMe: true,
      conversation: { instanceId: message.instanceId },
      status: whatsAppStatusUpdateFilter(message.status),
    },
    data: { status: message.status },
  });
}

/** Replays apply only an observed receipt; they never execute message ingestion or sends. */
export async function processStatusReceipt(claim: StatusReceiptClaim) {
  const { receipt, token } = claim;
  try {
    const status = normalizeWhatsAppMessageStatus(receipt.receiptStatus);
    const jid = normalizeReceiptJid(receipt.remoteJid);
    if (!status || !jid) {
      await completeStatusReceipt(receipt.id, token, { outcome: "ambiguous", error: "invalid_receipt" });
      return "ambiguous" as const;
    }
    const phones = receiptPhoneCandidates(jid);
    const matches = await prisma.whatsAppMessage.findMany({
      where: {
        messageId: receipt.messageId,
        fromMe: true,
        conversation: {
          instanceId: receipt.instanceId,
          ...(phones ? { contact: { phone: { in: phones } } } : {}),
        },
      },
      select: { id: true, conversationId: true, status: true },
      take: 2,
    });
    if (matches.length === 0) {
      await retryStatusReceipt(receipt, token, "message_not_persisted_yet");
      return "pending" as const;
    }
    // LID is not a phone. Even inside an instance, a repeated ID must not pick a random chat.
    if (matches.length !== 1) {
      await completeStatusReceipt(receipt.id, token, { outcome: "ambiguous", error: "multiple_matching_conversations" });
      return "ambiguous" as const;
    }
    const message = matches[0];
    let changed = false;
    if (mergeWhatsAppMessageStatus(message.status, status) !== message.status) {
      const result = await applyObservedMessageStatus({
        id: message.id,
        conversationId: message.conversationId,
        messageId: receipt.messageId,
        instanceId: receipt.instanceId,
        status,
      });
      changed = result.count > 0;
    }
    await completeStatusReceipt(receipt.id, token, { outcome: "completed" });
    if (changed) {
      await broadcastInboxRealtimeChange({
        instanceId: receipt.instanceId,
        conversationId: message.conversationId,
        messageId: message.id,
        kind: "status",
      });
    }
    console.info("[WhatsApp Receipt] completed", {
      receiptId: receipt.id,
      instanceId: receipt.instanceId,
      changed,
      attempt: receipt.attempts,
      receivedToAppliedMs: Date.now() - receipt.receivedAt.getTime(),
    });
    return "completed" as const;
  } catch {
    // If even rescheduling fails, the durable processing lease is recovered by the worker.
    await retryStatusReceipt(receipt, token, "receipt_apply_failed").catch(() => {});
    console.warn("[WhatsApp Receipt] retained_for_retry", { receiptId: receipt.id, instanceId: receipt.instanceId });
    return "pending" as const;
  }
}
