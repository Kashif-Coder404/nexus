import axios from "axios";
import { instructions } from "../instructions/main.Instructions.js";
import { GeminiResponse } from "../Types.js";
import { TOKEN_ROUTER_API } from "../../EnvVariables.js";

const BASE_URL = "https://api.tokenrouter.com/v1/chat/completions";

export type TokenRouterModelsTypes =
  | "qwen/qwen3.8-max-free"
  | "qwen/qwen3-max-free";

type TokenRouterAICallOptions = {
  chatMessages: Array<{ role: string; content: string }>;
  retryCount?: number;
  model?: TokenRouterModelsTypes | string;
  instructionString?: string;
  isJson?: boolean;
};

export const tokenRouterAICall = async ({
  chatMessages,
  retryCount = 0,
  model = "qwen/qwen3.8-max-free",
  instructionString = instructions,
  isJson = true,
}: TokenRouterAICallOptions): Promise<GeminiResponse> => {
  console.log(
    `[TOKEN ROUTER AI] Model: ${model} | Retry: ${retryCount}`,
  );

  if (retryCount >= 3) {
    return {
      success: false,
      content: {
        cmd: "",
        msg: "Token Router API Failed after max retries!",
        workingon: "",
      },
    };
  }

  const MessageToAI = [
    {
      role: "system",
      content: instructionString,
    },
    ...chatMessages,
  ];

  try {
    const response = await axios.post(
      BASE_URL,
      {
        model: model,
        messages: MessageToAI,
        stream: false,
        ...(isJson && {
          response_format: {
            type: "json_object",
          },
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN_ROUTER_API}`,
          "Content-Type": "application/json",
        },
      },
    );

    const messageContent = response.data.choices[0].message.content;
    let parsedContent;

    if (isJson) {
      let cleanStr = messageContent.trim();
      // Strip markdown code blocks if present
      if (cleanStr.startsWith("```json")) {
        cleanStr = cleanStr
          .replace(/^```json/, "")
          .replace(/```$/, "")
          .trim();
      } else if (cleanStr.startsWith("```")) {
        cleanStr = cleanStr.replace(/^```/, "").replace(/```$/, "").trim();
      }

      // Qwen models sometimes wrap response in <think> tags, strip them
      cleanStr = cleanStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      try {
        parsedContent = JSON.parse(cleanStr);
      } catch (parseError) {
        const match = cleanStr.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedContent = JSON.parse(match[0]);
          } catch (e) {
            throw parseError;
          }
        } else {
          throw parseError;
        }
      }
    } else {
      parsedContent = messageContent;
    }

    return {
      content: parsedContent,
      success: true,
    };
  } catch (error: any) {
    console.error("[TOKEN ROUTER AI] API CALL FAILED");

    const isRateLimited = error.response && error.response.status === 429;
    const isParseError = error instanceof SyntaxError;

    if (isRateLimited || isParseError) {
      console.warn(
        `[TOKEN ROUTER AI] Error (${isRateLimited ? "Rate Limited" : "JSON Parse Error"}: ${error.message}). Retrying in 5s... (Attempt ${retryCount + 1}/3)`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return tokenRouterAICall({
        chatMessages,
        retryCount: retryCount + 1,
        model,
        instructionString,
        isJson,
      });
    }

    if (error.response) {
      console.error("[TOKEN ROUTER AI] Status:", error.response.status);
      console.error(
        "[TOKEN ROUTER AI] Error Details:",
        JSON.stringify(error.response.data, null, 2),
      );
    } else {
      console.error("[TOKEN ROUTER AI] Error Message:", error.message);
    }

    return {
      success: false,
      content: {
        cmd: "",
        msg: "Token Router API Failed!",
        workingon: "",
      },
    };
  }
};
