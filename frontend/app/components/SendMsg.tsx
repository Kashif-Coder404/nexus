"use client";
import {
  SendHorizonal,
  Loader2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  StopCircle,
  SquareEqual,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useUserCredentials } from "../store/useUserCredentials";
import useChat from "../store/useChat";
import { useRouter } from "next/navigation";
import { sendWsJson } from "@/services/ws.service";
import { IconStopwatch } from "@tabler/icons-react";

export type ModelType = {
  provider: "gemini" | "local_gemini";
  name: string;
  displayName: string;
  isLiveModel: boolean;
};

const Models: ModelType[] = [
  {
    provider: "gemini",
    name: "gemini-3.6-flash",
    displayName: "Nexus (Stable)",
    isLiveModel: false,
  },
  {
    provider: "gemini",
    name: "gemini-3.7-flash",
    displayName: "Nexus (Smart)",
    isLiveModel: false,
  },
  {
    provider: "gemini",
    name: "gemini-3.1-pro",
    displayName: "Nexus (Pro)",
    isLiveModel: false,
  },
  {
    provider: "gemini",
    name: "gemini-3.5-flash-lite",
    displayName: "Nexus (Fast)",
    isLiveModel: false,
  },
  {
    provider: "gemini",
    name: "gemini-3.1-flash-live-preview",
    displayName: "Nexus (Experimental)",
    isLiveModel: true,
  },
  {
    provider: "gemini",
    name: "gemini-3.8-live",
    displayName: "Nexus (Latest)",
    isLiveModel: true,
  },
];

const SendMsg = ({ sendingUrl }: { sendingUrl?: string }) => {
  const [msg, setMsg] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [model, setModel] = useState<ModelType>(Models[0]);

  const sessionId = useChat((state) => state.session);
  const addChat = useChat((state) => state.addChat);
  const isWorking = Boolean(useChat((state) => state.workingOn));
  const isDisabled = isSending || isWorking;
  const router = useRouter();

  // Unlock send button when ai_done arrives from WS
  useEffect(() => {
    const handler = () => setIsSending(false);
    window.addEventListener("nexus_ai_done", handler);
    return () => window.removeEventListener("nexus_ai_done", handler);
  }, []);

  // Listen for session_created to automatically navigate to the new chat URL
  useEffect(() => {
    const sessionHandler = (e: any) => {
      const newSid = e.detail?.sessionId;
      if (newSid) {
        router.replace(`/chat/${newSid}`);
      }
    };
    window.addEventListener("nexus_session_created", sessionHandler);
    return () =>
      window.removeEventListener("nexus_session_created", sessionHandler);
  }, [router]);

  const handleSendMsg = async (isStop?: boolean) => {
    const actualMessage = msg.trim();
    if (isStop) {
      if (!sessionId) return;
      useChat.getState().setWorkingOn(null);
      useChat.getState().setMiddleMsg(null);
      useChat.getState().setLiveExecutions([]);
      sendWsJson({
        type: "stop_ai",
        sessionId,
      });
      setIsSending(false);
      return;
    }
    if (!actualMessage || isSending) return;

    // 1. Optimistically display user's message right away
    addChat({
      role: "user",
      content: actualMessage,
      timestamp: new Date().toISOString(),
    });
    setMsg("");
    setIsSending(true);
    try {
      sendWsJson({
        type: "chat_send",
        sessionId,
        content: actualMessage,
        model: {
          provider: model.provider,
          name: model.name,
          isLiveModel: model.isLiveModel,
        },
      });
    } catch (err) {
      console.error(err);
      setIsSending(false);
    }
  };
  const [isModelSelectOpen, setIsModelSelectOpen] = useState<boolean>(false);
  return (
    <>
      <div className="relative w-full max-w-4xl mx-auto px-4 py-3">
        <div className="relative w-fit ml-2 mb-1.5 group">
          <button
            onClick={() => setIsModelSelectOpen(!isModelSelectOpen)}
            className="flex items-center gap-2 text-brand-glow hover:text-brand-hover transition"
          >
            <span className="font-mono">{model.displayName || model.name}</span>
            <ChevronDown className="h-3 w-3 transition-transform group-hover:rotate-180" />
          </button>

          {/* Dropdown Menu */}
          <div
            className={`absolute z-[999] bottom-full left-0 mb-2 w-64 bg-brand-surface/95 border border-brand-border/60 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl ${isModelSelectOpen ? "opacity-100 visible" : "opacity-0 invisible transition-all duration-200"}`}
          >
            <div className="p-1">
              {Models.map((m) => {
                const isSelected =
                  model.name === m.name && model.provider === m.provider;
                return (
                  <button
                    key={`${m.provider}-${m.name}`}
                    onClick={() => {
                      setModel(m);
                      setIsModelSelectOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-mono text-left transition-all ${
                      isSelected
                        ? "bg-brand/20 text-brand-glow"
                        : "text-zinc-300 hover:bg-brand/10 hover:text-white"
                    }`}
                  >
                    <span>{m.displayName || m.name}</span>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 ml-auto text-brand-hover" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center rounded-2xl bg-brand-surface/80 border border-brand-border/40 p-1.5 shadow-[0_0_25px_rgba(168,85,247,0.15)] focus-within:border-brand-hover focus-within:shadow-[0_0_30px_rgba(168,85,247,0.3)] backdrop-blur-lg transition-all duration-300">
          {/* Left Indicator */}
          {/* <div className="pl-3 pr-2 text-brand select-none">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div> */}

          {/* Input Field */}
          <input
            className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none tracking-wide"
            type="text"
            placeholder="Ask Nexus to run commands, inspect files, or launch desktop apps... (Press Enter)"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMsg();
              }
            }}
            disabled={isDisabled}
          />

          {/* Send Button */}
          <button
            onClick={() => handleSendMsg(isDisabled)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-brand to-brand-hover text-white transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-brand/40 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
          >
            {isDisabled ? (
              <div className="w-4 h-4 bg-white rounded-full"></div>
            ) : (
              // <StopCircle className="h-5 w-5 animate-spin" />
              <SendHorizonal className="h-5 w-5" />
            )}
          </button>

          {/* 
          <button
            onClick={handleSendMsg}
            disabled={isDisabled}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-brand to-brand-hover text-white transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-brand/40 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
            title="Send message"
          >
            {isDisabled ? (
              <div className="w-4 h-4 bg-white rounded"></div>
            ) : (
              <SendHorizonal className="h-5 w-5" />
            )}
          </button> */}
        </div>

        <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] text-zinc-400">
          <span>
            Press{" "}
            <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300">
              Enter
            </kbd>{" "}
            to send
          </span>
        </div>
      </div>
    </>
  );
};

export default SendMsg;
