import { WebSocketService } from "../services/websocket/websocket.main.service.js";
import { ChatMessageType } from "../AI/Types.js";
import { summarize } from "../AI/Helper/para.summarizer.js";
import { askAI } from "../AI/AskAI.js";
import { getChat, setChat } from "../services/chat.history.service.js";
import { SessionModel } from "../db/schema/session-schema.js";
import { ModelType } from "../AI/CallAI.js";
import chatSummarize from "../AI/Helper/chatname.summarizer.js";

const activeSessions = new Set<string>();
export const sendMessage = async (req: any, res: any) => {
  const defaultModel: ModelType = {
    provider: "gemini",
    name: "gemini-3.6-flash",
    isLiveModel: false,
  };
  const { content, behaviour = "friendly", model = defaultModel } = req.body;
  const userId = req.userId;
  const session = req.sessionId;
  console.log(`[CHAT] User: ${userId} | Session: ${session}`);
  if (!content || !content.toString().trim() || !session || !userId) {
    res.status(400).json({
      success: false,
      message: "Message, session, and user authentication are required",
      data: null,
    });
    return;
  }
  WebSocketService.sendToClient(userId, {
    type: "new_user_message",
    sessionId: session,
    message: {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    },
  });

  try {
    WebSocketService.sendToClient(userId, {
      type: "ai_data",
      sessionId: session,
      data: {
        workingon: "Analyzing your request...",
        workingOn: "Analyzing your request...",
        msg: "",
        cmd: "",
        executions: [],
      },
    });

    // Auto-update session title if default "New Chat" and bump updatedAt
    SessionModel.updateOne(
      { _id: session, userId },
      { updatedAt: new Date() },
    ).catch(() => {});
    // Background title generation (only if session title is still "New Chat")
    SessionModel.findOne({ _id: session, userId, title: "New Chat" })
      .then(async (existingSession) => {
        if (existingSession) {
          const titleSnippet =
            (await chatSummarize([
              { role: "user", content: content.toString() },
            ])) || content.split(" ").slice(0, 4).join(" ");

          await SessionModel.updateOne(
            { _id: session, userId, title: "New Chat" },
            { title: titleSnippet },
          );
        }
      })
      .catch((err) => console.error("[TITLE GENERATION ERROR]:", err));
    // const model: ModelType = { provider: "gemini", name: "gemini-3.5-flash" };
    const {
      cmd,
      msg,
      terminalOutput,
      terminalError,
      executions,
      imageBase64,
      workedSeconds,
    } = await askAI(userId, session, content, behaviour, model);
    WebSocketService.sendToClient(userId, {
      type: "ai_done",
      sessionId: session,
      data: {
        workingon: "",
        message: {
          role: "assistant",
          content: {
            lastAIMsg: msg || "No message from AI",
            lastCMD: cmd || "",
            terminal: terminalOutput || "",
            terminalError: terminalError || "",
            executions: executions || [],
            imageBase64: imageBase64 || "",
            workedSeconds: workedSeconds || 0,
          },
          executions: executions || [],
          imageBase64: imageBase64 || "",
          workedSeconds: workedSeconds || 0,
        },
      },
    });

    console.log(`[CHAT] Processed successfully | Last CMD: ${cmd || "none"}`);

    res.json({
      success: true,
      message: "Chat message processed successfully",
      sessionId: session,
      data: {
        lastAIMsg: msg || "No message from AI",
        lastCMD: cmd,
        terminal: terminalOutput || "",
        terminalError: terminalError || "",
        executions: executions,
        imageBase64: imageBase64 || "",
        workedSeconds: workedSeconds,
      },
    });

    async function summarizeBackground() {
      const prevChatMessages: ChatMessageType[] | [] =
        (await getChat(userId.toString(), session, 20))?.chat || [];
      if (prevChatMessages.length < 10) {
        return;
      }

      const summaryTitle = `summary_chat_${session}`;
      let summarySessionDoc: any = await SessionModel.findOne({
        userId,
        title: summaryTitle,
      });

      const prevSummary: ChatMessageType[] | [] = summarySessionDoc
        ? (await getChat(userId, summarySessionDoc._id.toString(), 1))?.chat ||
          []
        : [];

      const allContextToSummarize = [...prevSummary, ...prevChatMessages];
      const summaryResult = await summarize(allContextToSummarize, session);
      if (summaryResult.length > 0) {
        if (!summarySessionDoc) {
          summarySessionDoc = await SessionModel.create({
            userId,
            title: summaryTitle,
          });
        }
        await setChat(userId.toString(), summarySessionDoc._id.toString(), {
          role: "assistant",
          content: summaryResult,
        });
      }
    }
    summarizeBackground().catch((err) =>
      console.error("[BACKGROUND SUMMARY ERROR]: ", err),
    );
  } catch (error: any) {
    WebSocketService.sendToClient(userId, {
      type: "ai_done",
      sessionId: session,
      data: {
        workingon: "",
        message: {
          role: "assistant",
          content: {
            lastAIMsg: error.message || "An error occurred",
            lastCMD: "",
            terminal: "",
            terminalError: error.message || "",
            executions: [],
            imageBase64: "",
            workedSeconds: 0,
          },
          executions: [],
          workedSeconds: 0,
        },
      },
    });
    console.error("[CHAT ERROR]:", error.message || error);
    res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred",
      data: null,
    });
  }
};
