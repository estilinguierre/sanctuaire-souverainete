import React, { useEffect, useRef } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

interface Props {
  onSend: (text: string) => void;
  isLoading: boolean;
  lastAssistantMessage?: string;
}

export function VoiceControls({ onSend, isLoading, lastAssistantMessage }: Props) {
  const { transcript, isListening, isSupported, start, stop, reset } = useSpeechRecognition();
  const { speak, stop: stopSpeaking, isSpeaking } = useSpeechSynthesis();
  const inputRef = useRef<HTMLInputElement>(null);

  // When voice recognition produces transcript, fill the input
  useEffect(() => {
    if (transcript && inputRef.current) {
      inputRef.current.value = transcript;
    }
  }, [transcript]);

  const handleMicClick = () => {
    if (isListening) {
      stop();
      // Give browser a moment to finalize the transcript
      setTimeout(() => {
        const text = inputRef.current?.value.trim();
        if (text) {
          onSend(text);
          if (inputRef.current) inputRef.current.value = "";
          reset();
        }
      }, 300);
    } else {
      reset();
      if (inputRef.current) inputRef.current.value = "";
      start();
    }
  };

  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (!text || isLoading) return;
    onSend(text);
    if (inputRef.current) inputRef.current.value = "";
    reset();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTTS = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else if (lastAssistantMessage) {
      // Strip Markdown before speaking
      const plain = lastAssistantMessage
        .replace(/#{1,6} /g, "")
        .replace(/\*\*/g, "")
        .replace(/`[^`]+`/g, "")
        .replace(/\n/g, " ");
      speak(plain);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex gap-2 items-center">
        {/* Mic button */}
        {isSupported && (
          <button
            onMouseDown={handleMicClick}
            disabled={isLoading}
            title={isListening ? "Relâcher pour envoyer" : "Maintenir pour parler"}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200"
                : "bg-ctm-light text-ctm-navy hover:bg-ctm-navy hover:text-white"
            } disabled:opacity-50`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          placeholder={
            isListening
              ? "Écoute en cours..."
              : "Posez votre question SolidWorks..."
          }
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-1 bg-ctm-light border-0 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-ctm-navy
                     placeholder:text-gray-400 disabled:opacity-60"
        />

        {/* TTS button */}
        <button
          onClick={handleTTS}
          disabled={!lastAssistantMessage}
          title={isSpeaking ? "Arrêter la lecture" : "Lire la réponse"}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-ctm-light text-ctm-steel
                     hover:bg-ctm-amber hover:text-white transition-all
                     disabled:opacity-30"
        >
          {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isLoading}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-ctm-navy text-white
                     hover:bg-ctm-amber transition-all disabled:opacity-50"
        >
          <Send size={16} className="mx-auto" />
        </button>
      </div>

      {isListening && (
        <p className="text-xs text-red-500 mt-1 text-center animate-pulse">
          Reconnaissance vocale active — parlez...
        </p>
      )}
    </div>
  );
}
