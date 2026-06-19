"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Smartphone, LogOut } from "lucide-react";

export default function WhatsAppSettingsPage() {
  const [status, setStatus] = useState<string>("loading");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      
      setStatus(data.status || "disconnected");
      if (data.status === "connected") {
        setProfile({
          name: data.profileName,
          phone: data.phone,
          pic: data.profilePicUrl,
        });
      } else if (data.status === "connecting" && data.qrcode) {
        setQrCode(data.qrcode);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Polling a cada 5 segundos
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Erro ao conectar");

      setStatus(data.status);
      if (data.qrcode) {
        setQrCode(data.qrcode);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/whatsapp/status", { method: "DELETE" });
      setStatus("disconnected");
      setQrCode(null);
      setProfile(null);
      toast.success("WhatsApp desconectado com sucesso");
    } catch (error) {
      toast.error("Erro ao desconectar");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WhatsApp (Uazapi)</h1>
        <p className="text-muted-foreground">
          Gerencie a conexão do número de atendimento da clínica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status da Conexão</CardTitle>
          <CardDescription>
            Conecte um aparelho celular com WhatsApp Business para enviar e receber mensagens pela Virtuosa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verificando status...</p>
            </div>
          )}

          {status === "disconnected" && (
            <div className="flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Aparelho Desconectado</h3>
                <p className="text-sm text-muted-foreground">Clique abaixo para gerar um QR Code.</p>
              </div>
              <Button onClick={handleConnect} disabled={isLoading} className="bg-[#25D366] hover:bg-[#1DA851] text-white">
                {isLoading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
                Gerar QR Code
              </Button>
            </div>
          )}

          {status === "connecting" && qrCode && (
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 bg-white rounded-xl shadow-sm border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Escaneie o QR Code</h3>
                <p className="text-sm text-muted-foreground">Abra o WhatsApp no celular, vá em Aparelhos Conectados e aponte a câmera para a tela.</p>
              </div>
              <Button variant="outline" onClick={handleDisconnect} disabled={isLoading}>
                Cancelar Conexão
              </Button>
            </div>
          )}

          {status === "connected" && profile && (
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                {profile.pic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.pic} alt="Profile" className="w-24 h-24 rounded-full border-4 border-[#25D366] object-cover" />
                ) : (
                  <div className="w-24 h-24 bg-muted rounded-full border-4 border-[#25D366] flex items-center justify-center">
                    <Smartphone className="w-10 h-10 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#25D366] rounded-full border-2 border-background" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-xl">{profile.name}</h3>
                <p className="text-sm text-muted-foreground">{profile.phone}</p>
                <div className="inline-flex items-center gap-2 px-3 py-1 mt-2 rounded-full bg-green-100 text-green-700 text-xs font-medium dark:bg-green-900/30 dark:text-green-400">
                  <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  Conectado e Operante
                </div>
              </div>
              <Button variant="destructive" onClick={handleDisconnect} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <LogOut className="mr-2 w-4 h-4" />}
                Desconectar Aparelho
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
