"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Ban, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type InboxChatAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  count?: number;
};

function ChatMenuAction({ action }: { action: InboxChatAction }) {
  const Icon = action.icon;
  return (
    <DropdownMenuItem
      className="min-h-11 gap-3 px-3 py-2"
      variant={action.destructive ? "destructive" : "default"}
      disabled={action.disabled}
      onClick={action.onClick}
      render={action.href ? <a href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noreferrer" : undefined} /> : undefined}
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">{action.label}</span>
      {!!action.count && <span className="text-xs text-muted-foreground">{action.count > 99 ? "99+" : action.count}</span>}
    </DropdownMenuItem>
  );
}

export function InboxChatHeader({
  name, phone, avatar, secondary, blocked, readOnly, closed, scheduled,
  canSchedule, scheduleDisabled, onSchedule, onBack, onProfile,
  menuOpen, onMenuOpenChange, menuTriggerRef, actions, moreActions,
}: {
  name: string;
  phone: string;
  avatar: ReactNode;
  secondary: boolean;
  blocked: boolean;
  readOnly: boolean;
  closed: boolean;
  scheduled: boolean;
  canSchedule: boolean;
  scheduleDisabled: boolean;
  onSchedule: () => void;
  onBack: () => void;
  onProfile: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  menuTriggerRef: RefObject<HTMLButtonElement | null>;
  actions: InboxChatAction[];
  moreActions: InboxChatAction[];
}) {
  const [showMore, setShowMore] = useState(false);
  const backItemRef = useRef<HTMLDivElement>(null);
  const moreItemRef = useRef<HTMLDivElement>(null);
  const switchedSectionRef = useRef(false);
  const actionSelectedRef = useRef(false);
  const subtitle = secondary ? "Conta secundária" : /^[+\d\s().-]+$/.test(name) ? "" : phone;

  useLayoutEffect(() => {
    if (!switchedSectionRef.current || !menuOpen) return;
    switchedSectionRef.current = false;
    (showMore ? backItemRef : moreItemRef).current?.focus();
  }, [showMore, menuOpen]);

  const changeSection = (more: boolean) => {
    switchedSectionRef.current = true;
    setShowMore(more);
  };
  const changeOpen = (open: boolean) => {
    if (open) {
      actionSelectedRef.current = false;
      setShowMore(false);
    }
    onMenuOpenChange(open);
  };
  const menuAction = (action: InboxChatAction) => (
    <ChatMenuAction key={action.id} action={{
      ...action,
      onClick: () => {
        actionSelectedRef.current = true;
        action.onClick?.();
      },
    }} />
  );

  return (
    <div className="inbox-thread-header z-10 flex h-[68px] shrink-0 items-center gap-1 border-b border-border/70 bg-card/95 px-3 sm:h-16 sm:gap-3 sm:px-5">
      <button type="button" onClick={onBack} aria-label="Voltar para a lista de conversas" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onProfile}
        aria-label={[
          `Perfil de ${name}`,
          secondary && "Conta secundária",
          blocked && "Contato bloqueado",
          readOnly && "Somente consulta",
          closed && "Conversa finalizada",
          scheduled && "Avaliação agendada, contador de espera suspenso",
        ].filter(Boolean).join(". ")}
        title={`${name}${name !== phone ? ` · ${phone}` : ""} — Perfil & Funil`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left hover:bg-muted/40 sm:gap-3"
      >
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground sm:text-[15px]">{name}</span>
            {blocked && <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Contato bloqueado" />}
            {readOnly && <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Somente consulta" />}
            {closed && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Conversa finalizada" />}
            {scheduled && <CalendarDays className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Avaliação agendada. Contador de espera suspenso." />}
          </span>
          {subtitle && <span className={`truncate text-[11px] sm:text-xs ${secondary ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground"}`}>{subtitle}</span>}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {canSchedule && (
          <button type="button" onClick={onSchedule} disabled={scheduleDisabled} title="Agendar avaliação deste contato" className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:gap-2 sm:px-4 sm:text-sm">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Agendar
          </button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={changeOpen}>
          <DropdownMenuTrigger
            ref={menuTriggerRef}
            aria-label="Ferramentas da conversa"
            title="Ferramentas da conversa"
            className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg text-muted-foreground hover:bg-muted data-popup-open:bg-muted data-popup-open:text-foreground lg:w-auto lg:border lg:border-border lg:px-3"
          >
            <MoreHorizontal className="h-5 w-5 lg:hidden" aria-hidden="true" />
            <span className="hidden text-sm lg:inline">Ferramentas</span>
            <ChevronDown className="hidden h-4 w-4 lg:block" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-64 max-w-[calc(100vw-2rem)]"
            aria-label={showMore ? "Mais ações da conversa" : "Ferramentas da conversa"}
            // A janela acionada assume o foco. Escape/clique fora retorna ao botão.
            finalFocus={() => actionSelectedRef.current ? false : menuTriggerRef.current}
          >
            {showMore ? (
              <>
                <DropdownMenuItem ref={backItemRef} closeOnClick={false} onClick={() => changeSection(false)} className="min-h-11 gap-3 px-3 py-2 font-medium">
                  <ChevronLeft className="h-4 w-4" /> Voltar às ferramentas
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {readOnly && <p className="px-3 py-2 text-xs text-muted-foreground">Somente consulta. O bloqueio do contato continua disponível.</p>}
                {moreActions.map(menuAction)}
              </>
            ) : (
              <>
                {actions.map(menuAction)}
                <DropdownMenuSeparator />
                <DropdownMenuItem ref={moreItemRef} closeOnClick={false} onClick={() => changeSection(true)} className="min-h-11 gap-3 px-3 py-2">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  Mais ações <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
