import { callAI } from "../CallAI.js";
import { middleMsgInstructions } from "../instructions/middleMsg.instructions.js";

export const getRealMessage = async (
  userGoal: string,
  AiGoal: string,
  command: string,
) => {
  const fallback = `Currently Running ${command.slice(0, 20)}... please wait a short moment...`;
  try {
    const prompt = `USER MSG: ${userGoal}\nAI MSG: ${AiGoal}\nCommand:"${command}"`;
    const response = await callAI("gemini", {
      chatMessages: [{ role: "user", content: prompt }],
      session: "",
      instructions: middleMsgInstructions,
      isJson: false,
      isLiveModel: true,
      model: "gemini-3.8-live",
      retryCount: 1,
    });
    return response.msg || response.rawContent || fallback;
  } catch (error) {
    return fallback;
  }
};
