"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Send, User, Check, CheckCheck, Loader2, MessageSquare, Paperclip, FileText, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import AuthGuard from "@/components/auth-guard";

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File, base64: string, type: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          file,
          base64: reader.result as string,
          type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document"
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Busca conversas
  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/whatsapp/conversations");
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Busca mensagens de uma conversa
  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/messages?conversationId=${convId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedConv) {
        fetchMessages(selectedConv.id);
      }
    }, 5000); 
    return () => clearInterval(interval);
  }, [selectedConv]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
    }
  }, [selectedConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || !selectedConv) return;

    setIsSending(true);
    const tempMsg = newMessage;
    const tempAttach = attachment;
    
    setNewMessage("");
    setAttachment(null);

    setMessages((prev) => [
      ...prev,
      { 
        id: "temp_" + Date.now(), 
        body: tempMsg, 
        type: tempAttach ? tempAttach.type : "text",
        mediaUrl: tempAttach?.base64,
        fromMe: true, 
        status: "sent", 
        timestamp: new Date() 
      },
    ]);

    try {
      const payload: any = {
        instance: "virtuosa-main",
        contactId: selectedConv.contact.phone,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
      };

      if (tempAttach) {
        payload.file = tempAttach.base64;
        payload.docName = tempAttach.file.name;
      }

      await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fetchMessages(selectedConv.id);
      fetchConversations();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "";
    }
  };

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-background">
        <AppHeader />
        
        <div className="flex flex-1 overflow-hidden border-t border-border">
          {/* Sidebar de Conversas */}
          <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-muted/10">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold mb-4">Inbox (WhatsApp)</h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input placeholder="Buscar conversas..." className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-9 bg-background" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConv(conv)}
                  className={`p-4 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedConv?.id === conv.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {conv.contact.profilePic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={conv.contact.profilePic} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <h3 className="font-medium truncate">{conv.contact.name || conv.contact.phone}</h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground truncate">{conv.lastMessage || "Nova conversa"}</p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 bg-[#25D366] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {conversations.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                  Nenhuma conversa encontrada.
                </div>
              )}
            </div>
          </div>

          {/* Área de Chat */}
          <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
            {selectedConv ? (
              <>
                {/* Chat Header */}
                <div className="h-16 px-4 flex items-center border-b border-border bg-background shadow-sm z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {selectedConv.contact.profilePic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={selectedConv.contact.profilePic} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <h2 className="font-semibold">{selectedConv.contact.name || selectedConv.contact.phone}</h2>
                      <p className="text-xs text-muted-foreground">{selectedConv.contact.phone}</p>
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={msg.id || idx}
                      className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`relative max-w-[70%] px-3 py-1.5 rounded-lg shadow-sm text-[15px] ${
                          msg.fromMe
                            ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                            : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                        }`}
                      >
                        {/* Render Mídia */}
                        {msg.type === "image" && msg.mediaUrl && (
                           // eslint-disable-next-line @next/next/no-img-element
                           <img src={msg.mediaUrl} alt="Imagem" className="max-w-[250px] max-h-[250px] rounded object-cover mb-1 cursor-pointer" onClick={() => window.open(msg.mediaUrl, "_blank")} />
                        )}
                        {(msg.type === "audio" || msg.type === "ptt" || msg.type === "myaudio") && msg.mediaUrl && (
                           <audio controls className="max-w-[250px] mb-1">
                             <source src={msg.mediaUrl} type="audio/mpeg" />
                           </audio>
                        )}
                        {msg.type === "document" && msg.mediaUrl && (
                           <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-black/5 dark:bg-white/10 p-2 rounded mb-1 hover:bg-black/10 transition-colors">
                             <FileText className="w-6 h-6 text-red-500" />
                             <span className="text-sm font-medium underline truncate max-w-[180px]">Baixar Documento</span>
                           </a>
                        )}

                        {msg.body && <div className="break-words leading-relaxed whitespace-pre-wrap">{msg.body}</div>}
                        
                        <div className="flex justify-end items-center gap-1 mt-1 -mb-1">
                          <span className="text-[11px] text-muted-foreground/80">
                            {formatTime(msg.timestamp)}
                          </span>
                          {msg.fromMe && (
                            <span className="text-muted-foreground/80">
                              {msg.status === "read" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                              ) : msg.status === "delivered" ? (
                                <CheckCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <div className="p-3 bg-background border-t border-border flex flex-col gap-2">
                  {attachment && (
                    <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg w-fit relative pr-10 border border-border">
                      {attachment.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachment.base64} alt="Preview" className="w-12 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-12 bg-background rounded flex items-center justify-center">
                          <FileText className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col justify-center max-w-[150px]">
                        <span className="text-sm font-medium truncate">{attachment.file.name}</span>
                        <span className="text-xs text-muted-foreground">{(attachment.file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button type="button" onClick={() => setAttachment(null)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-full text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" 
                    />
                    <input
                      className="flex-1 rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-muted/50 min-h-[44px]"
                      placeholder="Digite uma mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={isSending}
                    />
                    <button 
                      type="submit" 
                      disabled={(!newMessage.trim() && !attachment) || isSending}
                      className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 w-[44px] h-[44px] rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white"
                    >
                      {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                  <MessageSquare className="w-10 h-10 opacity-50" />
                </div>
                <h2 className="text-2xl font-medium mb-2">WhatsApp Inbox</h2>
                <p className="max-w-md text-center">
                  Selecione uma conversa na barra lateral para começar a enviar e receber mensagens.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
