import { callAI } from "../CallAI.js";
import { chatnameInstructions } from "../instructions/chatname.instructions.js";

const chatTitleSummarizer = async (chatMessage: any): Promise<string> => {
  const summarized = await callAI("gemini", {
    chatMessages: chatMessage || [],
    isJson: false,
    instructions: chatnameInstructions,
    session: "",
    isLiveModel: true,
    model: "gemini-3.8-live",
  });
  //   console.log(summarized);
  if (summarized.success === false) {
    console.warn(
      "[CHAT TITLE] Live model title generation failed, retrying with flash lite...",
    );
  } else {
    return summarized.rawContent || summarized.msg;
  }
  const summarized2 = await callAI("gemini", {
    chatMessages: chatMessage || [],
    isJson: false,
    instructions: chatnameInstructions,
    session: "",
    isLiveModel: false,
    model: "gemini-3.5-flash-lite",
  });
  if (summarized2.success === false) {
    return chatMessage[0].content.substring(0, 25);
  }
  return summarized2.rawContent || summarized2.msg;
};
export default chatTitleSummarizer;
