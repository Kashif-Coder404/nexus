import axios from "axios";
import { instructions } from "../instructions/main.Instructions.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  GROQ_KEY_COLLEGE_WISE,
  GROQ_KEY_BGMI_15,
} from "../../EnvVariables.js";

const GROQ_API_KEYs = [
  GROQ_KEY_COLLEGE_WISE,
  GROQ_KEY_BGMI_15,
].filter(Boolean) as string[];

let globalKeyIndex = 0;

// Function to cycle through keys
function getNextGroqKey() {
  const key = GROQ_API_KEYs[globalKeyIndex];
  globalKeyIndex = (globalKeyIndex + 1) % GROQ_API_KEYs.length;
  return key;
}

// MAIN: API CALL FUNCTION

export const groqAICall = async (
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
  if (retryCount >= GROQ_API_KEYs.length) {
    return {
      success: false,
      content: {
        cmd: "",
        msg: "All Groq API Keys Failed or Rate Limited!",
        workingon: "",
      },
    };
  }

  const model = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
  const current_key = getNextGroqKey();
  // From your screenshot: Webshare's Rotating Proxy Endpoint
  // This single endpoint automatically assigns a random IP on every request!
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
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: model[2],
        messages: MessageToAI,
        temperature: 0.5,
        response_format: {
          type: "json_object",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${current_key}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent,
      },
    );
    return {
      content: JSON.parse(response.data.choices[0].message.content),
      success: true,
    };
  } catch (error: any) {
    console.error("[GROQ AI] API CALL FAILED");
    const isRateLimited = error.response && error.response.status === 429;
    const isDemandError =
      error.response?.data?.error?.message?.includes("on_demand");

    if (isRateLimited || isDemandError) {
      console.warn(
        `[GROQ AI] Key rate limited or demand exceeded. Changing key... (Retry ${retryCount + 1}/${GROQ_API_KEYs.length})`,
      );
      return groqAICall(chatMessages, retryCount + 1);
    }
    if (error.response) {
      console.error("[GROQ AI] Status:", error.response.status);
      console.error("[GROQ AI] Error Details:", error.response.data);
    } else {
      console.error("[GROQ AI] Error Message:", error.message);
    }
    return {
      success: false,
      content: {
        cmd: "",
        msg: "Groq API Failed!",
        workingon: "",
      },
    };
  }
};
