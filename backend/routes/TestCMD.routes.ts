import { Router } from "express";
import { WebSocketService } from "../services/websocket/WS_OOP.js";

const router = Router();

const testCMD = async (req: any, res: any) => {
  const body = req.body;
  const userId = req.userId;

  // Normalize cmd payload
  let cmdPayload = body.cmd !== undefined ? body.cmd : body;

  if (typeof cmdPayload === "string") {
    cmdPayload = {
      action: "terminal",
      param: { command: cmdPayload },
    };
  } else if (cmdPayload.command && !cmdPayload.action) {
    cmdPayload = {
      action: "terminal",
      param: cmdPayload,
    };
  }

  const timeoutMs =
    Number(body.timeoutMs) ||
    (body.timeoutSeconds ? Number(body.timeoutSeconds) * 1000 : 30000);

  const userDevices = WebSocketService.deviceClients.get(userId);
  const targetDeviceId =
    body.deviceId ||
    (userDevices && userDevices.size > 0
      ? Array.from(userDevices.keys())[0]
      : "");

  if (!targetDeviceId) {
    return res.status(404).json({
      success: false,
      message: "No active companion device found for this user.",
    });
  }

  try {
    const result = await WebSocketService.sendCmdRequest(
      userId,
      targetDeviceId,
      cmdPayload,
      timeoutMs,
    );
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute command on local device",
    });
  }
};

router.post("/", testCMD);
export default router;
