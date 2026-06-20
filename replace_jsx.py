import re

with open('financeiro/src/app/crm/inbox/page.tsx', 'r') as f:
    content = f.read()

# We will find the part from `  return (` followed by `<div` to the end and replace it.
new_jsx = """  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden -m-4 sm:-m-6 bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left panel: Conversation list */}
        <div className={`flex h-full flex-col border-r border-border bg-card w-full lg:w-80 flex-shrink-0 ${selectedConv ? "hidden lg:flex" : "flex"}`}>
          
          {/* Search + Filter */}
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar conversas..."
                className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9"
              />
            </div>
            <button className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
              Todos <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Conversation Items */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.filter(c => {
              if (!search) return true;
              const q = search.toLowerCase();
              const name = c.contact?.name?.toLowerCase() || "";
              const phone = c.contact?.phone?.toLowerCase() || "";
              return name.includes(q) || phone.includes(q);
            }).length === 0 ? (
              <div className="px-4 py-12 text-center flex flex-col items-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {conversations.filter(c => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  const name = c.contact?.name?.toLowerCase() || "";
                  const phone = c.contact?.phone?.toLowerCase() || "";
                  return name.includes(q) || phone.includes(q);
                }).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
                      selectedConv?.id === conv.id ? "border-l-2 border-primary bg-muted/70" : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground overflow-hidden">
                      {conv.contact?.profilePic ? (
                        <img src={conv.contact.profilePic} alt="" className="h-10 w-10 object-cover" />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {conv.contact.name || conv.contact.phone}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {conv.lastMessage || "Nova conversa"}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {conv.unreadCount > 0 && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center panel: Message thread */}
        <div className={`flex h-full min-w-0 flex-1 flex-col bg-background relative ${selectedConv ? "flex" : "hidden lg:flex"}`}>
          {selectedConv ? (
            <>
              {/* Thread Header */}
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 shadow-sm z-10">
                <div className="flex items-center gap-3 min-w-0 cursor-pointer">
                  <button 
                    onClick={() => setSelectedConv(null)} 
                    className="lg:hidden p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-full"
                  >
                    <ChevronDown className="h-5 w-5 rotate-90" />
                  </button>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground overflow-hidden">
                    {selectedConv.contact.profilePic ? (
                      <img src={selectedConv.contact.profilePic} alt="" className="h-9 w-9 object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {selectedConv.contact.name || selectedConv.contact.phone}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {selectedConv.contact.phone}
                    </span>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <div key={msg.id || idx} className={`flex w-full ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                    <div className={`relative max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] shadow-sm ${
                      msg.fromMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                    }`}>
                      {/* Render Media */}
                      {msg.type === "image" && msg.mediaUrl && (
                        <img src={msg.mediaUrl} alt="" className="max-w-full rounded-md mb-2 cursor-pointer object-cover max-h-[300px]" onClick={() => window.open(msg.mediaUrl, "_blank")} />
                      )}
                      {(msg.type === "audio" || msg.type === "ptt" || msg.type === "myaudio") && msg.mediaUrl && (
                         <audio controls className="max-w-[250px] mb-1 h-10">
                           <source src={msg.mediaUrl} type="audio/mpeg" />
                         </audio>
                      )}
                      {msg.type === "document" && msg.mediaUrl && (
                         <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/10 p-2.5 rounded-md mb-1 hover:bg-black/20 transition-colors group">
                           <div className="w-8 h-8 rounded bg-background/50 flex items-center justify-center flex-shrink-0 group-hover:bg-background/80 transition-colors">
                             <FileText className="w-4 h-4" />
                           </div>
                           <div className="flex flex-col min-w-0">
                             <span className="text-[14px] font-medium truncate max-w-[200px] leading-tight">Documento</span>
                           </div>
                         </a>
                      )}
                      
                      {msg.body && <div className="break-words whitespace-pre-wrap leading-relaxed">{msg.body}</div>}
                      
                      <div className={`mt-1 flex items-center justify-end gap-1 ${msg.fromMe ? "text-primary-foreground/80" : "text-muted-foreground text-[11px]"}`}>
                        <span className="text-[10px]">{formatTime(msg.timestamp)}</span>
                        {msg.fromMe && (
                          <span className="text-[10px]">
                            {msg.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-blue-300" /> : msg.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="shrink-0 border-t border-border bg-card p-3">
                {attachment && (
                  <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
                    <div className="h-14 px-4 flex items-center bg-card border-b border-border text-foreground gap-4">
                      <button onClick={() => setAttachment(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                      <h2 className="font-medium text-lg">Pré-visualizar</h2>
                    </div>
                    
                    <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                      {attachment.type === "image" ? (
                        <img src={attachment.base64} alt="Preview" className="max-w-full max-h-full object-contain shadow-md rounded-md" />
                      ) : attachment.file.type === "application/pdf" ? (
                        <embed src={attachment.base64} type="application/pdf" className="w-full h-full max-w-4xl bg-white rounded-lg shadow-xl" />
                      ) : (
                        <div className="flex flex-col items-center gap-4 text-foreground">
                          <div className="w-32 h-32 bg-muted rounded-2xl flex items-center justify-center shadow-sm">
                            <FileText className="w-16 h-16 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <h3 className="font-medium text-xl max-w-md truncate">{attachment.file.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{(attachment.file.size / 1024).toFixed(1)} KB - Documento</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4 bg-card border-t border-border flex items-center gap-3">
                      <div className="flex-1 flex items-center bg-muted rounded-lg px-4 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                        <input
                          className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground focus:outline-none text-base"
                          placeholder="Adicione uma legenda..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage(e as unknown as React.FormEvent);
                            }
                          }}
                          disabled={isSending}
                          autoFocus
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={handleSendMessage as any}
                        disabled={isSending}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-2 max-w-4xl mx-auto w-full">
                  <button onClick={() => fileInputRef.current?.click()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx" />
                  
                  <div className="flex min-h-[40px] w-full items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                    <textarea
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e as any);
                        }
                      }}
                      placeholder="Mensagem..."
                      className="flex-1 max-h-[120px] resize-none bg-transparent py-0.5 text-[15px] placeholder:text-muted-foreground focus:outline-none text-foreground"
                      rows={1}
                    />
                  </div>

                  <button 
                    onClick={handleSendMessage as any}
                    disabled={(!newMessage.trim() && !attachment) || isSending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : newMessage.trim() || attachment ? <Send className="h-4 w-4 ml-0.5" /> : <Mic className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/20">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted ring-8 ring-background">
                <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="mb-2 text-2xl font-medium text-foreground">WhatsApp Inbox</h3>
              <p className="max-w-[300px] text-sm">Selecione uma conversa na barra lateral para começar a enviar e receber mensagens.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"""

match = re.search(r'  return \(\n    <div', content)
if match:
    new_content = content[:match.start()] + new_jsx
    # also add ChevronDown to lucide-react import if not there
    if 'ChevronDown' not in new_content:
        new_content = new_content.replace('Mic } from "lucide-react";', 'Mic, ChevronDown } from "lucide-react";')
        new_content = new_content.replace('import { Search,', 'import { Search, ChevronDown,')
        
    # Also add `search` state variable
    if 'const [search, setSearch] = useState("");' not in new_content:
        new_content = new_content.replace('const [newMessage, setNewMessage] = useState("");', 'const [newMessage, setNewMessage] = useState("");\n  const [search, setSearch] = useState("");')
        
    with open('financeiro/src/app/crm/inbox/page.tsx', 'w') as f:
        f.write(new_content)
    print("Success")
else:
    print("Could not find main return")
