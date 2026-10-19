import WebSocket from "ws";
import { WebSocketService } from "./websocket.main.service.js";
import { BaseWSSession } from "./BaseSession.js";
import { AskAI } from "../../AI/AskAI_OOP.js";
import { newSession } from "../../middlewares/auth/sessionVerification.js";
import { SessionModel } from "../../db/schema/session-schema.js";
import { backgroundSummarize } from "../../AI/AskAI.js";

export class ClientSession extends BaseWSSession {
  constructor(ws: WebSocket, userId: string) {
    super(ws, userId);
    this.init();
  }
  // Share property in the react frontend which let the tabs in sync (todo)

  protected override async onMessage(data: any) {
    try {
      const parsed = JSON.parse(data.toString());
      const { type } = parsed;
      switch (type) {
        case "ping":
          this.send({ type: "pong" });
          break;

        case "get_devices": {
          const devices = await WebSocketService.GetDevices(this.userId);
          this.send({
            type: "device_list",
            devices,
          });
          break;
        }
        case "stop_ai": {
          if (parsed.sessionId) {
            const runner = AskAI.activeRunners.get(parsed.sessionId);
            if (runner) {
              runner.abort();
            }
            // Unlock UI on all user tabs
            WebSocketService.sendToClient(this.userId, {
              type: "stoped_response",
              sessionId: parsed.sessionId,
            });
          }
          break;
        }
        case "sync_session": {
          const { sessionId } = parsed;
          if (sessionId) {
            const liveState = WebSocketService.activeSessions.get(sessionId);
            this.send({
              type: "session_state",
              sessionId,
              isRunning: !!liveState,
              data: liveState
                ? {
                    workingon: liveState.workingon,
                    executions: liveState.executions,
                    userMessage: liveState.userMessage,
                    middleMsg: liveState.middleMsg || "",
                  }
                : null,
            });
          }
          break;
        }
        case "chat_send": {
          const { content, model, deviceId } = parsed;
          let targetSessionId = parsed?.sessionId;
          if (!targetSessionId) {
            const targetSession = await newSession(this.userId);

            if (!targetSession.success) {
              this.send({
                type: "ai_done",
                sessionId: null,
                data: {
                  workingon: "",
                  message: {
                    role: "assistant",
                    content: {
                      lastAIMsg:
                        targetSession.message || "⚠️ Error creating session",
                      lastCMD: "",
                      terminal: "",
                      terminalError: "Could not create new session.",
                      executions: [],
                      workedSeconds: 0,
                    },
                  },
                },
              });
              return;
            }

            targetSessionId = targetSession.sessionId.toString();
            this.send({
              type: "session_created",
              sessionId: targetSessionId,
            });
          }
          const liveState =
            WebSocketService.activeSessions.get(targetSessionId);
          if (liveState !== undefined) {
            this.send({
              type: "session_state",
              sessionId: targetSessionId,
              isRunning: true,
              data: {
                workingon: liveState.workingon,
                executions: liveState.executions,
                userMessage: liveState.userMessage,
              },
            });
            break;
          }

          if (!deviceId) {
            this.send({
              type: "ai_done",
              sessionId: targetSessionId,
              data: {
                workingon: "",
                message: {
                  role: "assistant",
                  content: {
                    lastAIMsg: "⚠️ Please select a target device first.",
                    lastCMD: "",
                    terminal: "",
                    terminalError: "No device selected.",
                    executions: [],
                    workedSeconds: 0,
                  },
                },
              },
            });
            return;
          }
          WebSocketService.activeSessions.set(targetSessionId, {
            userId: this.userId,
            sessionId: targetSessionId,
            userMessage: content.toString(),
            workingon: "Analyzing your request...",
            executions: [],
          });
          WebSocketService.sendToClient(this.userId, {
            type: "new_user_message",
            sessionId: targetSessionId,
            message: {
              role: "user",
              content,
              timestamp: new Date().toISOString(),
            },
          });
          // Chat session summarizer call here (optional) , Current is hardcoded to split version
          const ChatTitleSnippet =
            content.split(" ").slice(0, 4).join(" ") + "...";
          await SessionModel.updateOne(
            { _id: targetSessionId },
            { title: ChatTitleSnippet },
          );
          const selectedModel = model || {
            provider: "gemini",
            name: "gemini-3.7-flash",
            isLiveModel: false,
          };
          const userDevices = WebSocketService.deviceClients.get(this.userId);
          const targetDevice = userDevices?.get(deviceId);
          if (!targetDevice || targetDevice.ws.readyState !== 1) {
            this.send({
              type: "ai_done",
              sessionId: targetSessionId,
              data: {
                workingon: "",
                message: {
                  role: "assistant",
                  content: {
                    lastAIMsg: `The selected device ${targetDevice?.deviceName} is currently offline.`,
                    lastCMD: "",
                    terminal: "",
                    terminalError: "Target device is offline.",
                    executions: [],
                    workedSeconds: 0,
                  },
                },
              },
            });
            break;
          }
          const aiRunner = new AskAI(
            this.userId,
            targetSessionId,
            content,
            selectedModel,
            targetDevice.deviceId,
          );

          aiRunner
            .run()
            .then((result) => {
              WebSocketService.sendToClient(this.userId, {
                type: "ai_done",
                sessionId: targetSessionId,
                data: {
                  workingon: "",
                  message: {
                    role: "assistant",
                    content: {
                      lastAIMsg: result.msg || "No message from AI",
                      lastCMD: result.cmd || "",
                      terminal: result.terminalOutput || "",
                      terminalError: result.terminalError || "",
                      executions: result.executions || [],
                      imageBase64: result.imageBase64 || "",
                      workedSeconds: result.workedSeconds || 0,
                    },
                    executions: result.executions || [],
                    imageBase64: result.imageBase64 || "",
                    workedSeconds: result.workedSeconds || 0,
                  },
                },
              });
              backgroundSummarize(this.userId, targetSessionId);
            })
            .catch((err: any) => {
              console.error(
                "[WS_OOP chat_send] AskAI error:",
                err?.message || err,
              );
              WebSocketService.sendToClient(this.userId, {
                type: "ai_done",
                sessionId: targetSessionId,
                data: {
                  workingon: "",
                  message: {
                    role: "assistant",
                    content: {
                      lastAIMsg: "AI encountered an issue. Please try again.",
                      lastCMD: "",
                      terminal: "",
                      terminalError: err?.message || "Execution error",
                      executions: [],
                      imageBase64: "",
                      workedSeconds: 0,
                    },
                    executions: [],
                    imageBase64: "",
                    workedSeconds: 0,
                  },
                },
              });
            })
            .finally(() => {
              WebSocketService.activeSessions.delete(targetSessionId);
            });
        }

        default:
          break;
      }
    } catch (error) {
      console.error("Invalid JSON", error);
    }
  }

  protected async init() {
    this.isAuthenticated = !!this.userId;
    let tabs = WebSocketService.userClients.get(this.userId);
    if (!tabs) {
      tabs = new Set();
      WebSocketService.userClients.set(this.userId, tabs);
    }
    tabs.add(this);
    this.send({ type: "PairingSuccess" });

    // Immediately push live device list on client tab connection / page refresh!
    try {
      const devices = await WebSocketService.GetDevices(this.userId);
      this.send({
        type: "device_list",
        devices,
      });
    } catch (err) {
      console.error("[WS] Error sending initial device_list to tab:", err);
    }
  }

  protected onClose() {
    console.log(`Web Client Disconected (${this.userId})`);
    const tabs = WebSocketService.userClients.get(this.userId);
    if (tabs) {
      tabs.delete(this);
      if (tabs.size === 0) {
        WebSocketService.userClients.delete(this.userId);
      }
    }
  }
}
