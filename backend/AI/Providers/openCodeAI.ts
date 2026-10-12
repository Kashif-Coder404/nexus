import axios from "axios";
import { instructions } from "../instructions/main.Instructions.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { OPEN_CODE } from "../../EnvVariables.js";

const OPEN_CODE_API_KEY = OPEN_CODE;

export const openCodeAICall = async (
  chatMessages: Array<{ role: string; content: string }>,
  retryCount: number = 0,
): Promise<{
  content: {
    cmd: string;
    msg: string;
    workingon: string;
  };
  success: boolean;
}> => {
  if (retryCount >= 2) {
    return {
      success: false,
      content: {
        cmd: "",
        msg: "OpenCode API Failed or Rate Limited!",
        workingon: "",
      },
    };
  }

  // Common free models are gpt-3.5-turbo or gpt-4o-mini
  const model = "deepseek-v4-pro";

  // From your screenshot: Webshare's Rotating Proxy Endpoint
  const proxy = `http://ykowtycz-rotate:9g9v96c9zsux@p.webshare.io:80/`;
  const agent = new HttpsProxyAgent(proxy);

  const MessageToAI = [
    {
      role: "system",
      content: instructions,
    },
    ...chatMessages,
  ];
  try {
    const response = await axios.post(
      "https://opencode.ai/zen/v1/chat/completions", // IMPORTANT: Change this URL if your youtube tutorial uses a different OpenCode endpoint
      {
        model: model,
        messages: MessageToAI,
        temperature: 0.5,
        response_format: {
          type: "json_object",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${OPEN_CODE_API_KEY}`,
          "Content-Type": "application/json",
        },
        // httpsAgent: agent,
      },
    );
    const messageContent = response.data.choices[0].message.content;
    const parsedContent =
      typeof messageContent === "string"
        ? JSON.parse(messageContent)
        : messageContent;

    return {
      content: parsedContent,
      success: true,
    };
  } catch (error: any) {
    console.error("[OPENCODE AI] API CALL FAILED");
    const isRateLimited = error.response && error.response.status === 429;

    if (isRateLimited) {
      console.warn(
        `[OPENCODE AI] Rate limited. Retrying... (Retry ${retryCount + 1}/2)`,
      );
      // return openCodeAICall(chatMessages, retryCount + 1);
    }
    if (error.response) {
      console.error("[OPENCODE AI] Status:", error.response.status);
      console.error("[OPENCODE AI] Error Details:", error.response.data);
    } else {
      console.error("[OPENCODE AI] Error Message:", error.message);
    }
    return {
      success: false,
      content: {
        cmd: "",
        msg: "OpenCode API Failed!",
        workingon: "",
      },
    };
  }
};
