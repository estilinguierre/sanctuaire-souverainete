import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlighter } from "./SyntaxHighlighter";
import type { ChatMessage } from "@/types";
import { Bot, User } from "lucide-react";

interface Props {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-ctm-steel opacity-60 select-none">
          <Bot size={48} className="mb-3 text-ctm-amber" />
          <p className="text-lg font-medium">Assistant SolidWorks IA</p>
          <p className="text-sm mt-1">CTM Industrie — Dives-sur-Mer, Normandie</p>
          <p className="text-xs mt-4 text-center max-w-sm">
            Posez vos questions sur la tôlerie, chaudronnerie, structures métalliques
            ou demandez d'agir dans SolidWorks.
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {msg.role === "assistant" && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-ctm-amber flex items-center justify-center">
              <Bot size={16} className="text-ctm-dark" />
            </div>
          )}

          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-ctm-navy text-white rounded-tr-sm"
                : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-sm"
            }`}
          >
            {msg.role === "assistant" ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isBlock = !!match;
                    return isBlock ? (
                      <SyntaxHighlighter language={match[1]} code={String(children).trim()} />
                    ) : (
                      <code className="bg-gray-100 text-ctm-navy px-1 rounded font-mono text-xs" {...props}>
                        {children}
                      </code>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full text-xs border-collapse border border-gray-200">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return <th className="border border-gray-200 bg-ctm-light px-2 py-1 text-left font-semibold">{children}</th>;
                  },
                  td({ children }) {
                    return <td className="border border-gray-200 px-2 py-1">{children}</td>;
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            )}
          </div>

          {msg.role === "user" && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-ctm-steel flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
          )}
        </div>
      ))}

      {isLoading && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-ctm-amber flex items-center justify-center">
            <Bot size={16} className="text-ctm-dark" />
          </div>
          <div className="bg-white shadow-sm border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
            <div className="flex gap-1 items-center">
              <span className="w-2 h-2 bg-ctm-amber rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-ctm-amber rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-ctm-amber rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
