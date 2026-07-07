"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PipelineStage } from "@prisma/client";
import { DealCard, Deal } from "./deal-card";
import { Button } from "@/components/ui/button";
import { Plus, Search, X } from "lucide-react";

import { formatCurrency } from "@/lib/currency";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}

function normalizeSearchText(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeSearchDigits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function dealMatchesColumnSearch(deal: Deal, search: string) {
  const textQuery = normalizeSearchText(search);
  const digitQuery = normalizeSearchDigits(search);
  if (!textQuery && !digitQuery) return true;

  const name = normalizeSearchText(deal.clientName);
  const phone = normalizeSearchDigits(deal.clientPhone);

  return (
    (!!textQuery && name.includes(textQuery)) ||
    (!!digitQuery && phone.includes(digitQuery))
  );
}

export function PipelineBoard({
  stages,
  deals,
  onDealMoved,
  onAddDeal,
  onEditDeal,
}: PipelineBoardProps) {
  const defaultCurrency = "BRL";
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [searchByStageId, setSearchByStageId] = useState<Record<string, string>>({});

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = deal.stageId ? map.get(deal.stageId) : undefined;
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    // Mouse: 5px movement starts drag — no conflict with scrolling on desktop.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch: requires a 250ms hold before drag activates, with 8px tolerance.
    // Quick flicks / vertical swipes pass through to the column scroll instead
    // of being interpreted as card moves.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* snap-x + snap-mandatory on mobile so swipes land the next
          stage cleanly at the viewport edge instead of mid-column.
          Disabled on lg+ where snapping would interfere with the
          natural layout. The board can still overflow horizontally on
          lg+ once a pipeline has many stages (columns keep a 260px
          min-width), so a thin scrollbar stays visible on desktop. */}
      <div className="pipeline-scroll flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const stageSearch = searchByStageId[stage.id] || "";
          const visibleDeals = stageSearch.trim()
            ? stageDeals.filter((deal) => dealMatchesColumnSearch(deal, stageSearch))
            : stageDeals;
          const totalValue = visibleDeals.reduce(
            (s, d) => s + Number(d.value || 0),
            0,
          );
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={visibleDeals}
              totalDeals={stageDeals.length}
              totalValue={totalValue}
              currency={defaultCurrency}
              searchValue={stageSearch}
              onSearchChange={(value) =>
                setSearchByStageId((current) => ({
                  ...current,
                  [stage.id]: value,
                }))
              }
              onAddDeal={onAddDeal}
              onEditDeal={onEditDeal}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stageId) ?? null
              }
              onEdit={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        /* On touch devices the peek/snap layout already signals there's
           more to swipe, so the scrollbar is hidden for a clean look.
           On desktop (mouse) the board can overflow with many stages
           and there is no peek hint, so keep a thin, themed scrollbar
           visible to make the overflow discoverable and usable. */
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  totalDeals,
  totalValue,
  currency,
  searchValue,
  onSearchChange,
  onAddDeal,
  onEditDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  totalDeals: number;
  totalValue: number;
  currency: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const hasSearch = searchValue.trim().length > 0;
  const countLabel = hasSearch ? `${deals.length}/${totalDeals}` : String(totalDeals);

  return (
    // On mobile each column is `w-[85vw]` (with a reasonable min/max)
    // so the next column's edge peeks in — a "there's more here" hint.
    // snap-start lands each column cleanly when swiping. On lg+ we
    // restore the flex-1 share-the-row behavior. The droppable ref is
    // on the inner messages region below — intentionally NOT here, so
    // a drag over the column header doesn't highlight the whole column.
    <div className="flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border-0 bg-muted/30 p-3 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none">
      <div className="flex flex-col gap-1 pt-1 pb-2 px-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="h-2.5 w-2.5 rounded-full shadow-sm" 
              style={{ backgroundColor: stage.color }} 
            />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {stage.name}
            </h3>
          </div>
          <span className="shrink-0 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {countLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-medium pl-4.5">
          {formatCurrency(totalValue, currency)}
        </p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar"
            className="h-9 w-full rounded-lg border border-border bg-background/70 pl-8 pr-8 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Limpar busca em ${stage.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all overflow-y-auto min-h-0 pr-1 ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-xs text-muted-foreground">
            {hasSearch && totalDeals > 0 ? "Nenhum resultado nesta coluna" : "Solte o negócio aqui"}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              onEdit={onEditDeal}
            />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddDeal(stage.id)}
        className="mt-2 w-full justify-start border-0 bg-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground shadow-none"
      >
        <Plus className="mr-2 h-4 w-4" />
        Novo Negócio
      </Button>
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  onEdit,
}: {
  deal: Deal;
  stage: PipelineStage;
  onEdit: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { type: "deal", deal },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0 : 1,
        // pan-y: allows the browser to scroll vertically on touch.
        // The TouchSensor delay (250ms) distinguishes a hold-to-drag
        // from a quick flick-to-scroll, so both gestures coexist cleanly.
        touchAction: "pan-y",
        userSelect: "none",
      }}
    >
      <DealCard deal={deal} stage={stage} onEdit={onEdit} />
    </div>
  );
}
