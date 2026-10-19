import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import {
  ActiveSessions,
  ClientSessionOutboundPayload,
  ClientTabs,
  PendingRequest,
  PendingTask,
} from "./Types.js";
import { generateToken, verifyToken } from "../jwt.service.js";
import { IncomingWSPayload } from "../../AI/Types.js";
import { UserModel } from "../../db/schema/user-schema.js";
import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { ClientSession } from "./Frontend.js";
import { ClientDeviceSession } from "./LocalBackend.js";

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
        if (now - device.lastSeenAt > 40000) {
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
        console.log(
          `[WS] Device registered waiting for pairing code: "${code}" (stripped: "${stripped}")`,
        );
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
        message:
          "Invalid or expired pairing code. Please make sure companion is running.",
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
              d._id?.toString() !== deviceId && d.deviceToken !== token,
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
      const orConditions: any[] = [
        { _id: deviceId },
        { deviceToken: deviceId },
      ];
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
              d._id?.toString() !== deviceId && d.deviceToken !== deviceId,
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
    time: number = 45000,
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
        if (selected_device.pendingRequest) {
          selected_device.pendingRequest.reject(
            new Error(
              `Command timed out after ${time / 1000}s. The Device did not response back the request id in given time`,
            ),
          );
          selected_device.pendingRequest = null;
        }
      }, time);
      selected_device.pendingRequest = {
        requestId,
        resolve,
        reject,
        timer,
        deviceId: selectedDeviceId,
        deviceName: selected_device.deviceName || selectedDeviceId,
      };
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
