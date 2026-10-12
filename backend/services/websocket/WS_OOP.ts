import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage, Server } from "http";
import { ActiveSessions, CustomWebSocket, PendingTask } from "./Types.js";
import { verifyToken } from "../jwt.service.js";

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
      console.error("Invalid JSON", error);
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
  private id: string = "";
  private name: string = "";
  private Ip: string = "";
  private service: boolean = false;
  private watchdotTimer: NodeJS.Timeout | null = null;
  constructor(
    public ws: WebSocket,
    public userId: string,
  ) {
    super(ws, userId);
  }
  protected override async onMessage(data: any) {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === "auth") {
        // Handle the auth for the device
      }
    } catch (error) {
      console.error("Invalid JSON", error);
    }
  }
  protected override async Init(){
     
  };
  protected override onClose() {
    console.log(`Device Disconnected (${this.id})`);
  }
}

type DataPayload = {
  type: string;
  payload: object | null;
};
type ClientTabs = Set<ClientSession>;

export class WebSocketService {
  private static wss: WebSocketServer;
  public static userClients = new Map<string, ClientTabs>();
  public static activeSessions = new Map<string, ActiveSessions>();
  private static pendingTasks = new Map<string, PendingTask>();
  private static pendingRequest = new Map<string, string>();

  public static init(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.onConnection(ws, req);
    });
  }
  private static async onConnection(ws: WebSocket, req: IncomingMessage) {
    ws.once("message", async (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "auth") {
        const token = data.token.replace(/^Bearer\s*/i, "").trim();
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
          new ClientDeviceSession(ws, decoded.token.userId);
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
