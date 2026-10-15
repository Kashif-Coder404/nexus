import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage, Server } from "http";
import {
  ActiveSessions,
  ClientDeviceOutboundPayload,
  ClientSessionOutboundPayload,
  CustomWebSocket,
  PendingRequest,
  PendingTask,
} from "./Types.js";
import { generateToken, verifyToken } from "../jwt.service.js";
import { IncomingWSPayload } from "../../AI/Types.js";
import { UserModel } from "../../db/schema/user-schema.js";
import { randomUUID } from "crypto";
import { Types } from "mongoose";

//Client = Frontend , ClientDevice = Local Backend WS
export class ClientSession {
  public isAuthenticated: boolean = false;
  constructor(
    public ws: WebSocket,
    public userId: string,
  ) {
    this.Init();
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
  protected async onMessage(data: any) {
    try {
      const parsed = JSON.parse(data.toString());
      //Handle Commands/Messages....
    } catch (error) {
      console.log("Invalid JSON", error);
    }
  }

  protected async Init() {
    this.isAuthenticated = this.userId ? true : false;
    let tabs = WebSocketService.userClients.get(this.userId);
    if (!tabs) {
      tabs = new Set();
      WebSocketService.userClients.set(this.userId, tabs);
    }
    tabs.add(this);
    this.send({ type: "PairingSuccess" });
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

export class ClientDeviceSession extends ClientSession {
  public deviceName: string = "";
  public IpAddress: string = "";
  public isService: boolean = false;
  public lastSeenAt: number = Date.now();
  constructor(
    public ws: WebSocket,
    public userId: string,
    public deviceId: string,
  ) {
    super(ws, userId);
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
      console.log("Invalid JSON", error);
    }
  }

  protected override async Init() {
    WebSocketService.deviceClients.set(this.deviceId, this);
    //Making aware to write true in the frontend if the device is get online
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

  //Custom Functions...

  private async revokeDevice() {
    try {
      await UserModel.updateOne(
        { _id: this.userId },
        { $pull: { devices: { _id: this.deviceId } } },
      );
      this.send({ type: "RevokeResponse" });
      WebSocketService.sendToClient(this.userId, {
        type: "device_removed",
        deviceId: this.deviceId,
      });
      this.ws.close(4003, "Device revoked");
    } catch (err) {
      console.error("[WS] Error revoking device:", err);
    }
  }
  protected override onClose() {
    WebSocketService.deviceClients.delete(this.deviceId);
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

type ClientTabs = Set<ClientSession>;

export class WebSocketService {
  private static wss: WebSocketServer;
  public static activeSessions = new Map<string, ActiveSessions>();

  public static userClients = new Map<string, ClientTabs>();
  public static deviceClients = new Map<string, ClientDeviceSession>();
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
    for (const [deviceId, device] of this.deviceClients.entries()) {
      if (now - device.lastSeenAt > 30000) {
        console.log(`[Watchdog] Device ${deviceId} timed out`);
        device.ws.terminate();
      }
    }
  }
  private static async onConnection(ws: WebSocket) {
    ws.once("message", async (raw) => {
      const payload: IncomingWSPayload = JSON.parse(raw.toString());
      const type = payload.type;
      if (type === "PairingInit") {
        const code = payload.code || payload.data?.code;
        if (!code) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid Pairing Code",
            }),
          );
          return;
        }
        WebSocketService.unknownDeviceWaitingList.set(code, ws);
        ws.on("close", () => {
          WebSocketService.unknownDeviceWaitingList.delete(code);
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
        if (!decoded.success) {
          ws.send(
            JSON.stringify({
              type: "PairingFailed",
              message: "Invalid or Expired Token",
            }),
          );
          return;
        }
        if (!decoded.token.deviceId) {
          new ClientSession(ws, decoded.token.userId);
        } else {
          new ClientDeviceSession(
            ws,
            decoded.token.userId,
            decoded.token.deviceId,
          );
        }
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
    const { pairingCode } = req.body;
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
    const waitingDevice =
      WebSocketService.unknownDeviceWaitingList.get(pairingCode);
    if (!waitingDevice || waitingDevice.readyState !== WebSocket.OPEN) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired pairing code",
      });
    }
    const deviceId = new Types.ObjectId().toString();
    const deviceToken = generateToken({ userId, deviceId }, "30d");
    await UserModel.findOneAndUpdate(
      { _id: userId },
      {
        $push: {
          devices: {
            _id: deviceId,
            deviceToken,
            deviceName: "Nexus Device",
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
    new ClientDeviceSession(waitingDevice, userId, deviceId);
    WebSocketService.unknownDeviceWaitingList.delete(pairingCode);
    return res.status(200).json({
      success: true,
      message: "Device Paired Successfully!",
      data: { deviceId },
    });
  }
  public static async sendCmdRequest(
    userId: string,
    cmd: any,
    time: number = 10000,
  ) {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        return reject(new Error("WebSocket server is not initialized"));
      }
      /*Remain to implement after enabling the selecting device feature from the
      FrontEnd, as of now just implementing the single device connection scenario,
      once the user is able to connect multiple devices, we can implement this
      feature properly, 
      */
      //TODO: select the device from the user's devices, for now it is hardcoded
      const selected_device = { deviceId: "" };
      if (!selected_device) {
        return reject(
          new Error(
            "No target device specified. Please select a device first.",
          ),
        );
      }
      const deviceId = selected_device.deviceId;
      const requestId = randomUUID().replaceAll("-", "").slice(0, 10);
      const parsedCmd = typeof cmd === "string" ? JSON.parse(cmd) : cmd;
      const dataStr = JSON.stringify({
        type: "RunCMD",
        cmd: parsedCmd,
        requestId,
      });
      const device = this.deviceClients.get(deviceId);
      if (!device || device.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error(`Selected device (${deviceId}) is offline.`)); //Ai read this message
      }
      const timer = setTimeout(() => {
        if (this.pendingRequest.has(requestId)) {
          this.pendingRequest.delete(requestId);
          reject(new Error(`Command timed out after ${time / 1000}s`));
        }
      }, time);

      this.pendingRequest.set(requestId, { resolve, reject, timer });
      device.send(dataStr);
    });
  }
}
