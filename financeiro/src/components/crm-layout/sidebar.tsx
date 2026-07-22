"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  User,
  Users,
  X,
  Zap,
  ArrowLeft,
  CalendarDays,
  Star,
  BarChart3,
  Send,
  Bot,
  TrendingUp,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVisiblePolling } from "@/hooks/use-visible-polling";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Atendimento",
    items: [
      { href: "/crm", label: "Dashboard", icon: LayoutDashboard },
      { href: "/crm/inbox", label: "Inbox", icon: MessageSquare },
      { href: "/crm/ouvidoria", label: "Avaliações", icon: CalendarDays },
    ],
  },
  {
    title: "Clientes & Vendas",
    items: [
      { href: "/crm/contacts", label: "Contatos", icon: Users },
      { href: "/crm/pipeline", label: "Pipeline", icon: GitBranch },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/crm/campanhas", label: "Campanhas", icon: Radio },
      { href: "/crm/campanhas/broadcast", label: "Broadcasts", icon: Send },
    ],
  },
  {
    title: "Automação",
    items: [
      { href: "/crm/automations", label: "Automações", icon: Bot },
    ],
  },
  {
    title: "Análise",
    items: [
      { href: "/crm/estatistica", label: "Estatística", icon: BarChart3 },
      { href: "/crm/ai-insights", label: "Análise IA", icon: Bot },
      { href: "/crm/ai-shadow", label: "Treinamento IA", icon: Zap },
      { href: "/crm/avaliacoes", label: "Avaliações de Atendimento", icon: Star },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface UnreadConversationSummary {
  id: string;
  unreadCount: number;
}

function createAudioContext() {
  const AudioContextConstructor =
    window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

function SidebarNavLink({
  item,
  active,
  unreadCount = 0,
}: {
  item: NavItem;
  active: boolean;
  unreadCount?: number;
}) {
  const showUnread = item.href === "/crm/inbox" && unreadCount > 0 && !active;
  const label = item.beta ? `${item.label} (Beta)` : item.label;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={item.href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "lg:mx-auto lg:h-11 lg:w-11 lg:justify-center lg:rounded-xl lg:px-0 lg:py-0",
              active
                ? "bg-primary/12 text-primary ring-1 ring-primary/15"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          />
        }
      >
        <item.icon className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
        <span className="flex-1 lg:hidden">{item.label}</span>
        {item.beta && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 lg:hidden">
            Beta
          </span>
        )}
        {showUnread && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground lg:absolute lg:-right-0.5 lg:-top-0.5 lg:h-4 lg:min-w-4 lg:px-1 lg:text-[9px]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="hidden font-semibold lg:flex">
        {label}
        {item.href === "/crm/inbox" && unreadCount > 0 && (
          <span className="text-background/65">· {unreadCount} não lidas</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [userName, setUserName] = useState("Usuário");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const raw = localStorage.getItem("virtuosa_user");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.name) setUserName(user.name);
        if (user.email) setUserEmail(user.email);
        if (user.role) setUserRole(user.role);
        if (user.permissions) setUserPermissions(user.permissions);
      } catch {}
    }
  }, []);

  const [totalUnread, setTotalUnread] = useState(0);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const unreadInFlightRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = createAudioContext();
      }
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume();
      }
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = createAudioContext();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const doPlay = () => {
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1); gain1.connect(ctx.destination);
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.4, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.25);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
        gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc2.start(ctx.currentTime + 0.3); osc2.stop(ctx.currentTime + 0.55);
      };
      if (ctx.state === "suspended") ctx.resume().then(doPlay);
      else doPlay();
    } catch {}
  }, []);




  // Polling de conversas não lidas — badge + som + notificação do sistema
  const fetchUnread = useCallback(async () => {
    if (unreadInFlightRef.current) return;
    if (document.visibilityState === "hidden") return;
    unreadInFlightRef.current = true;
    try {
      const res = await fetch("/api/whatsapp/conversations?summary=unread");
      const data = await res.json();
      if (data.conversations) {
        const convs = data.conversations as UnreadConversationSummary[];
        const newConvs: UnreadConversationSummary[] = [];

        convs.forEach((conv) => {
          const prev = prevUnreadRef.current[conv.id];
          if (prev === undefined) {
            if (conv.unreadCount > 0) newConvs.push(conv);
          } else if (conv.unreadCount > prev) {
            newConvs.push(conv);
          }
          prevUnreadRef.current[conv.id] = conv.unreadCount;
        });

        if (newConvs.length > 0) {
          // Tocar som da plataforma
          playNotificationSound();
        }

        const count = typeof data.count === "number" ? data.count : convs.filter((c) => c.unreadCount > 0).length;
        setTotalUnread(count);
      }
    } catch {
    } finally {
      unreadInFlightRef.current = false;
    }
  }, [playNotificationSound]);

  const unreadPollingIntervalMs = pathname.startsWith("/crm/inbox") ? 30000 : 15000;
  useVisiblePolling(fetchUnread, unreadPollingIntervalMs);

  useEffect(() => {
    onClose?.();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const signOut = () => {
    localStorage.removeItem("virtuosa_user");
    window.location.href = "/login.html";
  };

  const configurationItems: NavItem[] = [
    ...(userRole === "ADMINISTRADOR"
      ? [
          { href: "/crm/whatsapp-admin", label: "WhatsApp Admin", icon: Shield },
          { href: "/crm/team-performance", label: "Performance da equipe", icon: TrendingUp },
        ]
      : []),
    { href: "/configuracoes/whatsapp", label: "Configurações do WhatsApp", icon: Settings },
    { href: "/dashboard", label: "Voltar ao Sistema", icon: ArrowLeft },
  ];

  return (
    <TooltipProvider delay={250}>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "crm-sidebar absolute inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-[72px] lg:translate-x-0 lg:transition-[width]",
        )}
        aria-label="Primary"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4 lg:justify-center lg:px-0">
          <Link href="/crm" className="flex items-center gap-2" aria-label="Virtuosa CRM">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20 lg:h-9 lg:w-9 lg:rounded-xl">
              <MessageSquare className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
            </div>
            <span className="text-sm font-semibold text-foreground lg:hidden">
              Virtuosa CRM
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 lg:px-2 lg:py-2">
          {navSections.map((section, sectionIdx) => {
            const items = section.items.filter((item) => {
              if (item.href === "/crm/automations") return userRole === "ADMINISTRADOR";
              if (item.href === "/crm/ai-insights") return userRole === "ADMINISTRADOR" || userPermissions.crmSilentAnalysis === true;
              if (item.href === "/crm/ai-shadow") return userRole === "ADMINISTRADOR" || userPermissions.crmSilentAnalysis === true;
              return true;
            });
            if (items.length === 0) return null;

            return (
            <div key={section.title}>
              {sectionIdx > 0 && (
                <div className="my-2 border-t border-border" />
              )}
              <p className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground lg:sr-only">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const isActive = item.href === "/crm" ? pathname === "/crm" : pathname.startsWith(item.href);
                  const showUnreadDot = item.href === "/crm/inbox" && totalUnread > 0 && !isActive;

                  return (
                    <li key={item.href}>
                      <SidebarNavLink item={item} active={isActive} unreadCount={showUnreadDot ? totalUnread : 0} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )})}

          <div className="my-2 border-t border-border" />

          <p className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground lg:sr-only">
            Configuração
          </p>
          <ul className="flex flex-col gap-0.5">
            {configurationItems.map((item) => {
              const isActive = item.href === "/dashboard"
                ? false
                : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <SidebarNavLink item={item} active={isActive} />
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-border p-3 lg:p-2">
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Menu de ${userName}`} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60 lg:h-11 lg:justify-center lg:rounded-xl lg:px-0 lg:py-0">
              <Avatar className="size-8 shrink-0 lg:size-9">
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 lg:hidden">
                <p className="truncate text-sm font-medium text-foreground">
                  {userName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/perfil"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
