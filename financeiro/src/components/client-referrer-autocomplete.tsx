"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ReferrerChoice =
  | { type: "client"; id: string; name: string; unit: string }
  | { type: "external"; name: string };

type ClientOption = { id: string; name: string; unit: string };

export function ClientReferrerAutocomplete({
  value,
  onChange,
  unit,
  disabled = false,
  label = "Indicado por",
}: {
  value: ReferrerChoice | null;
  onChange: (value: ReferrerChoice | null) => void;
  unit?: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ purpose: "referrer", q: query.trim(), limit: "8" });
        if (unit) params.set("unit", unit);
        const response = await fetch(`/api/clients/search?${params.toString()}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível buscar clientes");
        setResults(Array.isArray(data.clients) ? data.clients : []);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : "Não foi possível buscar clientes");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, unit]);

  const choose = (choice: ReferrerChoice) => {
    onChange(choice);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
          <PopoverTrigger disabled={disabled} className="inline-flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50">
            <span className="min-w-0 truncate">{value?.name || "Buscar cliente ou nome externo"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-[min(420px,calc(100vw-2rem))] gap-2 border-border bg-card p-2 shadow-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Digite um nome ou telefone"
                className="h-10 pl-9"
                disabled={disabled}
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {loading && <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando clientes...</div>}
              {!loading && error && <p role="alert" className="px-3 py-3 text-sm text-destructive">{error}</p>}
              {!loading && !error && query.trim().length < 2 && <p className="px-3 py-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres.</p>}
              {!loading && !error && query.trim().length >= 2 && results.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
              {results.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => choose({ type: "client", id: client.id, name: client.name, unit: client.unit })}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{client.name}</span>
                  <span className="text-xs text-muted-foreground">{client.unit}</span>
                </button>
              ))}
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => choose({ type: "external", name: query.trim() })}
                  className="flex w-full items-center gap-3 rounded-md border-t border-border px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate text-sm text-foreground">Usar “{query.trim()}” como nome externo</span>
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {value && (
          <Button type="button" variant="ghost" size="icon" aria-label="Remover indicador" disabled={disabled} onClick={() => onChange(null)} className="h-10 w-10 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Selecione alguém do CRM ou registre um nome externo. O cliente indicado ficará fora de automações e campanhas; mensagens individuais continuam disponíveis.</p>
    </div>
  );
}
