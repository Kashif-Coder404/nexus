import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage, Server } from "http";
import {
  ActiveSessions,
  ClientDeviceOutboundPayload,
  ClientSessionOutboundPayload,
  ClientTabs,
  CustomWebSocket,
  PendingRequest,
  PendingTask,
} from "./Types.js";
import { generateToken, verifyToken } from "../jwt.service.js";
import { IncomingWSPayload } from "../../AI/Types.js";
import { UserModel } from "../../db/schema/user-schema.js";
import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { off } from "cluster";
import { AskAI } from "../../AI/AskAI_OOP.js";
import { newSession } from "../../middlewares/auth/sessionVerification.js";
import { SessionModel } from "../../db/schema/session-schema.js";
import { backgroundSummarize } from "../../AI/AskAI.js";

export abstract class BaseWSSession {
  public isAuthenticated: boolean = false;
  constructor(
    public ws: WebSocket,
    public userId: string,
  ) {
    this.ws.on("message", (raw) => this.onMessage(raw));
    this.ws.on("close", () => this.onClose());
  }
  public send(payload: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      const msg =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      this.ws.send(msg);
    }
  }
  protected abstract onMessage(data: any): Promise<void>;
  protected abstract onClose(): void;
}

//Client = Frontend , ClientDevice = Local Backend WS
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

export class ClientDeviceSession extends BaseWSSession {
  public deviceName: string = "";
  public IpAddress: string = "";
  public isService: boolean = false;
  public lastSeenAt: number = Date.now();
  constructor(
    ws: WebSocket,
    userId: string,
    public deviceId: string,
    options?: {
      deviceName?: string;
      ipAddress?: string;
      isService?: boolean;
    },
  ) {
    super(ws, userId);
    this.isAuthenticated = true;
    if (options?.deviceName) this.deviceName = options.deviceName;
    if (options?.ipAddress) this.IpAddress = options.ipAddress;
    if (typeof options?.isService === "boolean")
      this.isService = options.isService;
    // Register into deviceClients only AFTER deviceId is assigned!
    this.initDevice();
  }
  protected initDevice() {
    let userDevices = WebSocketService.deviceClients.get(this.userId);
    if (!userDevices) {
      userDevices = new Map();
      WebSocketService.deviceClients.set(this.userId, userDevices);
    }
    const existing = userDevices.get(this.deviceId);
    if (existing && existing !== this) {
      existing.ws.terminate();
    }
    userDevices.set(this.deviceId, this);
    console.log(`[Device] Connected: "${this.deviceName}" (${this.deviceId})`);
    // Notify user's browser tabs that this device is online
    WebSocketService.sendToClient(this.userId, {
      type: "device_status",
      device: {
        id: this.deviceId,
        deviceName: this.deviceName,
        ipAddress: this.IpAddress,
        userId: this.userId,
        isService: this.isService,
      },
      online: true,
      service: this.isService,
    });
  }
  protected override async onMessage(data: any) {
    try {
      const parsed = JSON.parse(data.toString());
      const { type } = parsed;
      switch (type) {
        case "ping": {
          this.lastSeenAt = Date.now();
          if (typeof parsed.service === "boolean") {
            this.isService = parsed.service;
          }
          break;
        }
        case "device_status": {
          if (typeof parsed.service === "boolean") {
            this.isService = parsed.service;
          }
          if (parsed.ipAddress) {
            this.IpAddress = parsed.ipAddress;
          }
          // Frontend ko batao ki IP aur Service update ho gaya
          WebSocketService.sendToClient(this.userId, {
            type: "device_status",
            device: {
              id: this.deviceId,
              deviceName: this.deviceName,
              ipAddress: this.IpAddress,
              isService: this.isService,
            },
            online: true,
            service: this.isService,
          });
          break;
        }
        case "revoke-device":
        case "revoke_device": {
          this.revokeDevice();
          break;
        }
        case "cmd_response": {
          try {
            const { requestId, cmdResponse } = parsed;
            const handler = WebSocketService.pendingRequest.get(requestId);
            if (handler) {
              clearTimeout(handler.timer);
              handler.resolve(cmdResponse);
              WebSocketService.pendingRequest.delete(requestId);
            }
          } catch (error) {
            const handler = WebSocketService.pendingRequest.get(
              parsed.requestId,
            );
            if (handler) {
              clearTimeout(handler.timer);
              handler.reject(error);
              WebSocketService.pendingRequest.delete(parsed.requestId);
            }
          }
          break;
        }
        case "cmd_chunk": {
          WebSocketService.sendToClient(this.userId, {
            type: "cmd_chunk",
            taskId: parsed.taskId,
            chunk: parsed.chunk,
          });
          break;
        }
        case "task_finished": {
          WebSocketService.sendToClient(this.userId, {
            type: "task_finished",
            taskId: parsed.taskId,
            exitCode: parsed.exitCode,
            terminalOutput: parsed.terminalOutput,
          });
          // Waiting Promise ko wake-up karo
          const handler = WebSocketService.pendingTasks.get(parsed.taskId);
          if (handler) {
            clearTimeout(handler.timer);
            handler.resolve(parsed);
            WebSocketService.pendingTasks.delete(parsed.taskId);
          }
          break;
        }
        case "task_promoted": {
          WebSocketService.sendToClient(this.userId, {
            type: "task_promoted",
            taskId: parsed.taskId,
            pid: parsed.pid,
            cmd: parsed.cmd,
          });
          break;
        }
        default: {
          console.log("[Device] Unknown message type:", type);
          break;
        }
      }
    } catch (error) {
      console.error("Invalid JSON", error);
    }
  }

  //Custom Functions...

  private async revokeDevice() {
    try {
      const orConditions: any[] = [{ _id: this.deviceId }];
      if (Types.ObjectId.isValid(this.deviceId)) {
        orConditions.push({ _id: new Types.ObjectId(this.deviceId) });
      }
      await UserModel.updateOne(
        { _id: this.userId },
        { $pull: { devices: { $or: orConditions } } },
      );
      this.send({ type: "RevokeResponse" });
      WebSocketService.sendToClient(this.userId, {
        type: "device_removed",
        deviceId: this.deviceId,
      });
      setTimeout(() => {
        try {
          this.ws.close(4003, "Device revoked");
        } catch {}
      }, 100);
    } catch (err) {
      console.error("[WS] Error revoking device:", err);
    }
  }
  protected override onClose() {
    const userDevices = WebSocketService.deviceClients.get(this.userId);
    if (userDevices) {
      userDevices.delete(this.deviceId);
      if (userDevices.size === 0) {
        WebSocketService.deviceClients.delete(this.userId);
      }
    }
    //Making aware to write false in the frontend if hte device is get offline
    WebSocketService.sendToClient(this.userId, {
      type: "device_status",
      device: {
        id: this.deviceId,
        deviceName: this.deviceName,
        ipAddress: this.IpAddress,
        userId: this.userId,
        isService: this.isService,
      },
      online: false,
      service: this.isService,
    });
    console.log(`Device Disconnected (${this.deviceId})`);
  }
}

export class WebSocketService {
  private static wss: WebSocketServer;
  public static activeSessions = new Map<string, ActiveSessions>();

  public static userClients = new Map<string, ClientTabs>();
  public static deviceClients = new Map<
    string,
    Map<string, ClientDeviceSession>
  >();
  public static unknownDeviceWaitingList = new Map<string, WebSocket>();

  public static pendingTasks = new Map<string, PendingTask>();
  public static pendingRequest = new Map<string, PendingRequest>();
  public static init(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws: WebSocket) => {
      this.onConnection(ws);
    });
    setInterval(() => {
      this.watchGaurd();
    }, 30000);
  }
  private static watchGaurd() {
    const now = Date.now();
    for (const [userId, userDevices] of this.deviceClients.entries()) {
      for (const [deviceId, device] of userDevices.entries()) {
        if (now - device.lastSeenAt > 30000) {
          device.ws.terminate();
        }
      }
    }
  }
  private static async onConnection(ws: WebSocket) {
    ws.once("message", async (raw) => {
      const payload: IncomingWSPayload = JSON.parse(raw.toString());
      const type = payload.type;
      if (type === "PairingInit") {
        const rawCode = payload.code || payload.data?.code;
        if (!rawCode) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid Pairing Code",
            }),
          );
          return;
        }
        const code = rawCode.toString().trim().toUpperCase();
        const stripped = code.replace(/^NX-/i, "");
        WebSocketService.unknownDeviceWaitingList.set(code, ws);
        WebSocketService.unknownDeviceWaitingList.set(stripped, ws);
        WebSocketService.unknownDeviceWaitingList.set(`NX-${stripped}`, ws);
        console.log(`[WS] Device registered waiting for pairing code: "${code}" (stripped: "${stripped}")`);
        ws.on("close", () => {
          WebSocketService.unknownDeviceWaitingList.delete(code);
          WebSocketService.unknownDeviceWaitingList.delete(stripped);
          WebSocketService.unknownDeviceWaitingList.delete(`NX-${stripped}`);
        });
      } else if (type === "auth") {
        const token = payload.token?.replace(/^Bearer\s*/i, "").trim();
        if (!token) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid Token",
            }),
          );
          return;
        }
        const decoded: any = verifyToken(token);
        if (!decoded.success || !decoded.token) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid or Expired Token",
            }),
          );
          return;
        }
        const userId = (decoded.token.userId || decoded.token.id) as string;
        const deviceId = decoded.token.deviceId as string | undefined;
        if (!deviceId) {
          // Client Tabs...
          new ClientSession(ws, userId);
          return;
        }
        // Client Device...
        let userDevices = this.deviceClients.get(userId);
        if (!userDevices) {
          this.deviceClients.set(
            userId,
            new Map<string, ClientDeviceSession>(),
          );
          userDevices = this.deviceClients.get(userId);
        }
        if (userDevices?.has(deviceId)) {
          const oldDevice = userDevices.get(deviceId);
          oldDevice?.ws.terminate();
        }
        const user = await UserModel.findOne({
          _id: userId,
          "devices._id": deviceId,
          "devices.deviceToken": token,
        });
        if (!user) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid Device or Revoked",
            }),
          );
          return;
        }
        const deviceDoc = user.devices.find(
          (d) => d._id.toString() === deviceId,
        );
        if (!deviceDoc) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid Device or Revoked (not found)",
            }),
          );
          return;
        }
        const deviceName = deviceDoc?.deviceName || "Nexus Device";
        const ipAddress =
          payload.ipAddress || (payload as any)?.ipAddress || "";
        const isService =
          typeof payload.service === "boolean" ? payload.service : false;
        new ClientDeviceSession(ws, userId, deviceId, {
          deviceName,
          ipAddress,
          isService,
        });
      }
    });
  }
  public static sendToClient(
    userId: string,
    data: ClientSessionOutboundPayload,
  ) {
    const tabs = this.userClients.get(userId);
    if (!tabs) return;
    const payload = JSON.stringify(data);
    for (const session of tabs) {
      session.send(payload);
    }
  }
  public static async waitForTaskCompletion(
    taskId: string,
    timeoutMs: number = 300000,
  ): Promise<any> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        resolve({
          exitCode: 1,
          terminalOutput: "",
          terminalError: `Task ${taskId} timed out after ${Math.round(timeoutMs / 1000)}s`,
        });
      }, timeoutMs);

      this.pendingTasks.set(taskId, { resolve, reject: () => {}, timer });
    });
  }
  public static async startPairingHandler(req: any, res: any) {
    const rawCode =
      req.body.pairingcode || req.body.pairingCode || req.body.code;
    const pairingCode = rawCode ? rawCode.toString().trim().toUpperCase() : "";
    const userId: string = req.userId ? req.userId.toString() : "";

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Please login first",
      });
    }
    if (!pairingCode) {
      return res.status(400).json({
        success: false,
        message: "Please provide a pairing code.",
      });
    }

    const stripped = pairingCode.replace(/^NX-/i, "");
    const waitingDevice =
      WebSocketService.unknownDeviceWaitingList.get(pairingCode) ||
      WebSocketService.unknownDeviceWaitingList.get(stripped) ||
      WebSocketService.unknownDeviceWaitingList.get(`NX-${stripped}`);

    if (!waitingDevice || waitingDevice.readyState !== WebSocket.OPEN) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired pairing code. Please make sure companion is running.",
      });
    }

    const deviceId = new Types.ObjectId().toString();
    const deviceToken = generateToken({ userId, deviceId }, "30d");
    const deviceName = req.body.deviceName || "Nexus Companion";

    await UserModel.findOneAndUpdate(
      { _id: userId },
      {
        $push: {
          devices: {
            _id: deviceId,
            deviceToken,
            deviceName,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      },
    );

    waitingDevice.send(
      JSON.stringify({
        type: "PairingSuccess",
        token: deviceToken,
        userId,
        deviceId,
      }),
    );

    new ClientDeviceSession(waitingDevice, userId, deviceId, { deviceName });

    WebSocketService.unknownDeviceWaitingList.delete(pairingCode);
    WebSocketService.unknownDeviceWaitingList.delete(stripped);
    WebSocketService.unknownDeviceWaitingList.delete(`NX-${stripped}`);

    // Broadcast updated device list to user tabs immediately
    const devices = await WebSocketService.GetDevices(userId);
    WebSocketService.sendToClient(userId, {
      type: "device_list",
      devices,
    });

    return res.status(200).json({
      success: true,
      message: "Device Paired Successfully!",
      data: { deviceId },
    });
  }
  public static async RevokeSelfHandler(req: any, res: any) {
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
      if (!userId || !deviceId) {
        return res.status(400).json({
          success: false,
          message: "Token does not contain user or device identity",
        });
      }

      // 1. Remove from MongoDB with ObjectId + token support
      const orConditions: any[] = [{ _id: deviceId }, { deviceToken: token }];
      if (Types.ObjectId.isValid(deviceId)) {
        orConditions.push({ _id: new Types.ObjectId(deviceId) });
      }

      const result = await UserModel.updateOne(
        { _id: userId },
        { $pull: { devices: { $or: orConditions } } },
      );

      // Fallback: document find and pull if $pull did not match
      if (result.modifiedCount === 0) {
        const user = await UserModel.findById(userId);
        if (user && user.devices) {
          const prevLen = user.devices.length;
          user.devices = (user.devices as any).filter(
            (d: any) =>
              d._id?.toString() !== deviceId &&
              d.deviceToken !== token,
          );
          if (user.devices.length < prevLen) {
            await user.save();
          }
        }
      }

      // 2. Disconnect socket if online
      const userDevices = WebSocketService.deviceClients.get(userId);
      const activeSession = userDevices?.get(deviceId);
      if (activeSession) {
        activeSession.send({
          type: "RevokeResponse",
          message: "Device has been revoked",
        });
        setTimeout(() => {
          try {
            activeSession.ws.close(4003, "Device revoked self");
          } catch {}
        }, 100);
        userDevices?.delete(deviceId);
      }

      // 3. Notify browser tabs
      WebSocketService.sendToClient(userId, {
        type: "device_removed",
        deviceId,
      });

      return res.status(200).json({
        success: true,
        message: "Device revoked successfully",
      });
    } catch (error: any) {
      console.error("[REVOKE SELF ERROR]:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error during device revocation",
      });
    }
  }

  public static async RevokeDeviceHandler(req: any, res: any) {
    const userId: string = req.userId ? req.userId.toString() : "";
    const { deviceId } = req.params;

    if (!userId || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or deviceId",
      });
    }

    try {
      const orConditions: any[] = [{ _id: deviceId }, { deviceToken: deviceId }];
      if (Types.ObjectId.isValid(deviceId)) {
        orConditions.push({ _id: new Types.ObjectId(deviceId) });
      }

      // 1. Remove device from MongoDB user document
      let result = await UserModel.updateOne(
        { _id: userId },
        { $pull: { devices: { $or: orConditions } } },
      );

      // Fallback: document find and pull if $pull did not match
      if (result.modifiedCount === 0) {
        const user = await UserModel.findById(userId);
        if (user && user.devices) {
          const prevLen = user.devices.length;
          user.devices = (user.devices as any).filter(
            (d: any) =>
              d._id?.toString() !== deviceId &&
              d.deviceToken !== deviceId,
          );
          if (user.devices.length < prevLen) {
            await user.save();
            result = { modifiedCount: 1 } as any;
          }
        }
      }

      // 2. Disconnect socket if the companion is currently connected
      const userDevices = WebSocketService.deviceClients.get(userId);
      const activeSession = userDevices?.get(deviceId);
      if (activeSession) {
        activeSession.send({
          type: "RevokeResponse",
          message: "Device has been revoked",
        });
        setTimeout(() => {
          try {
            activeSession.ws.close(4003, "Device revoked by user");
          } catch {}
        }, 100);
        userDevices?.delete(deviceId);
      }

      // 3. Notify all open browser tabs to remove the device from UI
      WebSocketService.sendToClient(userId, {
        type: "device_removed",
        deviceId,
      });

      return res.status(200).json({
        success: true,
        message:
          result.modifiedCount > 0
            ? "Device revoked successfully"
            : "Device was already removed from database",
      });
    } catch (error: any) {
      console.error("[REVOKE DEVICE ERROR]:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error during device revocation",
      });
    }
  }

  public static async GetDevices(userId: string, deviceId?: string) {
    try {
      const user = await UserModel.findById(userId);
      if (!user || !user.devices) return [];

      const userOnlineDevices = this.deviceClients.get(userId);

      const devicesList = user.devices.map((d: any) => {
        const devIdStr = d._id.toString();
        const liveDevice = userOnlineDevices?.get(devIdStr);
        const isOnline =
          !!liveDevice && liveDevice.ws.readyState === WebSocket.OPEN;

        return {
          id: devIdStr,
          deviceName: d.deviceName || "Nexus Device",
          name: d.deviceName || "Nexus Device",
          online: isOnline,
          isConnected: isOnline,
          ipAddress: liveDevice?.IpAddress || "",
          service: liveDevice?.isService ?? false,
        };
      });

      if (deviceId) {
        return devicesList.filter((d: any) => d.id === deviceId);
      }
      return devicesList;
    } catch (err) {
      console.error("[GetDevices ERROR]:", err);
      return [];
    }
  }
  public static async sendCmdRequest(
    userId: string,
    selectedDeviceId: string,
    cmd: any,
    time: number = 10000,
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (!this.wss) {
        return reject(new Error("WebSocket server is not initialized"));
      }
      const selected_device = this.deviceClients
        .get(userId)
        ?.get(selectedDeviceId);
      if (!selected_device) {
        return reject(
          new Error(
            "No target device specified. Please select a device first.",
          ),
        );
      }
      if (selected_device.ws.readyState !== WebSocket.OPEN) {
        return reject(
          new Error(`Selected device (${selectedDeviceId}) is offline.`),
        ); //Ai read this message
      }
      const requestId = randomUUID().replaceAll("-", "").slice(0, 10);
      const parsedCmd = typeof cmd === "string" ? JSON.parse(cmd) : cmd;
      const dataStr = JSON.stringify({
        type: "RunCMD",
        cmd: parsedCmd,
        requestId,
      });
      const timer = setTimeout(() => {
        if (this.pendingRequest.has(requestId)) {
          this.pendingRequest.delete(requestId);
          reject(new Error(`Command timed out after ${time / 1000}s`));
        }
      }, time);

      this.pendingRequest.set(requestId, { resolve, reject, timer });
      selected_device.send(dataStr);
    });
  }
}

export const startParingHandler = (req: any, res: any) =>
  WebSocketService.startPairingHandler(req, res);
export const revokeDeviceHandler = (req: any, res: any) =>
  WebSocketService.RevokeDeviceHandler(req, res);
export const revokeSelfHandler = (req: any, res: any) =>
  WebSocketService.RevokeSelfHandler(req, res);

