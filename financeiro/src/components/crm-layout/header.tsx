"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Settings as SettingsIcon, User, MapPin } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ModeToggle } from "./mode-toggle";
import { useGlobalUnit } from "@/contexts/UnitContext";

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
  "/crm/ai-insights": "Análise IA",
  "/crm/ai-shadow": "Treinamento IA",
  "/crm/avaliacoes": "Avaliações de Atendimento",
  "/crm/leads": "Leads",
  "/crm/whatsapp-admin": "WhatsApp Admin",
  "/crm/ouvidoria": "Avaliações",
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
  // Single source of truth for the selected unit (drives all CRM data pages).
  const { globalUnit, setGlobalUnit, units: availableUnits } = useGlobalUnit();

  useEffect(() => {
    const raw = localStorage.getItem("virtuosa_user");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        if (user.name) setUserName(user.name);
        if (user.email) setUserEmail(user.email);
      } catch (e) {}
    }
  }, []);



  // Switch unit via the shared context — no page reload, no user.unit mutation.
  const handleUnitChange = (u: string) => {
    setGlobalUnit(u);
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
          <Select
            value={globalUnit || "all"}
            onValueChange={(v) => handleUnitChange(v === "all" || !v ? "" : v)}
          >
            <SelectTrigger className="h-8 rounded-full border-transparent bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 px-3 text-xs font-medium focus:ring-1 focus:ring-purple-500 sm:text-sm transition-opacity">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                <span>{globalUnit || "Todas as Unidades"}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="min-w-[200px]">
              <div className="px-2 py-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                <MapPin className="size-3" />
                Selecionar Unidade
              </div>
              <DropdownMenuSeparator className="mb-1" />
              <SelectItem
                value="all"
                className={!globalUnit ? "bg-primary/15 text-primary font-semibold focus:bg-primary/20 focus:text-primary" : "text-muted-foreground focus:bg-muted focus:text-foreground"}
              >
                Todas as Unidades
              </SelectItem>
              {availableUnits.map((u) => {
                if (!u) return null;
                const isActive = u === globalUnit;
                return (
                  <SelectItem
                    key={u}
                    value={u}
                    className={isActive ? "bg-primary/15 text-primary font-semibold focus:bg-primary/20 focus:text-primary mt-1" : "text-muted-foreground focus:bg-muted focus:text-foreground mt-1"}
                  >
                    {u}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
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
