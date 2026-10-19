import app from "./app.js";
import dotenv from "dotenv";
import http, { Server } from "http";
import { initializeKeys } from "./EnvVariables.js";
import { liveGeminiAICall } from "./AI/Providers/geminiAI.js";
import { WebSocketService } from "./services/websocket/websocket.main.service.js";
dotenv.config();

await initializeKeys();
const PORT: number = Number(process.env.PORT) || 3100;

const server: Server = http.createServer(app);
WebSocketService.init(server);
// initWebsocket(server);

server.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
});
