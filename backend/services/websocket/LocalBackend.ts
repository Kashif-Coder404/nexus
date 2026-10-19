import { Types } from "mongoose";
import WebSocket from "ws";
import { UserModel } from "../../db/schema/user-schema.js";
import { WebSocketService } from "./websocket.main.service.js";
import { BaseWSSession } from "./BaseSession.js";
import { PendingRequest } from "./Types.js";
export class ClientDeviceSession extends BaseWSSession {
  public deviceName: string = "";
  public IpAddress: string = "";
  public isService: boolean = false;
  public lastSeenAt: number = Date.now();
  public pendingRequest: PendingRequest | null = null;
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
            const req = this.pendingRequest;
            if (req && req.requestId === requestId) {
              clearTimeout(req.timer);
              req.resolve(cmdResponse);
              this.pendingRequest = null;
            }
          } catch (error: any) {
            const { requestId } = parsed;
            const req = this.pendingRequest;
            if (req && req.requestId === requestId) {
              clearTimeout(req.timer);
              req.reject("Error While cmd Response " + error?.message);
              this.pendingRequest = null;
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
      if (userDevices?.get(this.deviceId) === this) {
        userDevices.delete(this.deviceId);
        const req = this.pendingRequest;
        const hasPending = req !== null;
        if (req) {
          clearTimeout(req.timer);
          req.timer = setTimeout(() => {
            if (this.pendingRequest === req) {
              this.pendingRequest = null;
              req.reject(
                new Error(
                  `Device "${this.deviceName}" lost connection and did not reconnect within 15s.`,
                ),
              );
            }
          }, 15000);
        }
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
          status: hasPending? "reconnecting" : "offline"
        });
      }
      if (userDevices.size === 0) {
        WebSocketService.deviceClients.delete(this.userId);
      }
    }
    //Making aware to write false in the frontend if hte device is get offline

    console.log(`Device Disconnected (${this.deviceId})`);
  }
}
