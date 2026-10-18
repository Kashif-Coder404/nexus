import { ModelType } from "./CallAI.js";
import { AskAI } from "./AskAI_OOP.js";
import { ChatMessageType } from "./Types.js";
import { getChat, setChat } from "../services/chat.history.service.js";
import { SessionModel } from "../db/schema/session-schema.js";
import { summarize } from "./Helper/para.summarizer.js";

// Re-export type for legacy files like ChatTypes.ts

export const askAI = async (
  userId: string,
  session: string,
  userMessage: string,
  deviceId: string,
  modelOrBehaviour: string | ModelType,
  optionalModel?: ModelType,
) => {
  // Support both 4 arguments (WebSocket) and 5 arguments (HTTP controller)
  const model =
    typeof modelOrBehaviour === "object"
      ? modelOrBehaviour
      : optionalModel ||
        ({ provider: "gemini", name: "gemini-3.7-flash" } as ModelType);

  // 🚀 Instantiates your new OOP class and runs the loop!
  const runner = new AskAI(userId, session, userMessage, model, deviceId);
  return await runner.run();
};

export async function backgroundSummarize(userId: string, session: string) {
  try {
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
      ? (await getChat(userId, summarySessionDoc._id.toString(), 1))?.chat || []
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
  } catch (error: any) {
    console.error("[PARA SUMMARIZER ERROR]: ", error.message || error);
  }
}
