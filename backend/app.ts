import express from "express";
import dotenv from "dotenv";
import chatRoutes from "./routes/chat.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import cors from "cors";
import { connectDB } from "./db/connectDB.js";
import authRoutes from "./routes/auth.routes.js";
import testCmdRoutes from "./routes/TestCMD.routes.js";
import { userAuthentication } from "./middlewares/auth/authUserLogin.js";
import {
  startParingHandler,
  revokeDeviceHandler,
  revokeSelfHandler,
} from "./services/websocket/websocket.main.service.js";
import { UserModel } from "./db/schema/user-schema.js";

connectDB();
dotenv.config();
const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*", // Frontend url should be here!
    credentials: true,
  }),
);

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (err instanceof SyntaxError && "status" in err && err.status === 400) {
      console.error("[SERVER] Invalid JSON payload received:", err.message);
      res.status(400).json({
        success: false,
        message: "Invalid JSON payload",
        data: null,
      });
      return;
    }
    next(err);
  },
);

// --- 1. HEALTH CHECK ---
app.get("/api/health", async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Health check successful",
    data: {
      lastAIMsg: "Hi there! What can I do for you?",
      lastCMD: "",
      terminal: "",
      terminalError: "",
    },
  });
});

app.post("/api/pairrequest", userAuthentication, startParingHandler);
app.use("/api/chat", chatRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/devices", userAuthentication, deviceRoutes);
app.post("/api/device/revoke-self", revokeSelfHandler);
app.delete("/api/device/revoke-self", revokeSelfHandler);
app.delete("/api/device/:deviceId", userAuthentication, revokeDeviceHandler);
app.use("/api/test-cmd", userAuthentication, testCmdRoutes);
export default app;
