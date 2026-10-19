import { SessionModel } from "../db/schema/session-schema.js";
import { getChat, setChat } from "../services/chat.history.service.js";
import { uploadScreenshotToCloudinary } from "../services/claudinary.service.js";
import { WebSocketService } from "../services/websocket/websocket.main.service.js";
import { callAI, ModelType } from "./CallAI.js";
import { testingInstructions } from "./instructions/main.instrcutions.testing.js";

import {
  instructions,
  system_warning,
} from "./instructions/main.Instructions.js";
import {
  context_register,
  get_context,
} from "./instructions/Tools/contextRegistry.js";
import { commandParser } from "./Parsers.js";
import { ChatMessageType } from "./Types.js";
import { CommandExecutionType } from "./Types/AIResponseTypes.js";
import {
  CommandParserResponseType,
  CommandTypes,
} from "./Types/ParserTypes.js";

export class AskAI {
  public static activeRunners = new Map<string, AskAI>();
  private isAborted = false;
  private context: Map<string, string> = new Map<string, string>();
  private systemInstructions = testingInstructions("");
  public abort() {
    WebSocketService.activeSessions.delete(this.sessionId);
    this.isAborted = true;
    AskAI.activeRunners.delete(this.sessionId);
  }

  private userId: string;
  private sessionId: string;
  private userMessage: string;
  private model: ModelType;
  private deviceId: string = "";

  private retries = 0;
  private aiResponse: any = null;
  private command: string = "";
  private lastExecutedCmd: string = "";
  private terminalOutput = "";
  private terminalError = "";
  private lastStepError = "";
  private capturedImage = "";
  private isSuccessState = false;
  private workingOn = "";
  private executions: CommandExecutionType[] = [];
  private lastRawCmd: string = "";
  private duplicateCMDCount: number = 0;
  private commandRunningMsgs: ChatMessageType[] = [];

  private overstart: number = Date.now();
  private prvChat: ChatMessageType[] = [];
  constructor(
    userId: string,
    session: string,
    userMessage: string,
    model: ModelType,
    deviceId?: string,
  ) {
    this.userId = userId;
    this.sessionId = session;
    this.userMessage = userMessage;
    this.model = model;
    this.deviceId = deviceId || "";
  }
  private BuildContent(message: ChatMessageType) {
    if (message.role === "user" || message.executions?.length === 0) {
      return message.content;
    }
    const reducedExecutions = message.executions?.map((execution) => ({
      steps: execution.steps,
      executed: `with intension:'${execution.msg}' does action:'${JSON.stringify(execution.cmd.action)}' performed with parameters '${JSON.stringify(execution.cmd.param)}'`,
      output:
        this.CleanTerminalText(execution.terminalOutput || "")
          .split(/\r?\n/)
          .slice(-40)
          .join("\n") + " [Last 40 Lines]",
      error:
        this.CleanTerminalText(execution.terminalError || "")
          .split(/\r?\n/)
          .slice(-40)
          .join("\n") + " [Last 40 Lines]",
      success: execution.isSuccess + `(${execution.exitCode})`,
      image:
        execution.image || (execution as any).imageBase64
          ? "[IMAGE]"
          : "[NO IMAGE]",
    }));
    return JSON.stringify({
      msg: message.content,
      executions: reducedExecutions,
    });
  }
  private GetContextReady(chatHistory: ChatMessageType[]) {
    return chatHistory.map((message) => ({
      role: message.role,
      content: this.BuildContent(message),
    }));
  }
  private async BuildContext(): Promise<ChatMessageType[]> {
    const userId = this.userId;
    const sessionId = this.sessionId;
    const userMessage = this.userMessage;
    const rawPrevChat: ChatMessageType[] =
      (await getChat(userId, sessionId, 10))?.chat || [];

    const prevChat = this.GetContextReady(rawPrevChat);
    let summaryChat: ChatMessageType[] = [];
    const summarySessionDoc: any = await SessionModel.findOne({
      userId,
      title: `summary_chat_${sessionId}`,
    });
    if (summarySessionDoc) {
      summaryChat =
        (await getChat(userId, summarySessionDoc._id.toString(), 1))?.chat ||
        [];
    }
    const chatHistory: ChatMessageType[] = [
      ...summaryChat,
      ...prevChat,
      {
        role: "user",
        content: userMessage,
      },
    ];
    return chatHistory;
  }
  private async BroadCastTheState(
    workingOn: string = "Working...",
    msg: string = "",
    cmd?: string,
  ) {
    const status = workingOn || this.workingOn || "Working...";
    WebSocketService.sendToClient(this.userId, {
      type: "ai_data",
      sessionId: this.sessionId,
      data: {
        workingon: status,
        workingOn: status,
        msg: msg,
        cmd:
          cmd !== undefined ? cmd : this.command || this.lastExecutedCmd || "",
        executions: this.executions,
      },
    });
    const liveSession = WebSocketService.activeSessions.get(this.sessionId);
    if (liveSession) {
      liveSession.workingon = status;
      liveSession.executions = this.executions;
    }
  }
  private ExplainAction(action: string, param: any): string {
    if (action === "search") {
      return `🔍 Searching files for "${param?.expected_name || ""}"...`;
    } else if (action === "search_app") {
      return `🚀 Searching for app "${param?.name || ""}"...`;
    } else if (action === "terminal" || action === "in_built") {
      const cmdText =
        typeof param === "object" && param !== null
          ? param.command || JSON.stringify(param)
          : param || "";
      return `⚡ Running: ${cmdText}...`;
    } else if (action === "capture_screen") {
      return "📸 Capturing desktop screenshot...";
    } else if (action === "system_info") {
      return "📊 Fetching system diagnostics...";
    } else if (action === "memory_read") {
      return `🧠 Checking memory for "${param?.alias || ""}"...`;
    } else {
      return "💻 Executing command...";
    }
  }
  private CleanTerminalText(output: string): string {
    if (!output.trim()) return "";
    return output
      .replace(/[\u001b\x1b]\[[0-9;?]*[a-zA-Z]/g, "") // Strip ANSI colors
      .replace(
        /(?:\x1b\]|\u001b\]|\])9;4;[^\x1b\x07\r\n]*(?:\x07|\x1b\\|\\)?/g,
        "",
      ) // Strip winget progress
      .split(/\r?\n/)
      .filter((line) => !/^[\s\\|\/\-]+$/.test(line.trim())) // Strip spinner lines
      .slice(-40)
      .join("\n")
      .trim();
  }
  private async StartLoopChat(
    maxLimit: number = 15,
    chatHistory: ChatMessageType[],
  ) {
    AskAI.activeRunners.set(this.sessionId, this);
    while (this.retries <= maxLimit) {
      if (this.isAborted) {
        this.aiResponse = { msg: "Generation stopped by user." };
        break;
      }
      const ChatMsgs: ChatMessageType[] = [
        ...chatHistory,
        ...this.commandRunningMsgs,
      ];
      this.BroadCastTheState();
      this.aiResponse = await callAI(this.model.provider, {
        userId: this.userId,
        chatMessages: ChatMsgs,
        session: this.sessionId,
        instructions: this.systemInstructions,
        isJson: true,
        isLiveModel: this.model.isLiveModel,
        retryCount: 0,
        model: this.model.name,
      });
      const { cmd, workingon, msg, success } = this.aiResponse;
      let action = "";
      if (typeof cmd === "object" && cmd !== null) {
        action = cmd.action || "";
      } else if (typeof cmd === "string" && cmd.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(cmd);
          action = parsed.action || "";
        } catch {
          action = "";
        }
      }
      if (action === "get_context") {
        await this.GetContextForAi(cmd);
        continue;
      }

      this.BroadCastTheState(workingon, msg, cmd);
      this.commandRunningMsgs.push({
        role: "assistant",
        content: JSON.stringify(this.aiResponse.rawContent),
      });
      if (this.isAborted) break;
      if (!success) break;
      if (
        cmd == null ||
        String(cmd).trim() === "" ||
        (typeof cmd === "object" && !cmd.action)
      ) {
        break;
      }
      this.command =
        typeof cmd === "object" ? JSON.stringify(cmd) : String(cmd);

      if (this.lastRawCmd === this.command && !this.isSuccessState) {
        this.duplicateCMDCount++;
        if (this.duplicateCMDCount >= 3) {
          break;
        }
      } else {
        this.duplicateCMDCount = 0;
      }
      this.lastRawCmd = this.command;

      try {
        const parsedCMD: CommandTypes = JSON.parse(this.command);
        await this.ExecuteStep(parsedCMD, ChatMsgs);
      } catch (err: any) {
        this.terminalError += `\nRuntime Error: ${err.message}`;
        this.isSuccessState = false;
        this.commandRunningMsgs.push({
          role: "user",
          content: JSON.stringify(
            {
              status: "failed",
              command_executed: this.command || "",
              terminal_output: this.terminalOutput || "No output",
              terminal_error: this.terminalError || "",
            },
            null,
            2,
          ),
        });
      }
      this.retries++;
    }
  }
  private async GetContextForAi(cmd: any) {
    const targetName =
      typeof cmd.param === "object" ? cmd.param?.name : cmd.param;
    const flagName = (targetName || "").toUpperCase().trim();
    const manual = get_context(targetName);
    if (!manual.success) {
      this.commandRunningMsgs.push({
        role: "user",
        content: manual.error || "Failed to retrieve context",
      });
      return;
    }
    if (
      this.context.has(flagName) ||
      this.systemInstructions.includes(`[FULL CONTEXT ABOUT ${flagName} END]`)
    ) {
      this.commandRunningMsgs.push({
        role: "user",
        content: `The full instructions for "${targetName}" are ALREADY loaded in your prompt above. Do not call get_context again. Proceed to execute the command directly.`,
      });
      return;
    }
    const wrappedManualString: string = `
          [FULL CONTEXT ABOUT ${flagName} START]
          ${manual.context}
          [FULL CONTEXT ABOUT ${flagName} END]
        `;
    // 1. Silently append manual to system instructions for future turns
    this.context.set(flagName, `\n${wrappedManualString}`);
    //Solved the problem of putting context everytime at the end
    this.systemInstructions = testingInstructions(
      [...this.context.values()].join("\n"),
    );

    //AI retries with the full context about the get_context
  }
  private async ExecuteStep(
    command: CommandTypes,
    ChatMsgs: ChatMessageType[],
  ) {
    const action = command.action;
    const params = command.param;
    const stepStartTime = Date.now();
    const commandOutput: CommandParserResponseType = await commandParser(
      this.userId,
      command,
      ChatMsgs,
      this.deviceId,
      this.sessionId,
    );
    const stepDuration = ((Date.now() - stepStartTime) / 1000).toFixed(1) + "s";

    const currentCwd =
      (commandOutput as any)?.cwd ||
      (typeof params === "object" && (params as any)?.cwd) ||
      "";
    let stepImageUrl = "";
    if (commandOutput.imageBase64) {
      const uploadedUrl = await uploadScreenshotToCloudinary(
        commandOutput.imageBase64,
      );
      this.capturedImage = uploadedUrl;
      stepImageUrl = uploadedUrl;
      commandOutput.imageBase64 = "";
    }
    const RawOutput = commandOutput.terminalOutput || "";
    const RawError = commandOutput.terminalError || "";
    const displayOutput = RawOutput.split(/\r?\n/).slice(-150).join("\r\n");
    const displayError = RawError.split(/\r?\n/).slice(-150).join("\r\n");
    const CleanedOutput = this.CleanTerminalText(RawOutput);
    const CleanedError = this.CleanTerminalText(RawError);
    this.terminalOutput =
      "[Last 40 Lines]\n" + CleanedOutput + "\n[End of Last 40 Lines]";
    this.terminalError =
      "[Last 40 Lines]\n" + CleanedError + "\n[End of Last 40 Lines]";

    const StepExecution: CommandExecutionType = {
      steps: this.executions.length + 1,
      cmd: {
        action: action,
        param: params,
      },
      msg: commandOutput.msg || this.aiResponse?.msg || "",
      terminalOutput: displayOutput || "",
      terminalError: displayError || "",
      isSuccess: commandOutput.isSuccess,
      exitCode: commandOutput.exitCode?.toString() || "",
      duration: stepDuration,
      cwd: currentCwd,
      image: stepImageUrl,
    };
    this.executions.push(StepExecution); // Push to exections to show in the Frontend + Save to DB
    const actionDesc = this.ExplainAction(action, params);
    this.BroadCastTheState("Completed " + actionDesc, "", this.command);

    let currentError = CleanedError || "";
    if (
      commandOutput.exitCode !== undefined &&
      commandOutput.exitCode !== null
    ) {
      currentError += `\nEXIT CODE: ${commandOutput.exitCode}`;
    }
    this.lastStepError = currentError;
    this.isSuccessState = commandOutput.isSuccess;
    let aiTerminalError = currentError;
    if (this.duplicateCMDCount >= 1) {
      aiTerminalError =
        system_warning(
          this.lastExecutedCmd || "",
          this.duplicateCMDCount,
          this.terminalError || "",
        ) + "\n\n";
    }
    const feedbackContent = {
      status: this.isSuccessState ? "success" : "failed",
      command_executed: this.command || "",
      summary: commandOutput.msg || "",
      terminal_output: this.terminalOutput || "No output",
      terminal_error: aiTerminalError || "",
    };
    this.BroadCastTheState("✍️ Finalizing response...", "", "");
    this.commandRunningMsgs.push({
      role: "user",
      content: JSON.stringify(feedbackContent, null, 2),
    });
  }
  private async SaveTurn() {
    const totalWorkedSeconds = Math.max(
      1,
      Math.round((Date.now() - this.overstart) / 1000),
    );
    const finalMsg =
      this.aiResponse?.msg ||
      (this.retries >= 15
        ? "Maximum try reached!"
        : "AI service encountered an issue. Please try again Later.");
    const finalTurnSave: ChatMessageType[] = [
      {
        role: "user",
        content: this.userMessage,
      },
      {
        role: "assistant",
        content: finalMsg,
        executions: this.executions || [],
        workedSeconds: totalWorkedSeconds,
      },
    ];
    await setChat(this.userId, this.sessionId, finalTurnSave);
    return {
      cmd: this.lastExecutedCmd || "",
      msg: finalMsg,
      terminalOutput: this.terminalOutput || "",
      terminalError: this.isSuccessState
        ? ""
        : this.lastStepError || this.terminalError || "",
      imageBase64: this.capturedImage || "",
      executions: this.executions || [],
      workedSeconds: totalWorkedSeconds,
    };
  }
  public async run() {
    try {
      AskAI.activeRunners.set(this.sessionId, this);
      const chatHistory = await this.BuildContext();
      await this.StartLoopChat(15, chatHistory);
      return await this.SaveTurn();
    } finally {
      AskAI.activeRunners.delete(this.sessionId);
    }
  }
}
