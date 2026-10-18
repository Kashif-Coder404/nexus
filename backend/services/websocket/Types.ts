import { WebSocket } from "ws";
import { CommandExecutionType } from "../../AI/Types/AIResponseTypes.js";
import { ClientSession } from "./WS_OOP.js";

export type ClientTabs = Set<ClientSession>;

export interface CustomWebSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
  deviceId?: string;
  deviceName?: string;
  isAuthenticated?: boolean;
  pairingCode?: string;
  service?: boolean;
  ipAddress?: string;
  watchdogTimer?: NodeJS.Timeout | null;
}

export interface ActiveSessions {
  userId: string;
  sessionId: string;
  userMessage: string;
  workingon: string;
  executions: any[];
  middleMsg?: string;
}

export interface ActiveBackgroundTask {
  userId: string;
  sessionId: string;
  command: string;
  model?: any;
}

export interface PendingTask {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

// 1. Device Status Update (Frontend ke liye)
export interface WSDeviceStatusMsg {
  type: "device_status";
  device: {
    id: string;
    deviceName: string;
    ipAddress?: string;
    userId?: string;
    isService?: boolean;
  };
  online: boolean;
  service?: boolean;
}

// 2. Full Device List (Jab frontend get_devices maange)
export interface WSDeviceListMsg {
  type: "device_list";
  devices: Array<{
    id: string;
    deviceName: string;
    online: boolean;
    service: boolean;
    ipAddress?: string;
  }>;
}

// 3. Pairing Responses (Companion & Web ke liye)
export interface WSPairingSuccessMsg {
  type: "PairingSuccess";
  token?: string;
  userId?: string;
  deviceId?: string;
}

export interface WSPairingFailedMsg {
  type: "PairingFailed";
  message: string;
}

// 4. Command Streaming & Results (AI & Terminal ke liye)
export interface WSCmdChunkMsg {
  type: "cmd_chunk";
  taskId: string;
  chunk: string;
}

export interface WSTaskFinishedMsg {
  type: "task_finished";
  taskId: string;
  exitCode: number;
  terminalOutput: string;
}

export interface WSTaskPromotedMsg {
  type: "task_promoted";
  taskId: string;
  pid: number;
  cmd: string;
}

export interface WSDeviceRemovedMsg {
  type: "device_removed";
  deviceId: string;
}

// A. Companion Device Messages (Backend -> PC)
export interface WSRunCmdMsg {
  type: "RunCMD";
  cmd: any;
  requestId: string;
}

export interface WSKillTaskMsg {
  type: "kill_task";
  taskId?: string;
  pid?: number;
}

export interface WSPongMsg {
  type: "pong";
}

export interface WSRevokeResponseMsg {
  type: "RevokeResponse";
}
export interface WSStopedResponse {
  type: "stoped_response";
  sessionId: string;
}

export interface WSNewUserMessage {
  type: "new_user_message";
  sessionId: string;
  message: {
    role: "user";
    content: string;
    timestamp: string;
  };
}

export interface WSBackgroundRunningMsg {
  type: "background_running";
  taskId: string;
  msg: string;
  sessionId?: string;
}

export interface WSFinalAIMsg {
  type: "ai_done";
  sessionId: string;
  data: {
    workingon: "";
    message: {
      role: "assistant";
      content: {
        lastAIMsg: string;
        lastCMD: string;
        terminal: string;
        terminalError: string;
        executions: CommandExecutionType[] | [];
        imageBase64: string;
        workedSeconds: number;
      };
      executions: CommandExecutionType[] | [];
      imageBase64?: string;
      workedSeconds: number;
    };
  };
}
export interface WSAIDataMsg {
  type: "ai_data";
  sessionId: string;
  data: {
    workingon: string;
    workingOn?: string;
    msg: string;
    cmd: string;
    executions: CommandExecutionType[] | [];
  };
}

export interface WSSessionStateMsg {
  type: "session_state";
  sessionId: string;
  isRunning: boolean;
  data?: {
    workingon?: string;
    workingOn?: string;
    executions?: CommandExecutionType[] | [];
    userMessage?: string;
    middleMsg?: string;
  };
}

// Messages specifically sent to Companion Devices:
export type ClientDeviceOutboundPayload =
  | WSRunCmdMsg
  | WSKillTaskMsg
  | WSPairingSuccessMsg
  | WSPairingFailedMsg
  | WSPongMsg
  | WSRevokeResponseMsg;

// B. Web Client Messages (Backend -> Browser)

export type ClientSessionOutboundPayload =
  | WSDeviceStatusMsg
  | WSDeviceListMsg
  | WSPairingSuccessMsg
  | WSPairingFailedMsg
  | WSCmdChunkMsg
  | WSTaskFinishedMsg
  | WSTaskPromotedMsg
  | WSDeviceRemovedMsg
  | WSStopedResponse
  | WSNewUserMessage
  | WSBackgroundRunningMsg
  | WSFinalAIMsg
  | WSAIDataMsg
  | WSSessionStateMsg;

// Generic fallback if needed
export type OutboundWSPayload =
  | ClientSessionOutboundPayload
  | ClientDeviceOutboundPayload;
