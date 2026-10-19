import { useUserCredentials } from "@/app/store/useUserCredentials";
import useChat from "@/app/store/useChat";
import { useDevices } from "@/app/store/useDevices";
let activeSocket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const sleep = async (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const WebSocketInit = async (): Promise<WebSocket | undefined> => {
  if (typeof window === "undefined") return;

  const token = useUserCredentials.getState().token;
  if (!token) return;

  // Prevent multiple parallel connecting or open sockets
  if (
    activeSocket &&
    (activeSocket.readyState === WebSocket.OPEN ||
      activeSocket.readyState === WebSocket.CONNECTING)
  ) {
    return activeSocket;
  }

  // Clear any existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const wsUrl =
    process.env.NEXT_PUBLIC_WS_URL || "wss://nexus-v2-e38m.onrender.com/";
  const ws = new WebSocket(`${wsUrl}`);
  activeSocket = ws;

  ws.onopen = () => {
    activeSocket = ws;
    ws.send(JSON.stringify({ type: "auth", token }));
    ws.send(JSON.stringify({ type: "get_devices" }));
    const currentSesssion = useChat.getState().session;
    if (currentSesssion) {
      ws.send(
        JSON.stringify({ type: "sync_session", sessionId: currentSesssion }),
      );
    }
  };
  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("nexus_ws_message", { detail: payload }),
        );
      }

      if (payload.type === "device_list") {
        useDevices.getState().setDevices(payload.devices);
      } else if (payload.type === "stoped_response") {
        useChat.getState().setWorkingOn(null);
        useChat.getState().setMiddleMsg(null);
        useChat.getState().setLiveExecutions([]);
        window.dispatchEvent(
          new CustomEvent("nexus_ai_done", {
            detail: { sessionId: payload.sessionId },
          }),
        );
      } else if (payload.type === "device_status") {
        const deviceId = payload.device?.id || payload.deviceId;
        if (deviceId) {
          if (payload.online !== undefined) {
            useDevices
              .getState()
              .setOnlineDevices(deviceId, payload.online, payload.status);
          }
          // Save the ipAddress sent by Local-BE on first connect (note: backend uses lowercase 'ipaddress')
          const ip =
            payload.device?.ipaddress ||
            payload.device?.ipAddress ||
            payload.ipAddress;
          if (ip) {
            useDevices.getState().setIpAddress(deviceId, ip);
          }
          if (payload.service !== undefined) {
            useDevices.getState().setService(deviceId, payload.service);
          }
        }
      } else if (payload.type === "device_removed") {
        useDevices
          .getState()
          .setDevices(
            useDevices
              .getState()
              .devices.filter((d) => d.id !== payload.deviceId),
          );
      } else if (payload.type === "ai_data") {
        const currentSession = useChat.getState().session;
        const isMatchedToCurrSession =
          Boolean(currentSession) &&
          (!payload.sessionId || payload.sessionId === currentSession);
        if (!isMatchedToCurrSession) {
          return;
        }
        useChat.getState().setMiddleMsg(null);
        const nextWorking = payload.data?.workingon || payload.data?.workingOn;
        if (nextWorking) {
          useChat.getState().setWorkingOn(nextWorking);
        }
        if (payload.data?.executions) {
          useChat.getState().setLiveExecutions(payload.data.executions);
        }
      } else if (payload.type === "ai_done") {
        const currentSession = useChat.getState().session;
        const isMatchedToCurrSession =
          Boolean(currentSession) &&
          (!payload.sessionId || payload.sessionId === currentSession);
        if (isMatchedToCurrSession) {
          useChat.getState().setWorkingOn(null);
          useChat.getState().setMiddleMsg(null);
          useChat.getState().setLiveExecutions([]);
        }
        const result = payload.data?.message?.content ?? payload.data?.message;
        if (result && isMatchedToCurrSession) {
          const chatList = useChat.getState().chat;
          const lastMsg = chatList[chatList.length - 1];
          const newAIMsg = result.msg || result.lastAIMsg || "";
          const alreadyAdded =
            lastMsg &&
            lastMsg.role === "assistant" &&
            (typeof lastMsg.content === "object"
              ? lastMsg.content.lastAIMsg === newAIMsg ||
                lastMsg.content.msg === newAIMsg
              : lastMsg.content === newAIMsg);

          if (!alreadyAdded) {
            useChat.getState().addChat({
              role: "assistant",
              content: {
                lastAIMsg: result.msg || result.lastAIMsg || "",
                lastCMD: result.cmd || result.lastCMD || "",
                terminal: result.terminalOutput || result.terminal || "",
                terminalError: result.terminalError || "",
                imageBase64: result.imageBase64 || "",
                workedSeconds: result.workedSeconds || 0,
              },
              executions: result.executions || [],
              imageBase64: result.imageBase64 || "",
              workedSeconds: result.workedSeconds || 0,
            });
          }
        }
        // Unlock the send button on the active chat
        window.dispatchEvent(
          new CustomEvent("nexus_ai_done", {
            detail: { sessionId: payload.sessionId },
          }),
        );
      } else if (payload.type === "session_state") {
        const currentSession = useChat.getState().session;
        if (payload.sessionId === currentSession) {
          if (payload.isRunning && payload.data) {
            const nextWorking =
              payload.data.workingon ||
              payload.data.workingOn ||
              "Nexus is working...";
            useChat.getState().setWorkingOn(nextWorking);
            useChat.getState().setLiveExecutions(payload.data.executions || []);
            if (payload.data.userMessage) {
              const chatList = useChat.getState().chat;
              const exists = chatList.some(
                (m) =>
                  m.role === "user" && m.content === payload.data.userMessage,
              );
              !exists &&
                useChat.getState().addChat({
                  role: "user",
                  content: payload.data.userMessage,
                  timestamp: payload.data.timestamp,
                });
            }
            if (payload.data.middleMsg)
              useChat.getState().setMiddleMsg(payload.data.middleMsg);
          } else {
            useChat.getState().setWorkingOn(null);
            useChat.getState().setLiveExecutions([]);
            useChat.getState().setMiddleMsg(null);
          }
        }
      } else if (payload.type === "session_created") {
        if (payload.sessionId) {
          useChat.getState().setSession(payload.sessionId);
          window.dispatchEvent(
            new CustomEvent("nexus_session_created", {
              detail: { sessionId: payload.sessionId },
            }),
          );
        }
      } else if (payload.type === "new_user_message") {
        const currentSession = useChat.getState().session;
        if (payload.sessionId === currentSession) {
          const chatList = useChat.getState().chat;
          const lastMsg = chatList[chatList.length - 1];
          if (
            lastMsg &&
            lastMsg.role === "user" &&
            lastMsg.content === payload.message?.content
          ) {
            return;
          }
          useChat.getState().addChat(payload.message);
        }
      } else if (payload.type === "cmd_chunk") {
        if (payload.chunk) {
          useChat.getState().appendLiveTerminal(payload.chunk);
        }
      } else if (payload.type === "background_running") {
        const currentSession = useChat.getState().session;
        if (payload.sessionId && currentSession === payload.sessionId) {
          useChat.getState().setMiddleMsg(payload.msg);
          useChat
            .getState()
            .setWorkingOn(payload.workingon || "Executing in background...");
        }
      } else if (payload.type === "PairingSuccess") {
        console.info("\x1b[32m[WS] Paring Successfull!\x1b[0m");
      }
    } catch {
      // ignore parse error
    }
  };
  ws.onclose = () => {
    if (activeSocket === ws) {
      activeSocket = null;
    }
    useChat.getState().setWorkingOn(null);
    console.log("[WS] Disconnected. Reconnecting in 5s...");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      WebSocketInit();
    }, 5000);
  };
  ws.onerror = (error) => {
    console.error("[WS] Connection error:", error);
    // onclose will handle reconnection cleanly; do not trigger duplicates here
  };
  return ws;
};
export const requestDevices = () => {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify({ type: "get_devices" }));
  } else if (activeSocket && activeSocket.readyState === WebSocket.CONNECTING) {
    activeSocket.addEventListener(
      "open",
      () => {
        try {
          activeSocket?.send(JSON.stringify({ type: "get_devices" }));
        } catch {}
      },
      { once: true },
    );
  } else {
    WebSocketInit();
  }
};

export const sendWsJson = (payload: object) => {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify(payload));
  } else {
    console.warn("WebSocket not connected");
  }
};
export default WebSocketInit;
