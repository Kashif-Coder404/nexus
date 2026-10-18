import { ChatMessageType } from "./ChatTypes.js";

export type BaseCommandType<
  A extends keyof ActionTypes = keyof ActionTypes,
  P = ActionTypes[A],
> = {
  action: A;
  param?: P;
  timeout?: number;
  isDaemon?: boolean;
};
export interface InBuiltParam {
  command: string;
  timeout?: number; // Timeout in seconds
  taskId?: string;
  isDaemon?: boolean;
}

export type MatchKeyType = keyof ActionTypes;
export interface ActionTypes {
  terminal: InBuiltParam | string; // AI MUST USE IT TO CALL REAL COMMANDS
  in_built?: InBuiltParam | string; // Backward compatibility alias
  memory_read: { alias?: string; category?: string };
  memory_write: { alias: string; value: string; category: string };
  memory_delete: { value: string; alias?: string; category?: string };
  search_app: {
    isDeepSearch?: boolean;
    name: string;
    extension?: string;
    extention?: string;
  };
  search: {
    path?: string;
    expected_name: string;
    extension?: string;
    isDeepSearch?: boolean;
    type?: "folder" | "file" | "all";
  };
  capture_screen: string;
  volume_up: { level?: number; times: number };
  volume_down: { level?: number; times: number };
  current_volume: { level?: number; times?: number };
  mute: { level?: number; times?: number };
  unmute: { level?: number; times?: number };
  launch_app: {
    application: string;
  };
  system_info?: Record<string, any> | string;
  get_devices?: Record<string, any> | {};
}

export type ParametersType<p extends keyof ActionTypes> = ActionTypes[p];

export type CommandTypes = {
  action: keyof ActionTypes;
  param?: ParametersType<keyof ActionTypes>;
  timeout?: number;
  isDaemon?: boolean;
};
export type commandParserType = {
  cmd: CommandTypes;
  session: string;
  chatMessages: ChatMessageType[];
};
export type CommandParserResponseType = {
  cmd: string;
  msg: string;
  terminalOutput: string;
  terminalError: string;
  isSuccess: boolean;
  exitCode?: number;
  imageBase64?: string;
  taskId?: string;
  pid?: string;
};
