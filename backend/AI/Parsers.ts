import {
  updateMemory,
  getMemory,
  deleteMemory,
  accessMemory,
  MemoryResponseType,
} from "../services/memory.service.js";
import { WebSocketService } from "../services/websocket/WS_OOP.js";
import { summarizeBase64Image } from "./Helper/image.summarizer.js";
import { getRealMessage } from "./Helper/middleMsg.generator.js";
import { ChatMessageType } from "./Types.js";
import {
  CommandParserResponseType,
  CommandTypes,
  InBuiltParam,
  ParametersType,
} from "./Types/ParserTypes.js";

export function extractJSON(text: string): any {
  if (!text || typeof text !== "string") return null;

  let cleanText = text.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText
      .replace(/^```json/i, "")
      .replace(/```$/i, "")
      .trim();
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```/i, "").replace(/```$/i, "").trim();
  }

  const tryParse = (raw: string): any => {
    // 1. Strip out bad control characters (raw newlines, tabs) that break JSON.parse inside string literals
    let jsonStr = raw.replace(/[\x00-\x1F]+/g, " ");

    // Auto-escape unescaped backslashes (frequent issue with Windows paths from AI)
    jsonStr = jsonStr.replace(/(?<!\\)\\(?![\\"/bfnrtu])/g, "\\\\");

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // 2. Attempt to auto-fix missing commas between fields (e.g. before "msg": or "cmd":)
      try {
        const fixed = jsonStr.replace(
          /"\s*(?="msg"\s*:|"cmd"\s*:|"workingon"\s*:)/g,
          '",',
        );
        return JSON.parse(fixed);
      } catch {
        return null;
      }
    }
  };

  // Try direct parse first
  const direct = tryParse(cleanText);
  if (direct && typeof direct === "object") return direct;

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    // Try the outermost brace pair
    const fullSpan = cleanText.substring(firstBrace, lastBrace + 1);
    const parsedFull = tryParse(fullSpan);
    if (parsedFull && typeof parsedFull === "object") return parsedFull;

    // If full span failed, check if there's a clean trailing '{"cmd"' or '{"action"' block
    // (Addresses cases where AI emitted a broken preamble chunk before the valid JSON object)
    const lastCmdIndex = cleanText.lastIndexOf('"cmd"');
    if (lastCmdIndex !== -1) {
      const candidateBrace = cleanText.lastIndexOf("{", lastCmdIndex);
      if (candidateBrace !== -1 && candidateBrace > firstBrace) {
        const candidateSpan = cleanText.substring(
          candidateBrace,
          lastBrace + 1,
        );
        const parsedCandidate = tryParse(candidateSpan);
        if (parsedCandidate && typeof parsedCandidate === "object")
          return parsedCandidate;
      }
    }
  }

  // 3. Fallback: try to extract 'msg' and 'cmd' using Regex if JSON parsing completely fails.
  let fallbackMsg: string | undefined = undefined;
  let fallbackCmd: string | undefined = undefined;

  const msgMatch = cleanText.match(/"msg"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (msgMatch) {
    try {
      fallbackMsg = JSON.parse('"' + msgMatch[1] + '"');
    } catch {
      fallbackMsg = msgMatch[1];
    }
  }

  const cmdMatch = cleanText.match(/"cmd"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  if (cmdMatch) {
    try {
      fallbackCmd = JSON.parse('"' + cmdMatch[1] + '"');
    } catch {
      fallbackCmd = cmdMatch[1];
    }
  }

  if (fallbackMsg !== undefined || fallbackCmd !== undefined) {
    console.warn("Salvaged msg/cmd via regex fallback!");
    return { msg: fallbackMsg || "", cmd: fallbackCmd || "" };
  }

  return null;
}

export const unwrapper = (cmd: string): string => {
  let unwrapped = (cmd || "")
    .replace(/^powershell(?:\.exe)?.*?(?:-Command|-c)\s+/i, "")
    .trim();
  return (unwrapped.startsWith('"') && unwrapped.endsWith('"')) ||
    (unwrapped.startsWith("'") && unwrapped.endsWith("'"))
    ? unwrapped.slice(1, -1)
    : unwrapped;
};

export const cleanTerminalOutput = (raw: string): string => {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/[\u001b\x1b]\[\d+;\d+[Hhf]/g, "\n")
    .replace(/[\u001b\x1b]\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\u001b\x1b]\([a-zA-Z]/g, "")
    .replace(/[\u001b\x1b][=>]/g, "")
    .replace(/(?:\x1b\]|\u001b\]|\])0;[^\x07\x1b\r\n]*(?:\x07|\x1b\\)?/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export function parseAIResponse(data: any): string {
  let responseText = "";
  if (typeof data === "string") {
    // Check if the response is a Server-Sent Events (SSE) stream text
    if (data.includes("event:") || data.includes("data:")) {
      const lines = data.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.delta && typeof parsed.delta.text === "string") {
                responseText += parsed.delta.text;
              } else if (
                parsed.content_block &&
                typeof parsed.content_block.text === "string"
              ) {
                responseText += parsed.content_block.text;
              }
            }
          } catch (e) {
            // Ignore parse errors for partial lines
          }
        }
      }
    } else {
      responseText = data;
    }
  } else if (
    data &&
    data.content &&
    Array.isArray(data.content) &&
    data.content[0]
  ) {
    // Anthropic style format
    responseText = data.content[0].text || "";
  } else if (
    data &&
    data.choices &&
    Array.isArray(data.choices) &&
    data.choices[0]?.message
  ) {
    // OpenAI style format
    responseText = data.choices[0].message.content || "";
  } else if (data && typeof data.response === "string") {
    // Simple wrapper format
    responseText = data.response;
  } else {
    throw new Error(
      `Unexpected API response structure. Keys present: ${Object.keys(data || {}).join(", ")}`,
    );
  }
  return responseText;
}
export const commandParser = async (
  userId: string,
  cmd: CommandTypes,
  chatMessages: ChatMessageType[],
  deviceId: string,
  sessionId?: string,
): Promise<CommandParserResponseType> => {
  let returningCmd: string = JSON.stringify(cmd);
  let finalResponse: CommandParserResponseType = {
    cmd: returningCmd,
    msg: "No command Runs!",
    terminalOutput: "",
    terminalError: "",
    isSuccess: false,
    imageBase64: undefined,
    exitCode: undefined,
  };
  const commandHandlerDict = {
    search: async () => {
      const { expected_name } = (cmd.param as ParametersType<"search">) || {};
      if (!expected_name) {
        finalResponse.msg = "Missing parameters: expected_name is required";
        finalResponse.terminalError = "Missing parameters";
        finalResponse.isSuccess = false;
        return;
      }
      try {
        const searchResults: any = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          returningCmd,
        );
        finalResponse.cmd = returningCmd;
        finalResponse.msg = searchResults?.msg || "";
        finalResponse.terminalOutput = searchResults?.terminalOutput || "";
        finalResponse.terminalError = searchResults?.terminalError || "";
        finalResponse.isSuccess = Boolean(searchResults?.isSuccess);
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}`;
        finalResponse.isSuccess = false;
      }
    },
    search_app: async () => {
      try {
        const results = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          returningCmd,
        );
        finalResponse.cmd = returningCmd;
        finalResponse.msg = results?.msg || "";
        finalResponse.terminalOutput = results?.terminalOutput || "";
        finalResponse.terminalError = results?.terminalError || "";
        finalResponse.isSuccess = Boolean(results?.isSuccess);
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}.`;
        finalResponse.isSuccess = false;
      }
    },
    launch_app: async () => {
      try {
        const results = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          returningCmd,
        );
        finalResponse.cmd = returningCmd;
        finalResponse.msg = results?.msg || "";
        finalResponse.terminalOutput = results?.terminalOutput || "";
        finalResponse.terminalError = results?.terminalError || "";
        finalResponse.isSuccess = Boolean(results?.isSuccess);
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}.`;
        finalResponse.isSuccess = false;
      }
    },
    system_info: async () => {
      try {
        const sysInfo = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          returningCmd,
        );
        finalResponse.cmd = returningCmd;
        finalResponse.msg = sysInfo?.msg || "";
        finalResponse.terminalOutput = sysInfo?.terminalOutput || "";
        finalResponse.terminalError = sysInfo?.terminalError || "";
        finalResponse.isSuccess = Boolean(sysInfo?.isSuccess);
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}`;
        finalResponse.isSuccess = false;
      }
    },
    memory_write: async () => {
      const { alias, value, category } =
        cmd.param as ParametersType<"memory_write">;
      const result: MemoryResponseType = await updateMemory(
        userId,
        alias,
        value,
        category,
      );
      finalResponse.cmd = returningCmd;
      finalResponse.msg = result.msg;
      finalResponse.terminalOutput = JSON.stringify(
        result?.document || result,
        null,
        2,
      );
      finalResponse.terminalError = "";
      finalResponse.isSuccess = result?.success || true;
    },
    memory_read: async () => {
      const { alias, category } = cmd.param as ParametersType<"memory_read">;
      const result: MemoryResponseType = await getMemory(
        userId,
        alias || "",
        category || "",
      );
      finalResponse.cmd = returningCmd;
      finalResponse.msg = result.msg;
      finalResponse.terminalOutput = JSON.stringify(
        result?.document || result,
        null,
        2,
      );
      finalResponse.terminalError = "";
      finalResponse.isSuccess = result?.success || true;
    },
    memory_delete: async () => {
      const { value, alias, category } =
        cmd.param as ParametersType<"memory_delete">;
      const result: MemoryResponseType = await deleteMemory(
        userId,
        value,
        alias || "",
        category || "",
      );
      finalResponse.cmd = returningCmd;
      finalResponse.msg = result.msg;
      finalResponse.terminalOutput = JSON.stringify(
        result?.document || result,
        null,
        2,
      );
      finalResponse.terminalError = "";
      finalResponse.isSuccess = result?.success || true;
    },
    capture_screen: async () => {
      try {
        const moreContext = (cmd.param as string) || "";
        const localResponse = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          returningCmd,
        );
        if (!localResponse?.isSuccess || !localResponse?.imageBase64) {
          finalResponse.cmd = returningCmd;
          finalResponse.msg = localResponse?.msg || "Image Not Captured";
          finalResponse.terminalOutput = "Image Not Captured";
          finalResponse.terminalError =
            localResponse?.terminalError ||
            "Could not capture screenshot from local machine.";
          finalResponse.isSuccess = false;
          return;
        }

        const summarized = await summarizeBase64Image(
          localResponse.imageBase64,
          chatMessages,
          moreContext,
        );

        finalResponse.cmd = returningCmd;
        finalResponse.msg = "";
        finalResponse.terminalOutput = summarized
          ? summarized.summary
          : "Image Captured but Summarization Failed";
        finalResponse.terminalError = "";
        finalResponse.isSuccess = !!summarized;
        finalResponse.imageBase64 = summarized
          ? summarized.base64
          : localResponse.imageBase64;
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}.`;
        finalResponse.isSuccess = false;
      }
    },
    terminal: async () => {
      let commandPayload: any;
      let timeoutMs = 30000;

      if (
        typeof cmd.param === "object" &&
        cmd.param !== null &&
        "command" in cmd.param
      ) {
        const inBuilt = cmd.param as InBuiltParam;
        timeoutMs = inBuilt.timeout ? Number(inBuilt.timeout) * 1000 : 30000;
        const cleanCmd = (inBuilt.command || "").replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          "$2",
        );
        const sanitizedCmd = unwrapper(cleanCmd);
        commandPayload = {
          Command: sanitizedCmd,
          TimeoutSeconds: inBuilt.timeout || Math.round(timeoutMs / 1000),
          TaskId: inBuilt.taskId,
          IsDaemon: Boolean(inBuilt.isDaemon || cmd.isDaemon),
        };
      } else {
        const raw = (
          typeof cmd.param === "string"
            ? cmd.param
            : JSON.stringify(cmd.param || "")
        ).replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$2");
        const rawCmd = unwrapper(raw);
        timeoutMs =
          cmd.timeout && !isNaN(Number(cmd.timeout))
            ? Number(cmd.timeout)
            : 30000;
        commandPayload = {
          Command: rawCmd,
          TimeoutSeconds: Math.round(timeoutMs / 1000),
          IsDaemon: Boolean(cmd.isDaemon),
        };
      }

      try {
        const executionResponse: any = await WebSocketService.sendCmdRequest(
          userId,
          deviceId,
          commandPayload,
          timeoutMs,
        );
        finalResponse.cmd = commandPayload.Command;
        finalResponse.msg = executionResponse?.msg || "";
        finalResponse.terminalOutput = executionResponse?.terminalOutput || "";
        finalResponse.terminalError = executionResponse?.terminalError || "";
        finalResponse.exitCode = executionResponse?.exitCode;
        finalResponse.isSuccess = Boolean(executionResponse?.isSuccess);
        if (executionResponse?.exitCode === null && executionResponse?.taskId) {
          const isDaemon =
            Boolean(commandPayload.IsDaemon) ||
            /\bping\s+.*-t\b/i.test(commandPayload.Command) ||
            /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve)\b/i.test(
              commandPayload.Command,
            ) ||
            /\b(uvicorn|flask\s+run|nodemon|live-server|http-server)\b/i.test(
              commandPayload.Command,
            ) ||
            /\bpython(\d+)?(\.exe)?\s+.*(server|app|main)\.py\b/i.test(
              commandPayload.Command,
            );

          if (isDaemon) {
            finalResponse.terminalOutput =
              executionResponse.terminalOutput ||
              `Started background daemon "${commandPayload.Command}" (Task ID: ${executionResponse.taskId})`;
            finalResponse.exitCode = 0;
            finalResponse.isSuccess = true;
            finalResponse.msg = `Started background daemon "${commandPayload.Command}"`;
          } else {
            const userGoalMessage =
              chatMessages[chatMessages.length - 1]?.content ||
              "user goal not defined!";
            const aiworkingon =
              (sessionId ? WebSocketService.activeSessions.get(sessionId)?.workingon : "") ||
              "Executing task in background...";
            const midProcessMsg = await getRealMessage(
              userGoalMessage,
              aiworkingon,
              commandPayload.Command,
            );
            if (sessionId) {
              const live = WebSocketService.activeSessions.get(sessionId);
              if (live) live.middleMsg = midProcessMsg;
            }
            // 1. Tell the user right now via WebSocket (middle message + unlock UI)
            WebSocketService.sendToClient(userId, {
              type: "background_running",
              taskId: executionResponse.taskId,
              msg: midProcessMsg,
              sessionId,
            });
            // 2. Hold the line! (Waits until websocket.service.ts wakes it up)
            const completed: any = await WebSocketService.waitForTaskCompletion(
              executionResponse.taskId,
            );
            if (sessionId) {
              const live = WebSocketService.activeSessions.get(sessionId);
              if (live) live.middleMsg = "";
            }
            finalResponse.terminalOutput = completed.terminalOutput;
            finalResponse.exitCode = completed.exitCode;
            finalResponse.isSuccess = completed.exitCode === 0;
          }
        }
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Local backend connection error";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Command execution failed: ${err.message}.`;
        finalResponse.isSuccess = false;
      }
    },
    in_built: async () => {
      // Backward compatibility alias for terminal
      await (commandHandlerDict as any).terminal();
    },
    get_devices: async () => {
      try {
        const devices = await WebSocketService.GetDevices(userId);
        finalResponse.cmd = returningCmd;
        finalResponse.msg = `Retrieved ${devices.length} device(s)`;
        finalResponse.terminalOutput = JSON.stringify(devices, null, 2);
        finalResponse.terminalError = "";
        finalResponse.isSuccess = true;
      } catch (err: any) {
        finalResponse.cmd = returningCmd;
        finalResponse.msg = "Failed to fetch devices";
        finalResponse.terminalOutput = "";
        finalResponse.terminalError = `Error fetching devices: ${err.message}`;
        finalResponse.isSuccess = false;
      }
    },
  };

  let matchedKey: string = cmd.action;

  // Auto-correct shell command emitted as action name (e.g. action: "start \"\" \"path\"")
  if (!commandHandlerDict[matchedKey as keyof typeof commandHandlerDict]) {
    const isShellCmd =
      typeof matchedKey === "string" &&
      (matchedKey.includes(" ") ||
        /^(start|code|powershell|cmd|shutdown|rundll32|type|explorer|npm|npx|node|git|taskkill|dir|cd|cls|echo)\b/i.test(
          matchedKey.trim(),
        ));

    if (isShellCmd) {
      console.warn(
        `[PARSER] Auto-correcting shell action "${matchedKey}" to "terminal"`,
      );
      const combinedParam = cmd.param
        ? `${matchedKey} ${typeof cmd.param === "string" ? cmd.param : JSON.stringify(cmd.param)}`
        : matchedKey;
      (cmd as any).param = combinedParam;
      (cmd as any).action = "terminal";
      returningCmd = JSON.stringify(cmd);
      matchedKey = "terminal";
    }
  }

  if (commandHandlerDict[matchedKey as keyof typeof commandHandlerDict]) {
    await commandHandlerDict[matchedKey as keyof typeof commandHandlerDict]();
  }
  finalResponse.terminalOutput = cleanTerminalOutput(
    finalResponse.terminalOutput,
  );
  finalResponse.terminalError = cleanTerminalOutput(
    finalResponse.terminalError,
  );
  return finalResponse;
};
