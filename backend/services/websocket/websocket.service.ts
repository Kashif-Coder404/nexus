import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { generateToken, verifyToken } from "../jwt.service.js";
import { UserModel } from "../../db/schema/user-schema.js";
import { CommandParserResponseType } from "../../AI/Types/ParserTypes.js";
import { Types } from "mongoose";
import { SessionModel } from "../../db/schema/session-schema.js";
import chatSummarize from "../../AI/Helper/chatname.summarizer.js";
import { getChat, setChat } from "../chat.history.service.js";
import { summarize } from "../../AI/Helper/para.summarizer.js";
import { ChatMessageType } from "../../AI/Types.js";
import { newSession } from "../../middlewares/auth/sessionVerification.js";
import {
  ActiveBackgroundTask,
  ActiveSessions,
  CustomWebSocket,
  PendingTask,
} from "./Types.js";
import { JwtPayload } from "jsonwebtoken";
import { AskAI } from "../../AI/AskAI_OOP.js";

export const activeSessions = new Map<string, ActiveSessions>();

const pendingRequests = new Map();
export const activeBackgroundTasks = new Map<string, ActiveBackgroundTask>();
const pendingTasks = new Map<string, PendingTask>();

//Main
let wss: WebSocketServer;
function sendJson(ws: WebSocket, payload: Record<string, any>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function resetWatchdog(ws: CustomWebSocket) {
  if (ws.deviceId === "web_client" && (ws as any).watchdogTimer) {
    clearTimeout((ws as any).watchdogTimer);
    (ws as any).watchdogTimer = null;
    return;
  }
  if ((ws as any).watchdogTimer) {
    clearTimeout((ws as any).watchdogTimer);
  }
  ws.isAlive = true;
  (ws as any).watchdogTimer = setTimeout(() => {
    ws.isAlive = false;
    if (ws.userId && ws.deviceId) {
      sendToUser(ws.userId, {
        type: "device_status",
        device: { deviceName: ws.deviceName, id: ws.deviceId },
        online: false,
      });
    }
    ws.terminate();
  }, 40000);
}
const connectDevice = async (
  ws: CustomWebSocket,
  token: string,
  ipaddress: string,
  service?: boolean,
): Promise<void> => {
  const actualToken = token.startsWith("Bearer ") ? token.slice(7) : token;
  const decodedToken = verifyToken(actualToken) as JwtPayload;
  const decodedUserId =
    (decodedToken.token?.userId as string) ||
    ((decodedToken.token as any)?.id as string);

  const decodedDeviceId =
    (decodedToken.token?.deviceId as string) ||
    ((decodedToken.token as any)?.deviceId as string);

  let deviceName = "";

  if (!decodedToken.success || !decodedUserId) {
    sendJson(ws, {
      type: "PairingFailed",
      message: "Invalid token or Expired",
      data: null,
    });
    return;
  }

  if (decodedDeviceId) {
    const user = await UserModel.findOne({
      _id: decodedUserId,
      "devices._id": decodedDeviceId,
      "devices.deviceToken": actualToken,
    });
    deviceName =
      user?.devices?.find((d) => d._id.toString() === decodedDeviceId)
        ?.deviceName || "";
    if (!user) {
      sendJson(ws, {
        type: "PairingFailed",
        message: "Device has been revoked.",
        data: null,
      });
      return;
    }
  } else {
    const user = await UserModel.findById(decodedUserId);
    if (!user) {
      sendJson(ws, {
        type: "PairingFailed",
        message: "User not found.",
        data: null,
      });
      return;
    }
  }
  ws.isAlive = true;
  ws.isAuthenticated = true;
  ws.userId = decodedUserId;
  ws.deviceId = decodedDeviceId || "web_client";
  ws.deviceName = deviceName;
  ws.ipAddress = ipaddress;
  ws.service = typeof service === "boolean" ? service : true;
  console.log(
    `[WS] Authenticated ${decodedDeviceId ? `device ${decodedDeviceId}` : "web client"} for user ${decodedUserId}`,
  );
  if (ws.deviceId === "web_client" && (ws as any).watchdogTimer) {
    clearTimeout((ws as any).watchdogTimer);
    (ws as any).watchdogTimer = null;
  }
  if (decodedDeviceId) {
    sendToUser(decodedUserId, {
      type: "device_status",
      device: {
        deviceName: deviceName,
        id: decodedDeviceId,
        ipaddress: ws.ipAddress,
      },
      online: true,
      service: ws.service,
    });
  } else {
    await sendDeviceStatus(ws, decodedUserId);
  }
};

const initWebsocket = (server: Server) => {
  wss = new WebSocketServer({ server });

  wss.on("connection", async (ws: CustomWebSocket, req: any) => {
    const url = new URL(
      req.url || "",
      `http://${req.headers.host || "localhost"}`,
    );
    const queryToken = url.searchParams.get("token");
    const authHeader =
      req.headers["authorization"] ||
      req.headers["Authorization"] ||
      queryToken;
    const ipHeader = req.headers["ipaddress"] || req.headers["ipAddress"];
    if (authHeader) {
      await connectDevice(ws, authHeader, ipHeader as string);
    }
    resetWatchdog(ws);
 
    ws.on("message", async (event: any) => {
      try {
        const data = event.toString();
        const parsedData = JSON.parse(data);

        const { type } = parsedData;

        //Need to make it to the OOPs but later

        switch (type) {
          case "ping": {
            resetWatchdog(ws);
            if (typeof parsedData.service === "boolean") {
              ws.service = parsedData.service;
            }
            sendJson(ws, { type: "pong" });
            break;
          }
          case "PairingInit": {
            ws.pairingCode = parsedData.code;
            break;
          }

          case "auth": {
            if (parsedData.token) {
              await connectDevice(
                ws,
                parsedData.token,
                parsedData.ipAddress || parsedData.ipaddress || ipHeader,
                parsedData.service,
              );
            }
            break;
          }
          case "stop_ai": {
            if (ws.isAuthenticated && ws.userId) {
              const runner = AskAI.activeRunners.get(parsedData.sessionId);
              if (runner) {
                runner.abort();
              }
              //Stop the workingon message on the frontend
              sendToUser(ws.userId, {
                type: "stoped_response",
                sessionId: parsedData.sessionId,
              });
            }
            break;
          }
          case "get_devices": {
            if (ws.isAuthenticated && ws.userId) {
              await sendDeviceStatus(ws, ws.userId);
            }
            break;
          }

          case "device_status": {
            if (ws.isAuthenticated && ws.deviceId) {
              // Broadcast to the user's frontend web client
              ws.service = parsedData.service;
              if (parsedData.ipAddress) {
                ws.ipAddress = parsedData.ipAddress;
              }
              sendToUser(ws.userId!, {
                type: "device_status",
                device: {
                  deviceName: ws.deviceName,
                  id: ws.deviceId,
                  ipAddress: ws.ipAddress,
                },
                online: true,
                service: parsedData.service,
              });
            }
            break;
          }

          case "cmd_response": {
            if (ws.isAuthenticated) {
              const { requestId, cmdResponse } = parsedData;
              const requestHandler = pendingRequests.get(requestId);
              if (requestHandler) {
                if (requestHandler.timer) {
                  clearTimeout(requestHandler.timer);
                }
                requestHandler.resolve(cmdResponse);
                pendingRequests.delete(requestId);
              }
            }
            break;
          }
          case "cmd_chunk": {
            if (ws.isAuthenticated && ws.userId) {
              sendToUser(ws.userId, {
                type: "cmd_chunk",
                taskId: parsedData.taskId,
                chunk: parsedData.chunk,
              });
            }
            break;
          }
          case "task_finished": {
            if (ws.isAuthenticated && ws.userId) {
              sendToUser(ws.userId, {
                type: "task_finished",
                taskId: parsedData.taskId,
                exitCode: parsedData.exitCode,
                terminalOutput: parsedData.terminalOutput,
              });
            }
            // Wake up the waiting backend loop
            const handler = pendingTasks.get(parsedData.taskId);
            if (handler) {
              clearTimeout(handler.timer);
              handler.resolve(parsedData);
              pendingTasks.delete(parsedData.taskId);
            }
            break;
          }
          case "task_promoted": {
            if (!ws.isAuthenticated || !ws.userId) break;
            sendToUser(ws.userId, {
              type: "task_promoted",
              taskId: parsedData.taskId,
              pid: parsedData.pid,
              cmd: parsedData.cmd,
            });
            break;
          }
          case "revoke-device": {
            if (!ws.isAuthenticated) break;
            let targetDeviceId = parsedData.deviceId;

            if (parsedData.deviceToken) {
              const actualToken = parsedData.deviceToken.startsWith("Bearer ")
                ? parsedData.deviceToken.slice(7)
                : parsedData.deviceToken;
              const decodedToken = verifyToken(actualToken) as JwtPayload;
              if (
                !decodedToken ||
                !decodedToken.success ||
                !decodedToken.token
              ) {
                sendJson(ws, {
                  type: "PairingFailed",
                  message: "Invalid token",
                });
                break;
              }
              const tokenUserId =
                (decodedToken.token?.userId as string) ||
                ((decodedToken.token as any)?.id as string);
              if (tokenUserId !== ws.userId) {
                sendJson(ws, {
                  type: "PairingFailed",
                  message: "You cannot revoke another user's device",
                });
                break;
              }
              targetDeviceId =
                (decodedToken.token?.deviceId as string) ||
                ((decodedToken.token as any)?.deviceId as string);
            }

            // If no specific deviceId provided and sender is an authenticated companion device, target itself
            if (
              !targetDeviceId &&
              ws.deviceId &&
              ws.deviceId !== "web_client"
            ) {
              targetDeviceId = ws.deviceId;
            }

            if (!targetDeviceId) {
              sendJson(ws, {
                type: "Error",
                message: "Device ID required to revoke",
              });
              break;
            }

            const result = await revokeDevice(ws.userId!, targetDeviceId);
            sendJson(ws, {
              type: "RevokeResponse",
              success: result.success,
              message: result.message,
              deviceId: targetDeviceId,
            });
            break;
          }
          case "chat_send": {
            if (!ws.isAuthenticated || !ws.userId) break;
            const currUserId = ws.userId;
            const { content, behaviour = "friendly", model } = parsedData;
            let targetSessionId = parsedData.sessionId;
            if (!content || !content.toString().trim()) break;

            const defaultModel = {
              provider: "gemini",
              name: "gemini-3.7-flash",
              isLiveModel: false,
            };
            const selectedModel = model || defaultModel;

            if (!targetSessionId) {
              const newSess = await newSession(currUserId);
              if (!newSess.success || !newSess.sessionId) {
                console.error("[WS chat_send] Failed to create new session");
                break;
              }
              targetSessionId = newSess.sessionId.toString();
              sendJson(ws, {
                type: "session_created",
                sessionId: targetSessionId,
              });
            }

            // Check if this session is already running
            const liveState = activeSessions.get(targetSessionId);
            if (liveState !== undefined) {
              sendJson(ws, {
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

            // Register session in authoritative server hub
            activeSessions.set(targetSessionId, {
              userId: currUserId,
              sessionId: targetSessionId,
              userMessage: content.toString(),
              workingon: "Analyzing your request...",
              executions: [],
            });

            // Immediately broadcast new_user_message to all user tabs/devices (PC + Mobile)
            sendToUser(currUserId, {
              type: "new_user_message",
              sessionId: targetSessionId,
              message: {
                role: "user",
                content,
                timestamp: new Date().toISOString(),
              },
            });

            // Update session updatedAt in background
            SessionModel.updateOne(
              { _id: targetSessionId, userId: currUserId },
              { updatedAt: new Date() },
            ).catch(() => {});

            // Background title generation for newly created/default sessions
            SessionModel.findOne({
              _id: targetSessionId,
              userId: currUserId,
              title: "New Chat",
            })
              .then(async (existingSession) => {
                if (existingSession) {
                  const titleSnippet =
                    (await chatSummarize([
                      { role: "user", content: content.toString() },
                    ])) || content.split(" ").slice(0, 4).join(" ");

                  await SessionModel.updateOne(
                    {
                      _id: targetSessionId,
                      userId: currUserId,
                      title: "New Chat",
                    },
                    { title: titleSnippet },
                  );
                }
              })
              .catch((err) =>
                console.error("[WS chat_send] Title generation error:", err),
              );

            // Execute AI turn
            const aiRunner = new AskAI(
              currUserId,
              targetSessionId,
              content,
              selectedModel,
            );
            aiRunner
              .run()
              .then((result) => {
                sendToUser(currUserId, {
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

                // Trigger background conversation summarization if long chat
                triggerBackgroundSummarize(currUserId, targetSessionId);
              })
              .catch((err: any) => {
                console.error(
                  "[WS chat_send] askAI error:",
                  err?.message || err,
                );
                sendToUser(currUserId, {
                  type: "ai_done",
                  sessionId: targetSessionId,
                  data: {
                    workingon: "",
                    message: {
                      role: "assistant",
                      content: {
                        lastAIMsg:
                          err?.message ||
                          "An error occurred while processing your request.",
                        lastCMD: "",
                        terminal: "",
                        terminalError: err?.message || "Internal server error",
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
                activeSessions.delete(targetSessionId);
              });
            break;
          }
          case "sync_session": {
            if (!ws.isAuthenticated) break;
            const { sessionId } = parsedData;
            if (!sessionId) break;
            const liveState = activeSessions.get(sessionId);
            sendJson(ws, {
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
            break;
          }
          default:
            console.warn(`[WS] Unhandled event type: ${type}`);
            break;
        }
      } catch (err: any) {
        console.error("[WS] Message parsing error:", err.message);
      }
    });
    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("close", () => {
      console.log(
        `[WS] Client disconnected (user: ${ws.userId || "unauthenticated"}, device: ${ws.deviceId || "none"})`,
      );
      if ((ws as any).watchdogTimer) {
        clearTimeout((ws as any).watchdogTimer);
      }
      if (
        ws.isAuthenticated &&
        ws.userId &&
        ws.deviceId &&
        ws.deviceId !== "web_client"
      ) {
        sendToUser(ws.userId, {
          type: "device_status",
          device: { deviceName: ws.deviceName, id: ws.deviceId },
          online: false,
        });
      }

      ws.userId = "";
      ws.isAuthenticated = false;
      ws.deviceId = "";
    });
  });
};

const sendDeviceStatus = async (ws: WebSocket, userId: string) => {
  const userDoc = await UserModel.findById(userId);
  sendJson(ws, {
    type: "device_list",
    devices: (userDoc?.devices || []).map((d) => {
      const client = Array.from(wss.clients as Set<CustomWebSocket>).find(
        (c) => c.deviceId === d._id.toString(),
      );
      return {
        id: d._id.toString(),
        deviceName: d.deviceName,
        online: !!client,
        service: client ? (client.service ?? true) : true,
        ipAddress: client?.ipAddress,
      };
    }),
  });
};

async function triggerBackgroundSummarize(userId: string, sessionId: string) {
  try {
    const prevChatMessages: ChatMessageType[] =
      (await getChat(userId, sessionId, 20))?.chat || [];
    if (prevChatMessages.length < 10) return;

    const summaryTitle = `summary_chat_${sessionId}`;
    let summarySessionDoc: any = await SessionModel.findOne({
      userId,
      title: summaryTitle,
    });

    const prevSummary: ChatMessageType[] = summarySessionDoc
      ? (await getChat(userId, summarySessionDoc._id.toString(), 1))?.chat || []
      : [];

    const allContextToSummarize = [...prevSummary, ...prevChatMessages];
    const summaryResult = await summarize(allContextToSummarize, sessionId);
    if (summaryResult && summaryResult.length > 0) {
      if (!summarySessionDoc) {
        summarySessionDoc = await SessionModel.create({
          userId,
          title: summaryTitle,
        });
      }
      await setChat(userId, summarySessionDoc._id.toString(), {
        role: "assistant",
        content: summaryResult,
      });
    }
  } catch (err) {
    console.error("[BACKGROUND SUMMARY ERROR]:", err);
  }
}

const sendToUser = (userId: string, data: any, deviceId?: string) => {
  if (!wss) return;
  const dataStr = typeof data === "string" ? data : JSON.stringify(data);

  (wss.clients as Set<CustomWebSocket>).forEach((client) => {
    const isSameUser = client.userId?.toString() === userId?.toString();
    const isSameDevice = !deviceId || client.deviceId === deviceId;

    if (
      isSameUser &&
      isSameDevice &&
      client.isAuthenticated &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(dataStr);
    }
  });
};

const sendCmdRequest = async (
  userId: string,
  cmd: any,
  timeoutMs: number = 30000,
): Promise<CommandParserResponseType> => {
  return new Promise((resolve, reject) => {
    if (!wss) {
      return reject(new Error("WebSocket server is not initialized"));
    }

    const requestId = crypto.randomUUID();
    const parsedCmd = typeof cmd === "string" ? JSON.parse(cmd) : cmd;
    const dataStr = JSON.stringify({
      type: "RunCMD",
      cmd: parsedCmd,
      requestId,
    });
    let clientFound = false;
    let isAliveFound = false;
    (wss.clients as Set<CustomWebSocket>).forEach((client) => {
      const isSameUser = client.userId?.toString() === userId?.toString();
      if (client.deviceId === "web_client") {
        return;
      }
      if (
        isSameUser &&
        client.isAuthenticated &&
        client.readyState === WebSocket.OPEN
      ) {
        clientFound = true;
        if (client.isAlive) {
          isAliveFound = true;
          client.send(dataStr);
        }
      }
    });
    if (!clientFound || !isAliveFound) {
      return reject(
        new Error(
          "Local backend server is not connected or authenticated. Please ensure your local backend is running and paired.",
        ),
      );
    }
    const timer = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        reject(
          new Error(
            `Command request timed out after ${timeoutMs / 1000}s without response from local backend.`,
          ),
        );
        pendingRequests.delete(requestId);
      }
    }, timeoutMs);

    pendingRequests.set(requestId, {
      resolve,
      reject,
      timer,
    });
  });
};
export const revokeDevice = async (
  userId: string,
  deviceId?: string,
  deviceToken?: string,
) => {
  let targetDeviceId = deviceId;
  if (!targetDeviceId && deviceToken) {
    const user = await UserModel.findById(userId);
    const matched = user?.devices?.find((d) => d.deviceToken === deviceToken);
    if (matched) {
      targetDeviceId = matched._id.toString();
    }
  }

  const deviceObjectId =
    targetDeviceId && Types.ObjectId.isValid(targetDeviceId)
      ? new Types.ObjectId(targetDeviceId)
      : null;
  const orConditions: any[] = [];
  if (deviceObjectId) orConditions.push({ _id: deviceObjectId });
  if (targetDeviceId) orConditions.push({ _id: targetDeviceId });
  if (deviceToken) orConditions.push({ deviceToken: deviceToken });

  const result = await UserModel.updateOne(
    { _id: userId },
    {
      $pull: {
        devices: {
          $or:
            orConditions.length > 0 ? orConditions : [{ _id: targetDeviceId }],
        },
      },
    },
  );
  if (result.modifiedCount === 0) {
    return {
      success: false,
      message: "Failed to revoke device: Device not found",
      data: null,
    };
  }
  if (wss) {
    for (const client of wss.clients as Set<CustomWebSocket>) {
      if (
        (client.deviceId === targetDeviceId ||
          (client as any).deviceToken === deviceToken) &&
        client.userId?.toString() === userId?.toString()
      ) {
        sendJson(client, {
          type: "PairingFailed",
          message: "Device has been revoked",
        });
        client.close(4003, "Device revoked by user");
      }
    }
  }
  if (targetDeviceId) {
    sendToUser(userId, {
      type: "device_removed",
      deviceId: targetDeviceId,
    });
  }
  return {
    success: true,
    message: "Device revoked successfully",
    data: null,
  };
};

export const revokeSelfHandler = async (req: any, res: any) => {
  try {
    const authHeader = req.headers["authorization"];
    const bodyToken = req.body?.deviceToken;
    const rawToken = authHeader || (bodyToken ? `Bearer ${bodyToken}` : null);
    if (!rawToken || !rawToken.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token not provided",
      });
    }
    const token = rawToken.substring(7);
    const decodedToken: any = verifyToken(token);
    if (!decodedToken.success || !decodedToken.token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or expired token",
      });
    }
    const userId = (
      decodedToken.token.userId || decodedToken.token.id
    )?.toString();
    const deviceId = decodedToken.token.deviceId?.toString();
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Token does not contain user identity",
      });
    }
    const result = await revokeDevice(userId, deviceId, token);
    return res.status(200).json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[REVOKE SELF ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during device revocation",
    });
  }
};

export const revokeDeviceHandler = async (req: any, res: any) => {
  const userId: string = req.userId ? req.userId.toString() : "";
  const { deviceId } = req.params;
  const result = await revokeDevice(userId, deviceId);
  return res.status(200).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
};
const startParingHandler = async (req: any, res: any) => {
  if (!wss) {
    return res.status(500).json({
      success: false,
      message: "WebSocket server not initialized",
      data: null,
    });
  }

  const { pairingcode } = req.body;
  const userId: string = req.userId ? req.userId.toString() : "";

  if (!pairingcode) {
    return res.status(400).json({
      success: false,
      message: "Pairing code is required",
      data: null,
    });
  }

  for (const client of wss.clients as Set<CustomWebSocket>) {
    if (
      client.pairingCode === pairingcode &&
      client.readyState === WebSocket.OPEN
    ) {
      client.pairingCode = "";
      const deviceId = new Types.ObjectId().toString();

      const deviceToken = generateToken(
        {
          userId: userId,
          deviceId: deviceId,
        },
        "30d",
      );

      if (!deviceToken) {
        sendJson(client, {
          type: "PairingFailed",
          message: "Failed to generate device token",
          data: null,
        });
        return res.status(500).json({
          success: false,
          message: "Device Token generation failed",
          data: null,
        });
      }

      client.deviceId = deviceId;
      client.isAuthenticated = true;
      client.userId = userId;

      sendJson(client, {
        type: "PairingSuccess",
        token: deviceToken,
        userId: userId,
        deviceId: deviceId,
      });

      await UserModel.findOneAndUpdate(
        { _id: userId },
        {
          $push: {
            devices: {
              _id: deviceId,
              deviceToken: deviceToken,
              deviceName: "Nexus Local Device",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
      );

      return res.status(200).json({
        success: true,
        message: "Pairing successful",
        data: { deviceId },
      });
    }
  }

  return res.status(400).json({
    success: false,
    message: "Pairing Failed! Please enter a valid pairing code.",
    data: null,
  });
};

function waitForTaskCompletion(
  taskId: string,
  timeoutMs: number = 300000,
): Promise<{
  exitCode: number;
  terminalOutput: string;
  terminalError: string;
}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(taskId);
      resolve({
        exitCode: 1,
        terminalOutput: "",
        terminalError: `Task ${taskId} timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);

    pendingTasks.set(taskId, { resolve, reject, timer });
  });
}

export {
  initWebsocket,
  sendToUser,
  startParingHandler,
  sendCmdRequest,
  waitForTaskCompletion,
};
