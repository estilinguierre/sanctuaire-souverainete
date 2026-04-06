import { useCallback, useRef, useState } from "react";
import { api } from "@/services/api";
import type { ChatMessage } from "@/types";

const SESSION_KEY = "ctm_session_id";

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sessionId: string;
  sendMessage: (text: string, useMcp?: boolean) => Promise<void>;
  sendStreamMessage: (text: string) => Promise<void>;
  clearHistory: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(getSessionId());

  const addMessage = (msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  };

  const sendMessage = useCallback(
    async (text: string, useMcp = false) => {
      setError(null);
      const userMsg: ChatMessage = { role: "user", content: text };
      addMessage(userMsg);
      setIsLoading(true);

      try {
        const allMessages = [...messages, userMsg];
        const response = await api.chat({
          messages: allMessages,
          session_id: sessionId.current,
          use_mcp: useMcp,
        });

        sessionId.current = response.session_id || sessionId.current;
        addMessage({ role: "assistant", content: response.answer });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        setError(msg);
        addMessage({
          role: "assistant",
          content: `Erreur: ${msg}. Vérifiez que le backend est démarré.`,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  const sendStreamMessage = useCallback(
    async (text: string) => {
      setError(null);
      const userMsg: ChatMessage = { role: "user", content: text };
      addMessage(userMsg);
      setIsLoading(true);

      // Placeholder assistant message
      addMessage({ role: "assistant", content: "" });

      try {
        const response = await fetch("/api/v1/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            session_id: sessionId.current,
            use_mcp: false,
          }),
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.type === "delta" && payload.delta) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + payload.delta,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur SSE";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    const newId = crypto.randomUUID();
    sessionId.current = newId;
    sessionStorage.setItem(SESSION_KEY, newId);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId: sessionId.current,
    sendMessage,
    sendStreamMessage,
    clearHistory,
  };
}
