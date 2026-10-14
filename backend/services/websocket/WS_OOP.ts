import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage, Server } from "http";
import { ActiveSessions, CustomWebSocket, PendingTask } from "./Types.js";
import { verifyToken } from "../jwt.service.js";
import { IncomingWSPayload } from "../../AI/Types.js";

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
  private watchdotTimer: NodeJS.Timeout | null = null;
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
          break;
        }
        case "PairingInit": {
          console.log("[Device] Received PairingInit");
          break;
        }
        case "cmd_response": {
          console.log("[Device] Received cmd_response");
          break;
        }
        case "cmd_chunk": {
          console.log("[Device] Received cmd_chunk");
          break;
        }
        case "task_finished": {
          console.log("[Device] Received task_finished");
          break;
        }
        case "task_promoted": {
          console.log("[Device] Received task_promoted");
          break;
        }
        case "revoke-device": {
          console.log("[Device] Received revoke-device");
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
      payload: {
        device: {
          id: this.deviceId,
          name: this.deviceName,
          ip: this.IpAddress,
          isService: this.isService,
          userId: this.userId,
        },
        online: true,
        service: this.isService,
      },
    });
  }

  protected override onClose() {
    WebSocketService.deviceClients.delete(this.deviceId);
    //Making aware to write false in the frontend if hte device is get offline
    WebSocketService.sendToClient(this.userId, {
      type: "device_status",
      payload: {
        device: {
          id: this.deviceId,
          name: this.deviceName,
          ip: this.IpAddress,
          isService: this.isService,
          userId: this.userId,
        },
        online: false,
        service: this.isService,
      },
    });
    console.log(`Device Disconnected (${this.deviceId})`);
  }
}

type DataPayload = {
  type: string;
  payload: object | null;
};
type ClientTabs = Set<ClientSession>;

export class WebSocketService {
  private static wss: WebSocketServer;
  public static activeSessions = new Map<string, ActiveSessions>();

  public static userClients = new Map<string, ClientTabs>();
  public static deviceClients = new Map<string, ClientDeviceSession>();
  public static unknownDeviceWaitingList = new Map<string, WebSocket>();

  private static pendingTasks = new Map<string, PendingTask>();
  private static pendingRequest = new Map<string, string>();
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
  public static sendToClient(userId: string, data: DataPayload) {
    const tabs = this.userClients.get(userId);
    if (!tabs) return;
    const payload = JSON.stringify(data);
    for (const session of tabs) {
      session.send(payload);
    }
  }
}
