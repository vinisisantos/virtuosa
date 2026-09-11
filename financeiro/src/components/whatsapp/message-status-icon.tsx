import { Check, CheckCheck, CircleAlert, CircleHelp, Clock3 } from "lucide-react";
import { normalizeWhatsAppMessageStatus } from "@/lib/whatsapp/message-status";

export function MessageStatusIcon({ status }: { status: unknown }) {
  const normalized = normalizeWhatsAppMessageStatus(status);
  if (normalized === "deleted") return null;

  const isRead = normalized === "read" || normalized === "played";
  const Icon = isRead || normalized === "delivered"
    ? CheckCheck
    : normalized === "sent"
      ? Check
      : normalized === "pending"
        ? Clock3
        : normalized === "error"
          ? CircleAlert
          : CircleHelp;
  const label = normalized === "played" ? "Reproduzida"
    : normalized === "read" ? "Lida"
      : normalized === "delivered" ? "Entregue"
        : normalized === "sent" ? "Enviada"
          : normalized === "pending" ? "Aguardando confirmação de envio"
            : normalized === "error" ? "Falha no envio"
              : "Status não confirmado";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-message-status={normalized || "unknown"}
      className={`inline-flex shrink-0 ${isRead ? "text-[#53bdeb]" : normalized === "error" ? "text-red-500" : "opacity-90"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
