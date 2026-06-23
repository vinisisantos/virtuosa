"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Settings as SettingsIcon, User } from "lucide-react";
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
import { ModeToggle } from "./mode-toggle";

const pageTitles: Record<string, string> = {
  "/crm": "Dashboard",
  "/crm/inbox": "WhatsApp Inbox",
  "/crm/contacts": "Contatos",
  "/crm/pipeline": "Pipeline",
  "/crm/campanhas": "Campanhas",
  "/crm/campanhas/broadcast": "Broadcasts",
  "/crm/campanhas/gerenciar": "Gerenciar Campanhas",
  "/crm/automations": "Automações",
  "/crm/flows": "Flows",
  "/crm/estatistica": "Estatística",
  "/crm/avaliacoes": "Avaliações",
  "/crm/leads": "Leads",
  "/crm/whatsapp-admin": "WhatsApp Admin",
  "/ouvidoria": "Ouvidoria / SAC",
  "/configuracoes/whatsapp": "WhatsApp Settings",
  "/perfil": "Perfil",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "Virtuosa CRM";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  
  const [userName, setUserName] = useState("Usuário");
  const [userEmail, setUserEmail] = useState("");
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [currentUnit, setCurrentUnit] = useState<string>("");

  useEffect(() => {
    const raw = localStorage.getItem("virtuosa_user");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.name) setUserName(user.name);
        if (user.email) setUserEmail(user.email);

        const units = [];
        const p = user.permissions || {};
        if (user.role === "ADMINISTRADOR" || p.admin || p.multiUnit) {
           units.push("Todas", "SCS", "SBC", "Osasco");
        } else {
           if (p.unitSCS) units.push("SCS");
           if (p.unitSBC) units.push("SBC");
           if (p.unitOsasco) units.push("Osasco");
        }
        
        if (units.length === 0 && user.unit && user.unit !== "Barueri") {
           units.push(user.unit);
        }
        
        const uniqueUnits = Array.from(new Set(units));
        setAvailableUnits(uniqueUnits);
        setCurrentUnit(user.unit || uniqueUnits[0] || "SCS");
      } catch (e) {}
    }
  }, []);

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [currentUserFilter, setCurrentUserFilter] = useState<string>("");

  useEffect(() => {
    if (currentUnit && currentUnit !== "Todas") {
      fetch(`/api/users?unit=${currentUnit}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setAvailableUsers(data);
          else setAvailableUsers([]);
        })
        .catch(() => setAvailableUsers([]));
    } else {
      setAvailableUsers([]);
    }

    const savedUserFilter = localStorage.getItem("virtuosa_user_filter") || "";
    setCurrentUserFilter(savedUserFilter);
  }, [currentUnit]);

  const handleUnitChange = (u: string) => {
     setCurrentUnit(u);
     setCurrentUserFilter("");
     localStorage.removeItem("virtuosa_user_filter");
     const raw = localStorage.getItem("virtuosa_user");
     if (raw) {
        try {
          const user = JSON.parse(raw);
          user.unit = u;
          localStorage.setItem("virtuosa_user", JSON.stringify(user));
          window.location.reload();
        } catch (e) {}
     }
  };

  const handleUserFilterChange = (userId: string) => {
    setCurrentUserFilter(userId);
    if (userId) {
      localStorage.setItem("virtuosa_user_filter", userId);
    } else {
      localStorage.removeItem("virtuosa_user_filter");
    }
    window.dispatchEvent(new Event("userFilterChanged"));
  };

  const initial = userName
    ? userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'U';

  const signOut = () => {
    localStorage.removeItem("virtuosa_user");
    window.location.href = "/login.html";
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {availableUnits.length > 1 && (
          <select
            value={currentUnit}
            onChange={(e) => handleUnitChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm cursor-pointer"
          >
            {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}

        {availableUsers.length > 0 && (
          <select
            value={currentUserFilter}
            onChange={(e) => handleUserFilterChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm cursor-pointer"
          >
            <option value="">Todos os usuários</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
        <ModeToggle />

        <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70 sm:gap-3 sm:pl-1 sm:pr-3"
          aria-label="Open account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {userName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-56 bg-popover text-popover-foreground ring-border"
        >
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-foreground">
              {userName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            render={
              <Link
                href="/perfil"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <User className="size-4" />
            Perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href="/configuracoes/whatsapp"
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              />
            }
          >
            <SettingsIcon className="size-4" />
            Configurações
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
    </header>
  );
}
