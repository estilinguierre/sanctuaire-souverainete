import React, { useEffect, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { MessageList } from "./MessageList";
import { VoiceControls } from "./VoiceControls";
import { Sidebar } from "./Sidebar";
import { Trash2 } from "lucide-react";

export function VoiceAssistant() {
  const { messages, isLoading, sendStreamMessage, clearHistory } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content;

  const handleGuideInsert = (content: string) => {
    // Summarise the guide via the chat
    const preview = content.slice(0, 500);
    sendStreamMessage(
      `Voici le contenu d'un guide technique. Donne-moi un résumé des points clés :\n\n${preview}`
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <Sidebar onGuideInsert={handleGuideInsert} />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200">
          <div>
            <h1 className="text-sm font-semibold text-ctm-navy">
              Assistant SolidWorks IA
            </h1>
            <p className="text-xs text-ctm-steel">
              Tôlerie · Chaudronnerie · Structures métalliques
            </p>
          </div>
          <button
            onClick={clearHistory}
            title="Nouvelle conversation"
            className="text-ctm-steel hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <MessageList messages={messages} isLoading={isLoading} />
          <div ref={bottomRef} />
        </div>

        {/* Voice + text input */}
        <VoiceControls
          onSend={sendStreamMessage}
          isLoading={isLoading}
          lastAssistantMessage={lastAssistant}
        />
      </div>
    </div>
  );
}
