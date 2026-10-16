import { callAI } from "../CallAI.js";
import { summarizeInstructions } from "../instructions/para.summary.instructions.js";
import { ChatMessageType } from "../Types/ChatTypes.js";

export const summarizerCall = async (
  chatHistory: ChatMessageType[] = [],
  session: string,
): Promise<{ content: string; success: boolean }> => {
  if (!chatHistory || chatHistory.length === 0) {
    return { content: "", success: true };
  }

  // Format history messages into a clean text block
  // Format history messages with their executed actions
  const formattedHistory = chatHistory
    .map((msg) => {
      let actionsSummary = "";
      if (
        msg.role === "assistant" &&
        msg.executions &&
        msg.executions.length > 0
      ) {
        const actions = msg.executions
          .map((e: any) => {
            const cmdName = e.cmd?.action || "cmd";
            const intention = e.msg ? ` (${e.msg})` : "";
            return `${cmdName}${intention}`;
          })
          .join(", ");
        actionsSummary = ` [Actions Taken: ${actions}]`;
      }
      return `${msg.role}: ${msg.content}${actionsSummary}`;
    })
    .join("\n");

  const SummaryMessages = [
    {
      role: "user",
      content: `Please summarize the following chat history:\n${formattedHistory}`,
    },
  ];

  try {
    let geminiSummaryResponse = await callAI("gemini", {
      chatMessages: SummaryMessages,
      session: session,
      instructions: summarizeInstructions,
      isJson: false,
      model: "gemini-3.5-flash",
    });

    if (!geminiSummaryResponse || !geminiSummaryResponse.success) {
      console.warn("[PARA SUMMARIZER] Retrying with backup model...");
      geminiSummaryResponse = await callAI("gemini", {
        chatMessages: SummaryMessages,
        session: session,
        instructions: summarizeInstructions,
        isJson: false,
        model: "gemini-3.6-flash",
      });
    }

    if (!geminiSummaryResponse.success) {
      return {
        content: "",
        success: false,
      };
    }
    return {
      content: geminiSummaryResponse.msg,
      success: true,
    };
  } catch (error) {
    console.error(`[SUMMARY ERROR] ${error}`);
    return {
      content: "",
      success: false,
    };
  }
};

export const summarize = async (
  chatHistory: ChatMessageType[],
  session: string,
): Promise<string> => {
  try {
    if (!chatHistory || chatHistory.length === 0) return "";
    const summaryResults = await summarizerCall(chatHistory, session);
    if (!summaryResults.success || !summaryResults.content) return "";

    return `[System Context - Previous Chat Summary]: ${summaryResults.content}`;
  } catch (error) {
    console.error("[SUMMARIZER] ERROR: ", error);
    return "Error while summarizing the chat!";
  }
};
