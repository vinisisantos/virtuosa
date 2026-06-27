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
  Workflow,
  X,
  Zap,
  ArrowLeft,
  Headphones,
  Star,
  BarChart3,
  Send,
  Bot,
  TrendingUp,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      { href: "/crm/ouvidoria", label: "Ouvidoria / SAC", icon: Headphones },
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
      { href: "/crm/avaliacoes", label: "Avaliações", icon: Star },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [userName, setUserName] = useState("Usuário");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("virtuosa_user");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.name) setUserName(user.name);
        if (user.email) setUserEmail(user.email);
        if (user.role) setUserRole(user.role);
      } catch (e) {}
    }
  }, []);

  const [totalUnread, setTotalUnread] = useState(0);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === "suspended") {
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
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
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
    try {
      const res = await fetch("/api/whatsapp/conversations");
      const data = await res.json();
      if (data.conversations) {
        const convs = data.conversations as any[];
        const newConvs: any[] = [];

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

        const count = convs.filter((c) => c.unreadCount > 0).length;
        setTotalUnread(count);
      }
    } catch {}
  }, [playNotificationSound]);

  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, 5000); // 5s — same as inbox polling
    return () => clearInterval(iv);
  }, [fetchUnread]);

  useEffect(() => {
    onClose?.();
  }, [pathname]);

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

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-60 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Link href="/crm" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">
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

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {navSections.map((section, sectionIdx) => (
            <div key={section.title}>
              {sectionIdx > 0 && (
                <div className="my-2 border-t border-border" />
              )}
              <p className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = item.href === "/crm" ? pathname === "/crm" : pathname.startsWith(item.href);
                  const showUnreadDot = item.href === "/crm/inbox" && totalUnread > 0 && !isActive;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.beta && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                            Beta
                          </span>
                        )}
                        {showUnreadDot && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {totalUnread > 99 ? "99+" : totalUnread}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="my-2 border-t border-border" />

          <p className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Configuração
          </p>
          <ul className="flex flex-col gap-0.5">
            {/* Item admin: WhatsApp Admin (apenas ADMINISTRADOR) */}
            {userRole === "ADMINISTRADOR" && (
              <>
                <li>
                  <Link
                    href="/crm/whatsapp-admin"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      pathname.startsWith("/crm/whatsapp-admin")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Shield className="h-4 w-4" />
                    WhatsApp Admin
                  </Link>
                </li>
                <li>
                  <Link
                    href="/crm/team-performance"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      pathname.startsWith("/crm/team-performance")
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Team Performance
                  </Link>
                </li>
              </>
            )}
            <li>
              <Link
                href="/configuracoes/whatsapp"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith("/configuracoes/whatsapp")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Settings className="h-4 w-4" />
                WhatsApp Settings
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Sistema
              </Link>
            </li>
          </ul>
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
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
    </>
  );
}
