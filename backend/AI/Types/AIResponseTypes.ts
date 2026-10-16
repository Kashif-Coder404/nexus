
export type GeminiResponse = {
  content: {
    cmd: string;
    msg: string;
    workingon: string;
  };
  success: boolean;
  usedKeyIndex?: number;
};
export type AIResponse = {
  cmd: string;
  msg: string;
  terminalOutput: string;
  terminalError: string;
  imageBase64?: string;
};

export type CommandExecutionType = {
  steps: number;
  cmd: {
    action?: string;
    param?: any;
  };
  msg: string;
  terminalOutput: string;
  terminalError: string;
  isSuccess: boolean;
  exitCode?: string;
  duration?: string;
  cwd?: string;
  image?: string;
};
