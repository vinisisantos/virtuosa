"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/toast";
import { Loader2, Smartphone, LogOut, ArrowLeft, RefreshCw, Wifi, WifiOff, Users, ExternalLink } from "lucide-react";
import Link from "next/link";

// ─── Tipos para instâncias de colaboradores ─────────────────
interface CollaboratorInstance {
  userId: string;
  userName: string;
  unit: string;
  status: string;
  phone?: string | null;
}

export default function WhatsAppSettingsPage() {
  const [status, setStatus] = useState<string>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Admin: dados do usuário e instâncias dos colaboradores
  const [isAdmin, setIsAdmin] = useState(false);
  const [instances, setInstances] = useState<CollaboratorInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [unitFilter, setUnitFilter] = useState<string>("Todas");

  // Buscar info do usuário logado
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role === "ADMINISTRADOR") {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  // Buscar instâncias dos colaboradores (apenas admin)
  const fetchInstances = useCallback(async () => {
    if (!isAdmin) return;
    setInstancesLoading(true);
    try {
      const res = await fetch("/api/whatsapp/admin/instances");
      const data = await res.json();
      if (data.instances) {
        setInstances(data.instances);
      }
    } catch (error) {
      console.error("Erro ao buscar instâncias:", error);
    } finally {
      setInstancesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) fetchInstances();
  }, [isAdmin, fetchInstances]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();

      const newStatus = data.status || "disconnected";
      setStatus(newStatus);

      if (newStatus === "connected") {
        setProfile({
          name: data.profileName,
          phone: data.phone,
          pic: data.profilePicUrl,
        });
        setQrCode(null);
      } else if (newStatus === "connecting" && data.qrcode) {
        setQrCode(data.qrcode);
        setProfile(null);
      } else {
        setProfile(null);
        setQrCode(null);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao conectar");

      setStatus(data.status);
      if (data.qrcode) setQrCode(data.qrcode);
      toast("QR Code gerado! Escaneie com o WhatsApp.", "success");
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Tem certeza que deseja desconectar o WhatsApp?")) return;

    setIsDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/status", { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha ao desconectar");
      }
      // Atualizar status imediatamente
      setStatus("disconnected");
      setQrCode(null);
      setProfile(null);
      toast("WhatsApp desconectado com sucesso", "success");
      // Atualizar do servidor após um momento
      setTimeout(fetchStatus, 1500);
    } catch (error: any) {
      toast(`Erro ao desconectar: ${error.message}`, "error");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const statusColor =
    status === "connected"
      ? "text-green-500"
      : status === "connecting"
      ? "text-yellow-500"
      : "text-muted-foreground";

  const statusLabel =
    status === "connected"
      ? "Conectado e Operante"
      : status === "connecting"
      ? "Conectando..."
      : status === "loading"
      ? "Verificando..."
      : "Desconectado";

  // Filtrar instâncias por unidade
  const filteredInstances =
    unitFilter === "Todas"
      ? instances
      : instances.filter((i) => i.unit === unitFilter);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/60 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/crm"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao CRM
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">Configurações do WhatsApp</span>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp (Evolution API)</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie a conexão do seu WhatsApp pessoal.
            </p>
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border rounded-lg px-3 py-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>

        {/* Status Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 border-b">
            <h3 className="font-semibold leading-none tracking-tight">Status da Conexão</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Conecte um aparelho celular com WhatsApp Business para enviar e receber mensagens.
            </p>
          </div>

          <div className="p-8 flex flex-col items-center justify-center gap-6">

            {/* Loading */}
            {status === "loading" && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Verificando status da conexão...</p>
              </div>
            )}

            {/* Disconnected */}
            {status === "disconnected" && (
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                  <WifiOff className="w-10 h-10 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Aparelho Desconectado</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clique abaixo para gerar um QR Code e conectar seu WhatsApp.
                  </p>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold bg-[#25D366] hover:bg-[#1DA851] text-white transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  Gerar QR Code
                </button>
              </div>
            )}

            {/* Connecting — show QR */}
            {status === "connecting" && (
              <div className="flex flex-col items-center gap-6">
                {qrCode ? (
                  <>
                    <div className="p-4 bg-white rounded-xl shadow-sm border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">Escaneie o QR Code</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Abra o WhatsApp → Aparelhos Conectados → Conectar um aparelho
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                    <p className="text-sm text-muted-foreground">Aguardando QR Code...</p>
                  </div>
                )}
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm border hover:bg-muted transition-colors"
                >
                  Cancelar Conexão
                </button>
              </div>
            )}

            {/* Connected */}
            {status === "connected" && profile && (
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  {profile.pic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.pic}
                      alt="Profile"
                      className="w-24 h-24 rounded-full border-4 border-[#25D366] object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-muted rounded-full border-4 border-[#25D366] flex items-center justify-center">
                      <Smartphone className="w-10 h-10 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#25D366] rounded-full border-2 border-background" />
                </div>

                <div className="text-center">
                  <h3 className="font-semibold text-xl">{profile.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{profile.phone}</p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 mt-3 rounded-full bg-green-100 text-green-700 text-xs font-semibold dark:bg-green-900/30 dark:text-green-400">
                    <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                    Conectado e Operante
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  <Link
                    href="/crm/inbox"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Wifi className="w-4 h-4" />
                    Abrir Inbox do CRM
                  </Link>

                  <button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    {isDisconnecting ? "Desconectando..." : "Desconectar Aparelho"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-xl border bg-card/60 p-6 space-y-3">
          <h3 className="font-semibold text-sm">Como conectar</h3>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Clique em &quot;Gerar QR Code&quot;</li>
            <li>Abra o WhatsApp no seu celular</li>
            <li>Acesse <strong>Configurações → Aparelhos Conectados → Conectar um aparelho</strong></li>
            <li>Aponte a câmera para o QR Code na tela</li>
            <li>Aguarde a conexão ser confirmada</li>
          </ol>
          <p className="text-xs text-muted-foreground border-t pt-3 mt-3">
            💡 Conectado via Evolution API. Caso a sessão desconecte,
            clique em &quot;Gerar QR Code&quot; novamente para reconectar.
          </p>
        </div>

        {/* ─── Seção Admin: Instâncias dos Colaboradores ─── */}
        {isAdmin && (
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold leading-none tracking-tight">Instâncias dos Colaboradores</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Visualize o status de conexão de todos os colaboradores.
                  </p>
                </div>
              </div>
            </div>

            {/* Filtro por unidade */}
            <div className="px-6 pt-4 flex items-center gap-2">
              {["Todas", "Osasco", "SCS", "SBC"].map((unit) => (
                <button
                  key={unit}
                  onClick={() => setUnitFilter(unit)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    unitFilter === unit
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {unit}
                </button>
              ))}
              <button
                onClick={fetchInstances}
                className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${instancesLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>

            {/* Lista de instâncias */}
            <div className="p-6">
              {instancesLoading && instances.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredInstances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma instância encontrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredInstances.map((inst) => (
                    <div
                      key={inst.userId}
                      className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
                    >
                      {/* Avatar */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                        {inst.userName?.charAt(0)?.toUpperCase() || "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inst.userName}</p>
                        <p className="text-xs text-muted-foreground">{inst.unit}</p>
                      </div>

                      {/* Telefone */}
                      {inst.phone && (
                        <span className="text-xs text-muted-foreground font-mono hidden sm:block">
                          {inst.phone}
                        </span>
                      )}

                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium flex-shrink-0 ${
                          inst.status === "connected"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : inst.status === "connecting"
                            ? "bg-yellow-500/10 text-yellow-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          inst.status === "connected"
                            ? "bg-emerald-500"
                            : inst.status === "connecting"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`} />
                        {inst.status === "connected"
                          ? "Conectado"
                          : inst.status === "connecting"
                          ? "Conectando"
                          : "Desconectado"}
                      </span>

                      {/* Ação: Ver Inbox */}
                      <Link
                        href={`/crm/inbox?targetUserId=${inst.userId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors flex-shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver Inbox
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
