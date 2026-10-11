"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Bot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import ExecutionSteps from "./ExecutionsStep";
export interface ExecutionStep {
  steps: number;
  action: string;
  cmd: string;
  msg: string;
  exitCode?: string;
  isSuccess: boolean;
  terminalOutput?: string;
  terminalError?: string;
  duration?: string;
  cwd?: string;
  imageBase64?: string;
}

export interface AiData {
  executions?: ExecutionStep[];
  imageBase64?: string;
  lastAIMsg?: string;
  msg?: string;
  message?: string;
  lastCMD?: string;
  terminal?: string;
  terminalError?: string;
}
function useTypewriter(text: string, speed = 12, isNew = false) {
  const [displayedText, setDisplayedText] = useState(isNew ? "" : text);

  useEffect(() => {
    if (!isNew) {
      setDisplayedText(text);
      return;
    }
    let index = 0;
    const interval = setInterval(() => {
      index += 3; // reveals 3 characters at a time for smooth reading
      setDisplayedText(text.slice(0, index));
      if (index >= text.length) clearInterval(interval);
    }, speed);

    return () => clearInterval(interval);
  }, [text, isNew, speed]);

  return displayedText;
}

const AIMsgBox = ({
  data,
  isLatest = false,
}: {
  data: AiData | any;
  isLatest?: boolean;
}) => {
  const msgRef = useRef<HTMLDivElement>(null);
  const executionsRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [imagesBase64, setImagesBase64] = useState<any>([]);

  // Safely parse and normalize data whether it's a string, JSON string, or object
  let parsedData: any = data;

  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch {
      parsedData = { lastAIMsg: data };
    }
  }

  // Handle nested data wrappers e.g. { data: { ... } }
  const normalized =
    parsedData &&
    typeof parsedData === "object" &&
    "data" in parsedData &&
    typeof parsedData.data === "object"
      ? parsedData.data
      : parsedData || {};
  // Safely extract content and handle legacy stringified or object records
  let rawContent = normalized.content;
  let parsedContentObj: any = null;

  if (
    typeof rawContent === "string" &&
    (rawContent.trim().startsWith("{") || rawContent.trim().startsWith("["))
  ) {
    try {
      parsedContentObj = JSON.parse(rawContent);
    } catch {
      parsedContentObj = null;
    }
  } else if (rawContent && typeof rawContent === "object") {
    parsedContentObj = rawContent;
  }

  // Extract display message as a guaranteed string
  let messageText = "";
  if (parsedContentObj && typeof parsedContentObj === "object") {
    const candidate =
      parsedContentObj.lastAIMsg ??
      parsedContentObj.content ??
      parsedContentObj.msg ??
      parsedContentObj.message ??
      parsedContentObj.text;
    if (typeof candidate === "string") {
      messageText = candidate;
    } else if (candidate !== undefined && candidate !== null) {
      messageText =
        typeof candidate === "object"
          ? JSON.stringify(candidate, null, 2)
          : String(candidate);
    } else {
      messageText = JSON.stringify(parsedContentObj, null, 2);
    }
  } else if (typeof rawContent === "string") {
    messageText = rawContent;
  }

  // Fallbacks if messageText is still empty
  if (!messageText) {
    const fallback =
      normalized.lastAIMsg ??
      normalized.msg ??
      normalized.message ??
      normalized.text ??
      (typeof data === "string" ? data : "");
    if (typeof fallback === "string") {
      messageText = fallback;
    } else if (fallback && typeof fallback === "object") {
      messageText = JSON.stringify(fallback, null, 2);
    } else {
      messageText = String(fallback || "");
    }
  }

  let lastAIMsg: string = messageText;
  if (
    typeof lastAIMsg === "string" &&
    lastAIMsg.includes('"cmd"') &&
    lastAIMsg.includes('"msg"')
  ) {
    const salvaged = lastAIMsg.match(/"msg"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    if (salvaged) {
      try {
        lastAIMsg = JSON.parse('"' + salvaged[1] + '"');
      } catch {
        lastAIMsg = salvaged[1];
      }
    }
  }
  const isRecent =
    !data.timestamp || Date.now() - new Date(data.timestamp).getTime() < 15000;
  const displayedContent = useTypewriter(lastAIMsg, 12, isLatest && isRecent);
  // Extract executions safely, checking both top-level and legacy inner object
  const executions: ExecutionStep[] = Array.isArray(normalized.executions)
    ? normalized.executions
    : Array.isArray(parsedContentObj?.executions)
      ? parsedContentObj.executions
      : [];
  const capturedImages = executions
    .filter((step) => step.imageBase64)
    .map((step) => {
      if (step.imageBase64)
        return {
          step: step.steps,
          src: step.imageBase64.startsWith("data:")
            ? step.imageBase64
            : `data:image/png;base64,${step.imageBase64}`,
        };
    });

  useEffect(() => {
    setImagesBase64(capturedImages);
  }, [executions]);

  const rawImage: string | undefined =
    normalized.imageBase64 || parsedContentObj?.imageBase64;
  const imageSrc = rawImage
    ? rawImage.startsWith("data:")
      ? rawImage
      : `data:image/png;base64,${rawImage}`
    : null;

  const workedSeconds: number | undefined =
    normalized.workedSeconds ?? parsedContentObj?.workedSeconds;

  // Scroll to the message when it first appears
  useEffect(() => {
    msgRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lastAIMsg]);

  // Scroll to executions ONLY when user opens/closes the accordion
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    executionsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [isOpen]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex items-start gap-2.5 w-full max-w-2xl sm:max-w-2xl px-2 py-1"
    >
      {/* Avatar column */}

      {/* Content column — flex-1 min-w-0 prevents overflow */}
      <div className="flex flex-col min-w-0 gap-2  w-full">
        <div className="relative shrink-0 pt-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-border/60 bg-gradient-to-br from-brand-surface to-brand/20 shadow-[0_0_16px_rgba(168,85,247,0.25)]">
            <Bot className="h-4 w-4 text-brand-hover shrink-0" />
          </div>
        </div>
        {/* Captured screenshots grid */}
        {imagesBase64.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {imagesBase64.map((imageBase64: any, index: number) => (
              <div
                key={index}
                className="relative flex justify-center items-center rounded-xl overflow-hidden border border-brand-border/30 bg-black/20"
              >
                <img
                  className="rounded-xl w-full h-full object-contain opacity-80"
                  src={imageBase64.src}
                  alt={"screenshotImage " + index}
                  loading="lazy"
                />
                <span className="absolute top-1 left-1.5 text-xs font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-full">
                  {imageBase64.step}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* AI message bubble */}
        <div
          ref={msgRef}
          className="my-2 text-xl leading-7 text-zinc-100 overflow-hidden"
        >
          <pre className="whitespace-pre-wrap">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {String(displayedContent)}
            </ReactMarkdown>
          </pre>
        </div>

        {/* Execution steps */}
        {executions.length > 0 && (
          <div ref={executionsRef}>
            <ExecutionSteps
              executions={executions}
              isWorking={false}
              workedSeconds={workedSeconds}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AIMsgBox;
