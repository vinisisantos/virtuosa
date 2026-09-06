"use client";
import { useState } from "react";
import { AiInboxAssistant } from "../../src/components/whatsapp/ai-inbox-assistant";

export default function AiInboxPreview() {
  const [draft, setDraft] = useState("Meu texto já digitado.");
  const [version, setVersion] = useState(0);
  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col bg-background text-foreground">
      <header className="border-b p-4">Inbox · SCS · ambiente de teste</header>
      <div className="flex-1 overflow-auto p-4">
        <p>Cliente: quando abre e fecha?</p>
        <button
          className="mt-6 min-h-11 rounded border p-2"
          onClick={() => setVersion((v) => v + 1)}
        >
          Simular mensagem nova
        </button>
      </div>
      <AiInboxAssistant
        conversationId="test-conversation"
        contextKey={String(version)}
        buildUrl={(url, extra) =>
          `${url}?${new URLSearchParams({ unit: "SCS", ...extra })}`
        }
        onInsert={(text) => setDraft((current) => `${current}\n\n${text}`)}
        hasDraft={!!draft}
      />
      <label className="block p-3 text-sm">
        Rascunho
        <textarea
          aria-label="Rascunho"
          className="mt-2 w-full rounded border p-3 text-base"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
    </main>
  );
}
