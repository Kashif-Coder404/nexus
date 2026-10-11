"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Terminal,
  Play,
  Square,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Send,
  Zap,
  Activity,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronRight,
  Code2,
  Server,
  Trash2,
  Eye,
  CheckCheck,
  XCircle,
  BellRing,
} from "lucide-react";
import Ansi from "ansi-to-react";
import dynamic from "next/dynamic";

const XTerminal = dynamic(() => import("@/app/components/XTerminal"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500 py-12">
      Initializing VS Code Terminal...
    </div>
  ),
});

// Normalizes ANSI codes ensuring raw tags like [36m are formatted with standard ESC (\u001b)
const formatAnsi = (str?: string) => {
  if (!str) return "";
  return (
    str
      // 1. Strip OSC window title noise (\x1b]0;...\x07 and ]0;...)
      .replace(/\x1b\]0;[^\x07\x1b]*(\x07|\x1b\\?)/g, "")
      .replace(/\]0;[^\r\n]*/g, "")
      // 2. Collapse 3+ consecutive blank lines down to max 1 blank line
      .replace(/(\r?\n){3,}/g, "\n\n")
  );
};

interface CommandLogMessage {
  id: string;
  sender: "user" | "local_be";
  timestamp: string;
  commandText: string;
  isDaemon?: boolean;
  isCompletionNotice?: boolean;
  response?: {
    cmd: string;
    msg: string;
    terminalOutput: string;
    terminalError?: string;
    isSuccess: boolean;
    pid?: string;
    exitCode?: number | null;
    taskId?: string;
    executionTimeMs?: number;
  };
  isPending?: boolean;
}

interface ActiveTaskInfo {
  taskId: string;
  pid: string;
  command: string;
  startedAt: string;
  status: "running" | "completed" | "failed" | "killed";
  exitCode?: number | null;
  logs: string;
  isDaemon?: boolean;
  completedAt?: string;
}

const PRESET_COMMANDS = [
  {
    label: "Fast CLI (< 1.5s)",
    description: "Runs instantly and returns output synchronously",
    command:
      "powershell -c \"Write-Output 'Instant command output from Local-BE'; exit 0\"",
    isDaemon: false,
    timeout: 0,
  },
  {
    label: "Long Finite Task (4s)",
    description:
      "Promoted to TaskManager at 1.5s, finishes cleanly with completion trigger",
    command:
      "powershell -c \"Write-Output 'Step 1/3: Starting build...'; Start-Sleep 2; Write-Output 'Step 2/3: Compiling assets...'; Start-Sleep 2; Write-Output 'Step 3/3: Build Complete!'; exit 0\"",
    isDaemon: false,
    timeout: 0,
  },
  {
    label: "Background Daemon (20s)",
    description: "Returns in <100ms, streams ticks live in background",
    command:
      'powershell -c "$i=0; while($i -lt 20){ $i++; Write-Output \"Daemon heartbeat tick $i\"; Start-Sleep 1 }"',
    isDaemon: true,
    timeout: 0,
  },
  {
    label: "Crash Simulation (Exit 42)",
    description:
      "Exits with non-zero code to test failure/crash notification layout",
    command:
      "powershell -c \"Write-Output 'Executing critical process...'; Start-Sleep 2; Write-Output 'Fatal exception occurred!'; exit 42\"",
    isDaemon: true,
    timeout: 0,
  },
];

export default function WorkbenchPage() {
  const [localBeUrl, setLocalBeUrl] = useState("http://localhost:4100");
  const [isBeOnline, setIsBeOnline] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<CommandLogMessage[]>([]);
  const [inputCmd, setInputCmd] = useState("");
  const [isDaemon, setIsDaemon] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(0);
  const [schemaMode, setSchemaMode] = useState<"simple" | "ai_schema">(
    "simple",
  );
  const [rawSchema, setRawSchema] = useState(
    JSON.stringify(
      {
        action: "terminal",
        param: { command: "dir" },
        isDaemon: false,
      },
      null,
      2,
    ),
  );

  // Tasks drawer state
  const [tasks, setTasks] = useState<Record<string, ActiveTaskInfo>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [autoScrollTerminal, setAutoScrollTerminal] = useState(true);
  const [taskStdin, setTaskStdin] = useState("");
  const [isSendingStdin, setIsSendingStdin] = useState(false);
  const [terminalViewMode, setTerminalViewMode] = useState<"interactive" | "raw">("interactive");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Safe list of active tasks - immune to null/undefined entries
  const activeTasksList = useMemo(() => {
    return Object.values(tasks).filter((t): t is ActiveTaskInfo =>
      Boolean(t && t.taskId),
    );
  }, [tasks]);

  // Selected task safe lookup
  const selectedTask = useMemo(() => {
    return selectedTaskId && tasks[selectedTaskId]
      ? tasks[selectedTaskId]
      : null;
  }, [selectedTaskId, tasks]);

  // Check Local-BE health
  const checkHealth = async () => {
    try {
      const res = await fetch(`${localBeUrl}/api/pairing-status`);
      setIsBeOnline(res.ok);
    } catch {
      setIsBeOnline(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [localBeUrl]);

  // Auto-scroll chat messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-poll logs and detect background process completion
  useEffect(() => {
    const runningTasks = activeTasksList.filter((t) => t.status === "running");
    if (runningTasks.length === 0) return;

    const interval = setInterval(async () => {
      for (const task of runningTasks) {
        try {
          const res = await fetch(
            `${localBeUrl}/api/tasks/${task.taskId}/logs?lines=150`,
          );
          if (res.ok) {
            const data = await res.json();
            const isFinished = !data.msg.includes("still running");
            const finalExit = data.exitCode;

            if (isFinished) {
              const newStatus = finalExit === 0 ? "completed" : "failed";

              // 1. Update task in registry
              setTasks((prev) => {
                const existing = prev[task.taskId];
                if (!existing || existing.status !== "running") return prev;
                return {
                  ...prev,
                  [task.taskId]: {
                    ...existing,
                    logs: data.terminalOutput || existing.logs,
                    status: newStatus,
                    exitCode: finalExit,
                    completedAt: new Date().toLocaleTimeString(),
                  },
                };
              });

              // 2. Add an unprompted Completion Card to the chat feed (simulating AI being notified of task end!)
              setMessages((prev) => {
                const alreadyNotified = prev.some(
                  (m) => m.id === `completion-${task.taskId}`,
                );
                if (alreadyNotified) return prev;

                const completionNotice: CommandLogMessage = {
                  id: `completion-${task.taskId}`,
                  sender: "local_be",
                  timestamp: new Date().toLocaleTimeString(),
                  commandText: task.command,
                  isCompletionNotice: true,
                  response: {
                    cmd: task.command,
                    msg:
                      newStatus === "completed"
                        ? `Background task '${task.taskId}' has completed successfully.`
                        : `Background task '${task.taskId}' failed with exit code ${finalExit}.`,
                    terminalOutput: data.terminalOutput || "",
                    terminalError:
                      newStatus === "failed"
                        ? `Process exited with code ${finalExit}`
                        : "",
                    isSuccess: newStatus === "completed",
                    pid: task.pid,
                    exitCode: finalExit,
                    taskId: task.taskId,
                  },
                };
                return [...prev, completionNotice];
              });
            } else {
              // Still running: update logs
              setTasks((prev) => {
                const existing = prev[task.taskId];
                if (!existing) return prev;
                return {
                  ...prev,
                  [task.taskId]: {
                    ...existing,
                    logs: data.terminalOutput || existing.logs,
                  },
                };
              });
            }
          }
        } catch {}
      }
    }, 350);

    return () => clearInterval(interval);
  }, [activeTasksList, localBeUrl]);

  // Auto-scroll active terminal
  useEffect(() => {
    if (autoScrollTerminal) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [tasks, selectedTaskId, autoScrollTerminal]);

  // Execute Command
  const handleExecute = async (
    cmdText: string,
    asDaemon: boolean,
    timeoutVal: number,
  ) => {
    if (!cmdText.trim()) return;

    const msgId = `msg-${Date.now()}`;
    const userMsg: CommandLogMessage = {
      id: msgId,
      sender: "user",
      timestamp: new Date().toLocaleTimeString(),
      commandText: cmdText,
      isDaemon: asDaemon,
      isPending: true,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputCmd("");

    const startTime = performance.now();

    try {
      const payload = {
        command: cmdText,
        isDaemon: asDaemon,
        timeoutSeconds: timeoutVal,
      };

      const res = await fetch(`${localBeUrl}/test-cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      const elapsed = Math.round(performance.now() - startTime);

      const assistantMsg: CommandLogMessage = {
        id: `asst-${Date.now()}`,
        sender: "local_be",
        timestamp: new Date().toLocaleTimeString(),
        commandText: cmdText,
        isDaemon: asDaemon,
        response: {
          cmd: data.cmd || cmdText,
          msg: data.msg || "",
          terminalOutput: data.terminalOutput || "",
          terminalError: data.terminalError || "",
          isSuccess: data.isSuccess,
          pid: data.pid ? String(data.pid) : undefined,
          exitCode: data.exitCode,
          taskId: data.taskId,
          executionTimeMs: elapsed,
        },
      };

      setMessages((prev) =>
        prev
          .map((m) => (m.id === msgId ? { ...m, isPending: false } : m))
          .concat(assistantMsg),
      );

      // If task was promoted to background or is daemon, add to tasks registry
      if (
        data.taskId &&
        (data.msg?.includes("background") || asDaemon || elapsed > 1400)
      ) {
        const newTask: ActiveTaskInfo = {
          taskId: data.taskId,
          pid: data.pid ? String(data.pid) : "0",
          command: cmdText,
          startedAt: new Date().toLocaleTimeString(),
          status: "running",
          logs: data.terminalOutput || "Initializing task...",
          isDaemon: asDaemon,
        };
        setTasks((prev) => ({ ...prev, [data.taskId]: newTask }));
        setSelectedTaskId(data.taskId);
        setIsDrawerOpen(true);
      }
    } catch (err: any) {
      const errorMsg: CommandLogMessage = {
        id: `asst-${Date.now()}`,
        sender: "local_be",
        timestamp: new Date().toLocaleTimeString(),
        commandText: cmdText,
        response: {
          cmd: cmdText,
          msg: "Failed to connect to Local-BE",
          terminalOutput: "",
          terminalError: err.message,
          isSuccess: false,
        },
      };
      setMessages((prev) =>
        prev
          .map((m) => (m.id === msgId ? { ...m, isPending: false } : m))
          .concat(errorMsg),
      );
    }
  };

  // Peek single task logs on demand
  const handlePeekTask = async (taskId: string) => {
    try {
      const res = await fetch(
        `${localBeUrl}/api/tasks/${taskId}/logs?lines=50`,
      );
      if (res.ok) {
        const data = await res.json();
        const isFinished = !data.msg.includes("still running");
        setTasks((prev) => {
          const t = prev[taskId];
          if (!t) return prev;
          return {
            ...prev,
            [taskId]: {
              ...t,
              logs: data.terminalOutput || t.logs,
              status: isFinished
                ? data.exitCode === 0
                  ? "completed"
                  : "failed"
                : "running",
              exitCode: data.exitCode,
            },
          };
        });
        setSelectedTaskId(taskId);
        setIsDrawerOpen(true);
      }
    } catch {}
  };

  // Kill Task
  const handleKillTask = async (taskId: string, pid: string) => {
    try {
      const res = await fetch(`${localBeUrl}/kill/${pid}`, { method: "POST" });
      if (res.ok) {
        setTasks((prev) => {
          const t = prev[taskId];
          if (!t) return prev;
          return {
            ...prev,
            [taskId]: {
              ...t,
              status: "killed",
              completedAt: new Date().toLocaleTimeString(),
            },
          };
        });

        // Add notice to chat feed
        setMessages((prev) => [
          ...prev,
          {
            id: `kill-${taskId}-${Date.now()}`,
            sender: "local_be",
            timestamp: new Date().toLocaleTimeString(),
            commandText: "",
            isCompletionNotice: true,
            response: {
              cmd: "",
              msg: `🛑 Task '${taskId}' (PID: ${pid}) was terminated by user.`,
              terminalOutput: "",
              isSuccess: false,
              taskId,
              pid,
            },
          },
        ]);
      }
    } catch {}
  };

  // Copy logs helper
  const handleCopyLogs = (taskId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTaskId(taskId);
    setTimeout(() => setCopiedTaskId(null), 1500);
  };

  // Send Standard Input (stdin) to Running Task
  const handleSendStdin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;

    const inputToSend = taskStdin;
    setTaskStdin("");
    setIsSendingStdin(true);

    try {
      const res = await fetch(
        `${localBeUrl}/api/tasks/${selectedTaskId}/stdin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: inputToSend }),
        },
      );

      if (res.ok) {
        // Refresh logs after 300ms so the user sees the output reaction
        setTimeout(() => handlePeekTask(selectedTaskId), 300);
      }
    } catch (err) {
      console.error("Failed to send stdin:", err);
    } finally {
      setIsSendingStdin(false);
    }
  };

  // Send Raw Keystroke (Arrows, Enter, Ctrl+C)
  const sendRawKeystroke = async (keystroke: string) => {
    if (!selectedTaskId) return;
    try {
      await fetch(`${localBeUrl}/api/tasks/${selectedTaskId}/stdin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: keystroke, isRaw: true }),
      });
      setTimeout(() => handlePeekTask(selectedTaskId), 200);
    } catch (err) {
      console.error("Failed to send raw keystroke:", err);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#080711] text-zinc-100 font-sans overflow-hidden">
      {/* LEFT: Main Chat Workbench */}
      <div className="flex-1 flex flex-col h-full border-r border-[#4c227b]/30 min-w-0">
        {/* Top Navigation Bar */}
        <header className="h-14 shrink-0 px-5 flex items-center justify-between border-b border-[#4c227b]/40 bg-[#140d24]/60 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#a855f7]/20 border border-[#a855f7]/40 flex items-center justify-center text-[#a855f7]">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                Nexus Terminal Workbench
                <span className="text-[10px] font-mono font-normal uppercase px-1.5 py-0.5 rounded bg-[#a855f7]/15 border border-[#a855f7]/30 text-[#d8b4fe]">
                  Test Mode (No AI)
                </span>
              </h1>
            </div>
          </div>

          {/* Connection Status & Drawer Toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#080711]/70 border border-[#4c227b]/40 text-xs font-mono">
              <span
                className={`h-2 w-2 rounded-full ${
                  isBeOnline === true
                    ? "bg-emerald-400 animate-pulse"
                    : isBeOnline === false
                      ? "bg-rose-400"
                      : "bg-zinc-500"
                }`}
              />
              <span className="text-zinc-300">
                {isBeOnline === true ? "Local-BE: Online" : "Local-BE: Offline"}
              </span>
            </div>

            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#140d24] border border-[#4c227b]/40 hover:border-[#a855f7] hover:bg-[#a855f7]/10 transition-colors cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-[#a855f7]" />
              Tasks Drawer
              {activeTasksList.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#a855f7] text-white text-[10px] font-bold">
                  {activeTasksList.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Quick Presets Bar */}
        <div className="shrink-0 px-5 py-2.5 bg-[#080711]/90 border-b border-[#4c227b]/20 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-zinc-500 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider shrink-0 mr-1">
            <Zap className="h-3 w-3 text-[#a855f7]" />
            Presets:
          </span>
          {PRESET_COMMANDS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() =>
                handleExecute(preset.command, preset.isDaemon, preset.timeout)
              }
              className="shrink-0 px-2.5 py-1 rounded-md bg-[#140d24]/80 border border-[#4c227b]/40 hover:border-[#a855f7]/60 hover:bg-[#a855f7]/15 transition-all text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
              title={preset.description}
            >
              <Play className="h-2.5 w-2.5 text-[#a855f7]" />
              {preset.label}
            </button>
          ))}
        </div>

        {/* Scrollable Chat Feed */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-[#140d24] border border-[#4c227b]/50 flex items-center justify-center text-[#a855f7] shadow-[0_0_25px_rgba(168,85,247,0.2)]">
                <Server className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-white">
                Direct Local-BE Test Harness
              </h2>
              <p className="text-xs text-zinc-400 max-w-md">
                Test commands, long-running builds, and background daemons
                directly against your local companion agent (Port 4100).
              </p>
              <div className="text-[11px] text-zinc-500 font-mono">
                Click any preset above or type a PowerShell command below.
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              // Look up live status if this message is tied to a background task
              const currentTaskState = msg.response?.taskId
                ? tasks[msg.response.taskId]
                : null;
              const taskStatus = currentTaskState?.status || "running";

              // Safely extract logs & error streams independently
              const displayLogs = (
                currentTaskState?.logs ??
                msg.response?.terminalOutput ??
                ""
              ).trim();
              const displayError = (msg.response?.terminalError ?? "").trim();

              return (
                <div key={msg.id} className="space-y-3">
                  {/* User Bubble */}
                  {msg.sender === "user" && (
                    <div className="flex justify-end">
                      <div className="max-w-xl rounded-2xl bg-[#140d24]/90 border border-[#4c227b]/50 px-4 py-2.5 text-sm text-zinc-100 shadow-md">
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <span className="text-[10px] uppercase font-mono text-[#d8b4fe]">
                            Command Request
                          </span>
                          <div className="flex items-center gap-1.5">
                            {msg.isDaemon && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono">
                                Daemon
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">
                              {msg.timestamp}
                            </span>
                          </div>
                        </div>
                        <div className="font-mono text-xs text-zinc-200 bg-[#080711]/60 p-2 rounded-lg border border-[#4c227b]/20">
                          {msg.commandText}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Assistant / Local-BE Response Bubble */}
                  {msg.sender === "local_be" && msg.response && (
                    <div className="flex justify-start">
                      {/* LAYOUT A: Task Completion Notification Bubble */}
                      {msg.isCompletionNotice ? (
                        <div
                          className={`w-full max-w-2xl rounded-2xl border backdrop-blur-xl p-4 shadow-xl space-y-3 transition-all ${
                            msg.response.isSuccess
                              ? "bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20"
                              : "bg-rose-950/20 border-rose-500/40 shadow-rose-950/20"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {msg.response.isSuccess ? (
                                <div className="h-7 w-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                                  <CheckCheck className="h-4 w-4" />
                                </div>
                              ) : (
                                <div className="h-7 w-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                                  <AlertCircle className="h-4 w-4" />
                                </div>
                              )}
                              <div>
                                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                                  {msg.response.isSuccess
                                    ? "Background Task Completed"
                                    : "Background Task Terminated / Failed"}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">
                                  {msg.response.taskId}{" "}
                                  {msg.response.pid
                                    ? `(PID: ${msg.response.pid})`
                                    : ""}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                msg.response.isSuccess
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              }`}
                            >
                              EXIT CODE: {msg.response.exitCode ?? 0}
                            </span>
                          </div>

                          <p className="text-xs text-zinc-200">
                            {msg.response.msg}
                          </p>

                          {/* Quick Actions & Final Logs */}
                          <div className="flex items-center justify-between pt-1">
                            <button
                              onClick={() => {
                                if (msg.response?.taskId) {
                                  setSelectedTaskId(msg.response.taskId);
                                  setIsDrawerOpen(true);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#140d24] border border-[#4c227b]/50 text-xs text-[#d8b4fe] hover:border-[#a855f7] flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Terminal className="h-3 w-3" />
                              View Final Output in Drawer
                            </button>

                            <button
                              onClick={() =>
                                handleCopyLogs(
                                  msg.response!.taskId || "task",
                                  msg.response!.terminalOutput,
                                )
                              }
                              className="p-1.5 rounded hover:bg-[#140d24] text-zinc-400 hover:text-white transition-colors"
                              title="Copy Output"
                            >
                              {copiedTaskId === msg.response.taskId ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* LAYOUT B: Standard Command Output / Running Task Card */
                        <div className="w-full max-w-2xl rounded-2xl bg-[#140d24]/70 border border-[#4c227b]/40 backdrop-blur-xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)] space-y-3">
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-md bg-[#a855f7]/20 border border-[#a855f7]/30 flex items-center justify-center text-[#a855f7]">
                                <Terminal className="h-3 w-3" />
                              </div>
                              <span className="text-xs font-semibold text-zinc-200">
                                Local-BE Output
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-mono">
                              {msg.response.executionTimeMs !== undefined && (
                                <span className="text-zinc-500 text-[10px]">
                                  {msg.response.executionTimeMs}ms
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  msg.response.isSuccess
                                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                {msg.response.isSuccess ? "SUCCESS" : "FAILED"}
                              </span>
                            </div>
                          </div>

                          {/* Main Message Pill */}
                          <p className="text-xs text-zinc-300 font-medium">
                            {msg.response.msg}
                          </p>

                          {/* Dynamic Task Card (Morphs from Running -> Completed) */}
                          {msg.response.taskId && (
                            <div
                              className={`rounded-xl border p-3.5 space-y-3 transition-all ${
                                taskStatus === "completed"
                                  ? "bg-emerald-950/20 border-emerald-500/40"
                                  : taskStatus === "failed"
                                    ? "bg-rose-950/20 border-rose-500/40"
                                    : taskStatus === "killed"
                                      ? "bg-amber-950/20 border-amber-500/40"
                                      : "bg-[#080711]/90 border-[#4c227b]/50 shadow-inner"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  {taskStatus === "running" && (
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                  )}
                                  {taskStatus === "completed" && (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  )}
                                  {taskStatus === "failed" && (
                                    <XCircle className="h-4 w-4 text-rose-400" />
                                  )}
                                  {taskStatus === "killed" && (
                                    <Square className="h-3.5 w-3.5 text-amber-400" />
                                  )}

                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-bold text-white">
                                        {msg.response.taskId}
                                      </span>
                                      <span
                                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase font-bold ${
                                          taskStatus === "running"
                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                            : taskStatus === "completed"
                                              ? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
                                              : taskStatus === "killed"
                                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                        }`}
                                      >
                                        {taskStatus}
                                      </span>
                                    </div>
                                    {msg.response.pid && (
                                      <span className="text-[10px] font-mono text-zinc-400">
                                        PID: {msg.response.pid}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() =>
                                      handlePeekTask(msg.response!.taskId!)
                                    }
                                    className="px-2.5 py-1 rounded bg-[#140d24] border border-[#4c227b]/40 hover:border-[#a855f7] text-[11px] text-[#d8b4fe] flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Eye className="h-3 w-3" />
                                    Peek Logs
                                  </button>

                                  {taskStatus === "running" &&
                                    msg.response.pid && (
                                      <button
                                        onClick={() =>
                                          handleKillTask(
                                            msg.response!.taskId!,
                                            msg.response!.pid!,
                                          )
                                        }
                                        className="px-2.5 py-1 rounded bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-[11px] text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <Square className="h-3 w-3" />
                                        Kill
                                      </button>
                                    )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Terminal Output Accordion / Live Streaming View */}
                          {displayLogs ? (
                            <div className="rounded-lg bg-[#080711] border border-[#4c227b]/30 p-2.5 font-mono text-xs text-zinc-300 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap select-text space-y-1">
                              <div className="text-[10px] text-zinc-500 pb-1 mb-1 border-b border-[#4c227b]/20 flex items-center justify-between font-sans">
                                <span className="flex items-center gap-1.5 font-mono">
                                  <Terminal className="h-3 w-3 text-[#a855f7]" />
                                  Stdout / Stream Output{" "}
                                  {taskStatus === "running"
                                    ? "(Live Streaming...)"
                                    : ""}
                                </span>
                                {taskStatus === "running" && (
                                  <span className="flex items-center gap-1 text-emerald-400 text-[9px] font-mono font-bold">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    RECEIVING LOGS
                                  </span>
                                )}
                              </div>
                              <div className="font-mono">
                                <Ansi linkify>{formatAnsi(displayLogs)}</Ansi>
                              </div>
                            </div>
                          ) : null}

                          {/* Terminal Error Stream / Banner */}
                          {displayError ? (
                            <div className="rounded-lg bg-rose-950/20 border border-rose-500/30 p-2.5 font-mono text-xs text-rose-300 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap select-text space-y-1">
                              <div className="text-[10px] text-rose-400 pb-1 mb-1 border-b border-rose-500/20 font-semibold flex items-center gap-1.5 font-sans">
                                <AlertCircle className="h-3 w-3 text-rose-400" />
                                Stderr Stream / Notice
                              </div>
                              <div className="font-mono">
                                <Ansi linkify>{formatAnsi(displayError)}</Ansi>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Command Input Bar */}
        <div className="shrink-0 p-4 border-t border-[#4c227b]/30 bg-[#080711]/95 backdrop-blur-md space-y-2.5">
          {/* Toggles row */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDaemon}
                  onChange={(e) => setIsDaemon(e.target.checked)}
                  className="rounded border-[#4c227b] text-[#a855f7] focus:ring-[#a855f7]"
                />
                <span className={isDaemon ? "text-amber-400 font-medium" : ""}>
                  Run as Daemon (isDaemon: true)
                </span>
              </label>

              <div className="flex items-center gap-1.5">
                <span>Timeout:</span>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 rounded bg-[#140d24] border border-[#4c227b]/40 text-xs font-mono text-white text-center"
                />
                <span>sec</span>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#140d24] p-0.5 rounded-lg border border-[#4c227b]/30 text-[11px]">
              <button
                onClick={() => setSchemaMode("simple")}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  schemaMode === "simple"
                    ? "bg-[#a855f7] text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Simple CLI
              </button>
              <button
                onClick={() => setSchemaMode("ai_schema")}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  schemaMode === "ai_schema"
                    ? "bg-[#a855f7] text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                AI JSON Schema
              </button>
            </div>
          </div>

          {/* Simple Mode Input */}
          {schemaMode === "simple" ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputCmd}
                  onChange={(e) => setInputCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleExecute(inputCmd, isDaemon, timeoutSec);
                    }
                  }}
                  placeholder="Type a PowerShell / shell command (e.g. dir, ping 127.0.0.1, npm run dev)..."
                  className="w-full px-4 py-2.5 rounded-xl bg-[#140d24]/90 border border-[#4c227b]/50 text-white placeholder-zinc-500 font-mono text-xs focus:outline-none focus:border-[#a855f7] focus:ring-1 focus:ring-[#a855f7]"
                />
              </div>

              <button
                onClick={() => handleExecute(inputCmd, isDaemon, timeoutSec)}
                disabled={!inputCmd.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#a855f7] hover:bg-[#c084fc] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                Run
              </button>
            </div>
          ) : (
            /* AI JSON Schema Mode */
            <div className="space-y-2">
              <textarea
                value={rawSchema}
                onChange={(e) => setRawSchema(e.target.value)}
                rows={4}
                className="w-full p-2.5 rounded-xl bg-[#140d24]/90 border border-[#4c227b]/50 text-zinc-200 font-mono text-xs focus:outline-none focus:border-[#a855f7]"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(rawSchema);
                      const cmd = parsed.param?.command || parsed.command || "";
                      const daemon = parsed.isDaemon ?? false;
                      const timeout = parsed.timeout ?? 0;
                      handleExecute(cmd, daemon, timeout);
                    } catch (e: any) {
                      alert("Invalid JSON: " + e.message);
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg bg-[#a855f7] text-white text-xs font-semibold hover:bg-[#c084fc] cursor-pointer"
                >
                  Dispatch AI Schema
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Tasks & Terminal Streaming Drawer */}
      {isDrawerOpen && (
        <div className="w-[450px] shrink-0 h-full flex flex-col bg-[#080711] border-l border-[#4c227b]/40">
          {/* Drawer Header */}
          <div className="h-14 px-4 border-b border-[#4c227b]/40 bg-[#140d24]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#a855f7]" />
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                Tasks Registry & Live Terminal
              </h2>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-[#4c227b]/20 cursor-pointer"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          {/* Active Tasks List (Pill Tabs) - Safe from nulls */}
          <div className="p-3 border-b border-[#4c227b]/20 bg-[#140d24]/40 flex gap-1.5 overflow-x-auto">
            {activeTasksList.length === 0 ? (
              <span className="text-[11px] text-zinc-500 font-mono py-1">
                No active background tasks yet.
              </span>
            ) : (
              activeTasksList.map((t) => (
                <button
                  key={t.taskId}
                  onClick={() => setSelectedTaskId(t.taskId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedTaskId === t.taskId
                      ? "bg-[#a855f7] text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                      : "bg-[#140d24] text-zinc-400 border border-[#4c227b]/30 hover:text-white"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      t.status === "running"
                        ? "bg-emerald-400 animate-pulse"
                        : t.status === "completed"
                          ? "bg-zinc-400"
                          : "bg-rose-400"
                    }`}
                  />
                  {t.taskId}
                </button>
              ))
            )}
          </div>

          {/* Selected Task Details & Live Terminal */}
          {selectedTask ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Task Meta Toolbar */}
              <div className="p-3 border-b border-[#4c227b]/20 bg-[#140d24]/20 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono text-white text-xs font-semibold flex items-center gap-2">
                    {selectedTask.taskId}
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase font-bold ${
                        selectedTask.status === "running"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : selectedTask.status === "completed"
                            ? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {selectedTask.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[220px]">
                    {selectedTask.command}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-[#090d16] p-0.5 rounded border border-[#4c227b]/30 mr-1">
                    <button
                      type="button"
                      onClick={() => setTerminalViewMode("interactive")}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                        terminalViewMode === "interactive"
                          ? "bg-[#a855f7]/30 text-white font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      VS Code Terminal
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalViewMode("raw")}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                        terminalViewMode === "raw"
                          ? "bg-[#a855f7]/30 text-white font-semibold"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Raw Logs
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      handleCopyLogs(selectedTask.taskId, selectedTask.logs)
                    }
                    className="p-1.5 rounded hover:bg-[#4c227b]/30 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="Copy Logs"
                  >
                    {copiedTaskId === selectedTask.taskId ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {selectedTask.status === "running" && (
                    <button
                      onClick={() =>
                        handleKillTask(selectedTask.taskId, selectedTask.pid)
                      }
                      className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="h-2.5 w-2.5" />
                      Kill PID {selectedTask.pid}
                    </button>
                  )}
                </div>
              </div>

              {/* Terminal Viewport */}
              <div className="flex-1 p-3 bg-[#080711] overflow-hidden flex flex-col font-mono text-xs text-zinc-300">
                <div className="text-zinc-500 text-[10px] pb-2 border-b border-[#4c227b]/20 mb-2 flex items-center justify-between shrink-0">
                  <span>
                    [Nexus Terminal Stream] Started: {selectedTask.startedAt}
                    {selectedTask.completedAt
                      ? ` | Finished: ${selectedTask.completedAt}`
                      : ""}
                  </span>
                  {selectedTask.exitCode !== undefined &&
                    selectedTask.exitCode !== null && (
                      <span className="font-bold text-zinc-300">
                        Exit Code: {selectedTask.exitCode}
                      </span>
                    )}
                </div>

                {terminalViewMode === "interactive" ? (
                  <div className="flex-1 w-full h-full min-h-[300px] overflow-hidden">
                    <XTerminal
                      key={selectedTask.taskId}
                      taskId={selectedTask.taskId}
                      localBeUrl={localBeUrl}
                      logs={selectedTask.logs}
                      isCompleted={selectedTask.status !== "running"}
                    />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text space-y-1">
                    {selectedTask.logs ? (
                      <Ansi linkify>{formatAnsi(selectedTask.logs)}</Ansi>
                    ) : (
                      "Waiting for task logs..."
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                )}
              </div>

              {/* Interactive Stdin Bar (Only shown when task is running) */}
              {selectedTask.status === "running" && (
                <form
                  onSubmit={handleSendStdin}
                  className="px-3 py-2 border-t border-[#4c227b]/30 bg-[#080711] flex items-center gap-2"
                >
                  <span className="text-xs font-mono text-[#a855f7] font-bold select-none">
                    &gt;
                  </span>
                  <input
                    type="text"
                    value={taskStdin}
                    onChange={(e) => setTaskStdin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        sendRawKeystroke("\x1b[A");
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        sendRawKeystroke("\x1b[B");
                      } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        sendRawKeystroke("\x1b[D");
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        sendRawKeystroke("\x1b[C");
                      }
                    }}
                    placeholder="Type or use keyboard arrows ↑ / ↓ ... (or click terminal)"
                    disabled={isSendingStdin}
                    className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />

                  {/* Quick Arrow & Action Buttons */}
                  <div className="flex items-center gap-1 border-l border-[#4c227b]/30 pl-2">
                    <button
                      type="button"
                      onClick={() => sendRawKeystroke("\x1b[A")}
                      className="px-1.5 py-0.5 rounded bg-[#140d24] hover:bg-[#a855f7]/30 border border-[#4c227b]/40 text-zinc-300 hover:text-white text-[11px] font-mono cursor-pointer transition-colors"
                      title="Up Arrow (↑)"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRawKeystroke("\x1b[B")}
                      className="px-1.5 py-0.5 rounded bg-[#140d24] hover:bg-[#a855f7]/30 border border-[#4c227b]/40 text-zinc-300 hover:text-white text-[11px] font-mono cursor-pointer transition-colors"
                      title="Down Arrow (↓)"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRawKeystroke("\r")}
                      className="px-1.5 py-0.5 rounded bg-[#140d24] hover:bg-[#a855f7]/30 border border-[#4c227b]/40 text-zinc-300 hover:text-white text-[10px] font-mono cursor-pointer transition-colors"
                      title="Enter (↵)"
                    >
                      ↵
                    </button>
                    <button
                      type="button"
                      onClick={() => sendRawKeystroke("\x03")}
                      className="px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-[10px] font-mono cursor-pointer transition-colors"
                      title="Abort (Ctrl+C)"
                    >
                      ^C
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingStdin}
                    className="px-2.5 py-1 rounded bg-[#a855f7]/20 border border-[#a855f7]/40 hover:bg-[#a855f7]/30 text-[#d8b4fe] text-[11px] font-mono font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Send className="h-3 w-3" />
                    Send
                  </button>
                </form>
              )}

              {/* Terminal Footer Bar */}
              <div className="h-8 px-3 border-t border-[#4c227b]/20 bg-[#140d24]/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScrollTerminal}
                    onChange={(e) => setAutoScrollTerminal(e.target.checked)}
                    className="rounded border-[#4c227b] text-[#a855f7]"
                  />
                  <span>Auto-scroll</span>
                </label>

                <button
                  onClick={() => handlePeekTask(selectedTask.taskId)}
                  className="hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500 text-xs">
              <Terminal className="h-8 w-8 text-[#4c227b]/40 mb-2" />
              Select a task from above to monitor its live logs.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
