"use client";

import { Gift, Megaphone, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ProcedureSelector, type CatalogService } from "@/components/procedure-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import {
  roundMoney,
  classifySaleItem,
  saleItemDiscount,
  saleItemSubtotal,
  saleItemsTotal,
  type SaleItemDraft,
  type CampaignOfferView,
} from "@/lib/pipeline/sale-item-types";

type SaleItemsEditorProps = {
  items: SaleItemDraft[];
  onChange: (items: SaleItemDraft[]) => void;
  services: CatalogService[];
  disabled?: boolean;
  campaignOffer?: CampaignOfferView | null;
};

const CLASSIFICATION_LABELS = {
  direct: { label: "Venda direta", className: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  included: { label: "Incluído no anúncio", className: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  additional: { label: "Adicional", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  mixed: { label: "Incluído + adicional", className: "border-violet-500/30 bg-violet-500/10 text-violet-300" },
  unclassified: { label: "Oferta não configurada", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
} as const;

function formatEditableMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseEditableMoney(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, roundMoney(parsed)) : 0;
}

function MoneyInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatEditableMoney(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current || disabled) setText(formatEditableMoney(value));
  }, [disabled, value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        id={id}
        value={text}
        disabled={disabled}
        inputMode="decimal"
        className="pl-9"
        onFocus={(event) => {
          focusedRef.current = true;
          event.currentTarget.select();
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          focusedRef.current = false;
          const nextValue = parseEditableMoney(text);
          onChange(nextValue);
          setText(formatEditableMoney(nextValue));
        }}
      />
    </div>
  );
}

export function SaleItemsEditor({ items, onChange, services, disabled, campaignOffer }: SaleItemsEditorProps) {
  const editorId = useId();
  const [draft, setDraft] = useState("");
  const total = saleItemsTotal(items);
  const offerByService = new Map((campaignOffer?.items || []).map((item) => [item.serviceCatalogId, item]));

  const classificationFor = (item: SaleItemDraft, sessions: number) => {
    if (campaignOffer === undefined && item.classification) {
      return {
        classification: item.classification,
        campaignIncludedSessions: Math.min(sessions, item.campaignIncludedSessions || 0),
      };
    }
    return classifySaleItem({
      sessions,
      includedSessions: offerByService.get(item.serviceCatalogId)?.includedSessions,
      hasCampaign: Boolean(campaignOffer),
      campaignConfigured: campaignOffer?.configured,
    });
  };

  const updateItem = (index: number, update: (current: SaleItemDraft) => SaleItemDraft) => {
    onChange(items.map((item, itemIndex) => itemIndex === index ? update(item) : item));
  };

  const addService = (service: CatalogService) => {
    const existingIndex = items.findIndex((item) => item.serviceCatalogId === service.id);
    if (existingIndex >= 0) {
      updateItem(existingIndex, (current) => {
        const currentSubtotal = saleItemSubtotal(current);
        const nextSessions = current.sessions + 1;
        const keptFullPrice = current.itemType !== "courtesy" && Math.abs(current.paidAmount - currentSubtotal) < 0.01;
        return {
          ...current,
          sessions: nextSessions,
          paidAmount: keptFullPrice ? roundMoney(current.unitPrice * nextSessions) : current.paidAmount,
          ...classificationFor(current, nextSessions),
        };
      });
      setDraft("");
      return;
    }

    const nextItem: SaleItemDraft = {
      serviceCatalogId: service.id,
      procedureName: service.name,
      sessions: 1,
      unitPrice: roundMoney(service.price),
      paidAmount: roundMoney(service.price),
      itemType: "paid",
      ...classifySaleItem({
        sessions: 1,
        includedSessions: offerByService.get(service.id)?.includedSessions,
        hasCampaign: Boolean(campaignOffer),
        campaignConfigured: campaignOffer?.configured,
      }),
    };
    onChange([
      ...items,
      nextItem,
    ]);
    setDraft("");
  };

  return (
    <div className="grid gap-3">
      {campaignOffer && (
        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${campaignOffer.configured ? "border-sky-500/25 bg-sky-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
          <Megaphone className={`mt-0.5 h-4 w-4 shrink-0 ${campaignOffer.configured ? "text-sky-300" : "text-amber-300"}`} />
          <div>
            <div className="text-sm font-semibold text-foreground">Campanha: {campaignOffer.campaignName}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {campaignOffer.configured
                ? "Os itens do anúncio foram pré-carregados. Procedimentos e sessões excedentes serão classificados como adicionais."
                : "A oferta desta campanha ainda não possui procedimentos configurados; os itens ficarão sem classificação comercial."}
            </div>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="grid gap-3">
          {items.map((item, index) => {
            const subtotal = saleItemSubtotal(item);
            const discount = saleItemDiscount(item);
            const discountPercent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
            const courtesy = item.itemType === "courtesy";
            const classification = classificationFor(item, item.sessions);
            const classificationInfo = CLASSIFICATION_LABELS[classification.classification || "direct"];
            const itemId = `${editorId}-${index}`;

            return (
              <div key={`${item.serviceCatalogId}-${index}`} className="rounded-xl border border-border bg-background/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-foreground">{item.procedureName}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classificationInfo.className}`}>
                        {classificationInfo.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Tabela: {formatCurrency(item.unitPrice)} por sessão
                      {classification.campaignIncludedSessions
                        ? ` · ${classification.campaignIncludedSessions} incluída(s) no anúncio`
                        : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                    aria-label={`Remover ${item.procedureName}`}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${itemId}-sessions`}>Sessões</Label>
                    <Input
                      id={`${itemId}-sessions`}
                      type="number"
                      min={1}
                      max={999}
                      value={item.sessions}
                      disabled={disabled}
                      onChange={(event) => {
                        const nextSessions = Math.max(1, Math.min(999, Number(event.target.value) || 1));
                        updateItem(index, (current) => {
                          const currentSubtotal = saleItemSubtotal(current);
                          const keptFullPrice = current.itemType !== "courtesy" && Math.abs(current.paidAmount - currentSubtotal) < 0.01;
                          return {
                            ...current,
                            sessions: nextSessions,
                            paidAmount: keptFullPrice ? roundMoney(current.unitPrice * nextSessions) : current.paidAmount,
                            ...classificationFor(current, nextSessions),
                          };
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${itemId}-paid`}>Valor pago</Label>
                    <MoneyInput
                      id={`${itemId}-paid`}
                      value={courtesy ? 0 : item.paidAmount}
                      disabled={disabled || courtesy}
                      onChange={(paidAmount) => updateItem(index, (current) => ({ ...current, paidAmount }))}
                    />
                  </div>
                </div>

                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                  <Checkbox
                    checked={courtesy}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      updateItem(index, (current) => ({
                        ...current,
                        itemType: checked ? "courtesy" : "paid",
                        paidAmount: checked ? 0 : saleItemSubtotal(current),
                      }));
                    }}
                  />
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">Cortesia</span>
                  <span className="ml-auto text-xs text-muted-foreground">Valor pago zerado</span>
                </label>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg bg-muted/30 px-2.5 py-2">
                    <div className="text-muted-foreground">Subtotal</div>
                    <div className="mt-0.5 font-semibold text-foreground">{formatCurrency(subtotal)}</div>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 px-2.5 py-2">
                    <div className="text-amber-300/80">Desconto</div>
                    <div className="mt-0.5 font-semibold text-amber-300">{formatCurrency(discount)}</div>
                  </div>
                  <div className="col-span-2 rounded-lg bg-primary/10 px-2.5 py-2 sm:col-span-1">
                    <div className="text-primary/80">Desconto %</div>
                    <div className="mt-0.5 font-semibold text-primary">{discountPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ProcedureSelector
            services={services}
            value={draft}
            onChange={(name, _price, service) => {
              setDraft(name);
              if (service) addService(service);
            }}
            placeholder="Buscar procedimento cadastrado"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !services.some((service) => service.name === draft)}
          onClick={() => {
            const service = services.find((candidate) => candidate.name === draft);
            if (service) addService(service);
          }}
          className="h-[42px] w-full shrink-0 gap-1.5 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/70">Valor total do fechamento</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Soma dos valores pagos</div>
        </div>
        <div className="text-lg font-bold text-emerald-300">{formatCurrency(total)}</div>
      </div>
    </div>
  );
}
