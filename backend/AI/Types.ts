import type { ChatMessageType } from "./Types/ChatTypes.js";
import type {
  AIResponse,
  GeminiResponse,
} from "./Types/AIResponseTypes.js";
import { commandParserType } from "./Types/ParserTypes.js";
export type {
  ChatMessageType,
  GeminiResponse,
  AIResponse,
  commandParserType,
};
export interface IncomingWSPayload {
  // 1. Message ka Type
  type:
    | "PairingInit"
    | "pairinginit"
    | "auth"
    | "ping"
    | "device_status"
    | "get_devices"
    | "cmd_response"
    | "cmd_chunk"
    | "task_finished"
    | "task_promoted"
    | "revoke-device"
    | "stop_ai";

  // 2. Pairing & Auth fields
  code?: string;
  token?: string;
  ipAddress?: string;
  service?: boolean;

  // 3. Command Execution & Background Tasks
  requestId?: string;
  cmdResponse?: any;
  taskId?: string;
  chunk?: string;
  exitCode?: number;
  terminalOutput?: string;
  pid?: number;
  cmd?: string;

  // 4. Session & Device Management
  sessionId?: string;
  deviceId?: string;
  deviceToken?: string;

  // 5. Fallback data container (agar koi nested bheje)
  data?: any;
}
