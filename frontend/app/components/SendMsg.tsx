"use client";
import {
  SendHorizonal,
  Loader2,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  StopCircle,
  SquareEqual,
  Laptop,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useUserCredentials } from "../store/useUserCredentials";
import useChat from "../store/useChat";
import { useDevices } from "../store/useDevices";
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
  const [isDeviceSelectOpen, setIsDeviceSelectOpen] = useState<boolean>(false);

  const devices = useDevices((state) => state.devices);
  const selectedDeviceId = useDevices((state) => state.selectedDeviceId);
  const setSelectedDeviceId = useDevices((state) => state.setSelectedDeviceId);
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

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
        deviceId: selectedDeviceId,
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
        {/* Top Control Bar: Model Selector + Target Device Selector */}
        <div className="flex items-center gap-3 ml-2 mb-2">
          {/* 1. Model Selector */}
          <div className="relative w-fit group">
            <button
              type="button"
              onClick={() => {
                setIsModelSelectOpen(!isModelSelectOpen);
                setIsDeviceSelectOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-surface/70 border border-brand-border/40 text-brand-glow hover:text-white hover:border-brand-hover/60 transition text-xs font-mono backdrop-blur-md"
            >
              <span>{model.displayName || model.name}</span>
              <ChevronDown className="h-3 w-3 text-brand-glow/70 transition-transform group-hover:rotate-180" />
            </button>

            {/* Model Dropdown Menu */}
            <div
              className={`absolute z-[999] bottom-full left-0 mb-2 w-60 bg-brand-surface/95 border border-brand-border/60 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl ${
                isModelSelectOpen
                  ? "opacity-100 visible"
                  : "opacity-0 invisible transition-all duration-200"
              }`}
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
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono text-left transition-all ${
                        isSelected
                          ? "bg-brand/20 text-brand-glow"
                          : "text-zinc-300 hover:bg-brand/10 hover:text-white"
                      }`}
                    >
                      <span>{m.displayName || m.name}</span>
                      {isSelected && (
                        <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-brand-hover" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Target Device Selector */}
          <div className="relative w-fit group">
            <button
              type="button"
              onClick={() => {
                setIsDeviceSelectOpen(!isDeviceSelectOpen);
                setIsModelSelectOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition backdrop-blur-md ${
                selectedDevice && selectedDevice.online
                  ? "bg-brand-surface/70 border-emerald-500/40 text-zinc-200 hover:border-emerald-500/70"
                  : "bg-brand-surface/70 border-amber-500/40 text-amber-300/80 hover:border-amber-500/70"
              }`}
            >
              <Laptop className="h-3 w-3 text-zinc-400" />
              {selectedDevice ? (
                <span className="flex items-center gap-1.5">
                  <span className="truncate max-w-[130px]">
                    {selectedDevice.deviceName}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      selectedDevice.online
                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                        : "bg-red-500"
                    }`}
                  />
                </span>
              ) : (
                <span className="text-amber-400 text-[11px]">
                  Select Target Device
                </span>
              )}
              <ChevronDown className="h-3 w-3 text-zinc-500 transition-transform group-hover:rotate-180" />
            </button>

            {/* Device Dropdown Menu */}
            <div
              className={`absolute z-[999] bottom-full left-0 mb-2 w-64 bg-brand-surface/95 border border-brand-border/60 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl ${
                isDeviceSelectOpen
                  ? "opacity-100 visible"
                  : "opacity-0 invisible transition-all duration-200"
              }`}
            >
              <div className="p-1">
                <div className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-white/5 flex items-center justify-between">
                  <span>Target Companion</span>
                  <span className="text-[9px] text-zinc-500">
                    {devices.filter((d) => d.online).length} online
                  </span>
                </div>
                {devices.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-zinc-500 text-center">
                    No devices paired yet.
                  </div>
                ) : (
                  devices.map((d) => {
                    const isSel = selectedDeviceId === d.id;
                    return (
                      <button
                        key={d.id}
                        disabled={!d.online}
                        type="button"
                        onClick={() => {
                          if (d.online) {
                            setSelectedDeviceId(d.id);
                            setIsDeviceSelectOpen(false);
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-mono text-left transition-all ${
                          isSel
                            ? "bg-brand/20 text-brand-glow font-medium"
                            : d.online
                              ? "text-zinc-300 hover:bg-brand/10 hover:text-white"
                              : "text-zinc-600 opacity-40 cursor-not-allowed"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            d.online ? "bg-emerald-400" : "bg-red-500"
                          }`}
                        />
                        <span className="truncate flex-1">{d.deviceName}</span>
                        {isSel && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-brand-hover shrink-0" />
                        )}
                        {!d.online && (
                          <span className="text-[10px] text-zinc-600 shrink-0">
                            Offline
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
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
