import WebSocket from "ws";

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
