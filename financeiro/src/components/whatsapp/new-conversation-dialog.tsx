"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquarePlus, Phone, Search, XCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Conversation } from "@/lib/whatsapp/inbox-utils";

type CheckResult = {
  exists: boolean;
  number: string;
  jid?: string | null;
  conversationId?: string | null;
  alreadyExists?: boolean;
};

type Props = {
  open: boolean;
  endpoint: string;
  onOpenChange: (open: boolean) => void;
  onConversationReady: (conversation: Conversation) => void;
};

function formatBrazilianNationalNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function displayCheckedNumber(number: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+55 ${formatBrazilianNationalNumber(digits.slice(2))}`;
  }
  return `+${digits}`;
}

export function NewConversationDialog({ open, endpoint, onOpenChange, onConversationReady }: Props) {
  const [countryCode, setCountryCode] = useState("55");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nationalDigits = phone.replace(/\D/g, "");
  const fullNumber = `${countryCode.replace(/\D/g, "")}${nationalDigits}`;
  const isValid = useMemo(() => {
    const ddi = countryCode.replace(/\D/g, "");
    if (ddi.length < 1 || ddi.length > 3) return false;
    if (ddi === "55") return nationalDigits.length === 10 || nationalDigits.length === 11;
    return fullNumber.length >= 10 && fullNumber.length <= 15;
  }, [countryCode, fullNumber.length, nationalDigits.length]);

  useEffect(() => {
    if (open) return;
    setCountryCode("55");
    setPhone("");
    setName("");
    setChecking(false);
    setCreating(false);
    setResult(null);
    setError(null);
  }, [open]);

  const resetVerification = () => {
    setResult(null);
    setError(null);
  };

  const handlePhoneChange = (value: string) => {
    let digits = value.replace(/\D/g, "");
    const ddi = countryCode.replace(/\D/g, "");
    if (ddi && digits.startsWith(ddi) && digits.length > 11) {
      digits = digits.slice(ddi.length);
    }
    setPhone(ddi === "55" ? formatBrazilianNationalNumber(digits) : digits.slice(0, 12));
    resetVerification();
  };

  const checkNumber = async () => {
    if (!isValid || checking) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", number: fullNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível verificar o número.");
      setResult(data as CheckResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível verificar o número.");
    } finally {
      setChecking(false);
    }
  };

  const createConversation = async () => {
    if (!result?.exists || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          number: result.number || fullNumber,
          name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.conversation) {
        throw new Error(data.error || "Não foi possível iniciar a conversa.");
      }
      onConversationReady(data.conversation as Conversation);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível iniciar a conversa.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <MessageSquarePlus className="h-5 w-5" />
          </div>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>Informe o telefone que deseja chamar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="new-conversation-phone">
              Telefone
            </label>
            <div className="flex gap-2">
              <div className="flex h-10 w-20 shrink-0 items-center rounded-md border border-input bg-background px-3 text-sm text-foreground focus-within:ring-1 focus-within:ring-primary">
                <span className="text-muted-foreground">+</span>
                <input
                  aria-label="DDI"
                  inputMode="numeric"
                  value={countryCode}
                  onChange={(event) => {
                    setCountryCode(event.target.value.replace(/\D/g, "").slice(0, 3));
                    resetVerification();
                  }}
                  className="min-w-0 flex-1 bg-transparent text-center outline-none"
                />
              </div>
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="new-conversation-phone"
                  autoFocus
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void checkNumber();
                  }}
                  placeholder={countryCode === "55" ? "(11) 99999-9999" : "Número com DDD"}
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {!result?.exists && (
            <button
              type="button"
              onClick={() => void checkNumber()}
              disabled={!isValid || checking}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {checking ? "Verificando..." : "Verificar número"}
            </button>
          )}

          {result && !result.exists && (
            <div className="flex items-start gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">WhatsApp não encontrado</p>
                <p className="mt-0.5 text-xs opacity-90">Este número não possui uma conta de WhatsApp.</p>
              </div>
            </div>
          )}

          {result?.exists && (
            <>
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {result.alreadyExists ? "Conversa encontrada" : "WhatsApp disponível"}
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">{displayCheckedNumber(result.number)}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="new-conversation-name">
                  Nome <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="new-conversation-name"
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 120))}
                  placeholder="Nome do contato"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
              <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {result?.exists && (
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={creating}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void createConversation()}
              disabled={creating}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? "Abrindo..." : result.alreadyExists ? "Abrir conversa" : "Iniciar conversa"}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
