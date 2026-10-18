import {
  geminiAICall,
  GeminiModelsTypes,
  liveGeminiAICall,
} from "./Providers/geminiAI.js";
import {
  tokenRouterAICall,
  TokenRouterModelsTypes,
} from "./Providers/tokenRouterAI.js";
import { instructions as defaultInstructions } from "./instructions/main.Instructions.js";
import type { ChatMessageType, GeminiResponse } from "./Types.ts";
// import { localGeminiAICall } from "./Providers/localGeminiCall.js";

export type AIName = "gemini" | "tokenrouter" | "local_gemini";
export type GeminiModels = GeminiModelsTypes;
export type LocalGeminiModels =
  | "gemini-3.7-flash"
  | "gemini-3.1-pro"
  | "gemini-3.6-flash"
  | "gemini-3.5-flash-thinking";
export type TokenRouterModels =
  | "qwen/qwen3.8-max-free"
  | "google/gemini-2.0-flash-exp-image-preview"
  | "google/gemini-2.0-flash-exp-video-preview-09-2024"
  | "mistralai/mistral-large-2407"
  | "openai/gpt-oss-20b-instruct-20241022"
  | "google/nano-banana-128b-1218";

export type ModelType = {
  provider: AIName;
  name: GeminiModels | TokenRouterModels | LocalGeminiModels;
  isLiveModel?: boolean;
};
export type AIProviderType = "live" | "local";
export type AIProviderParams = {
  chatMessages: ChatMessageType[];
  session: string;
  userId?: string;
  instructions?: string;
  isJson?: boolean;
  isLiveModel?: boolean;
  modeltype?: AIProviderType;
  // Specific to Gemini / TokenRouter / Local Gemini
  retryCount?: number;
  model?: GeminiModels | TokenRouterModels | LocalGeminiModels;
};

export type UnifiedAIResponse = {
  cmd: string;
  msg: string;
  workingon: string;
  success: boolean;
  rawContent: any;
};
let geminiKeyIndex: number = 0;
export const callAI = async (
  name: AIName,
  params: AIProviderParams,
): Promise<UnifiedAIResponse> => {
  const {
    chatMessages,
    session,
    instructions = defaultInstructions,
    isJson = true,
  } = params;

  // Alias local_gemini to gemini for backwards compatibility
  if ((name as string) === "local_gemini") {
    name = "gemini";
  }

  if (name === "gemini") {
    const modelType = params.modeltype;
    let res: GeminiResponse = {} as GeminiResponse;

    const hasImageMessage = chatMessages.some((m: any) =>
      Array.isArray(m?.content),
    );

    try {
      if ((modelType === "live" || params.isLiveModel) && !hasImageMessage) {
        res = await liveGeminiAICall({
          chatMessages,
          retryCount: params.retryCount || 0,
          model:
            (params.model as GeminiModelsTypes) ||
            "gemini-3.8-live",
          instructionString: instructions,
          isJson: isJson,
          keyIndex: geminiKeyIndex,
        });
      } else {
        // Default to API GEMINI
        res = await geminiAICall({
          chatMessages,
          retryCount: params.retryCount || 0,
          model: (params.model as GeminiModelsTypes) || "gemini-3.7-flash",
          instructionString: instructions,
          isJson: isJson,
          keyIndex: geminiKeyIndex,
        });
      }
    } catch (err: any) {
      console.warn(
        `[GEMINI CALL ERROR] Failed with modelType '${modelType}':`,
        err?.message || err,
      );
      res = { success: false } as GeminiResponse;
    }

    // Fallback if primary call was unsuccessful
    if (!res || !res.success) {
      // 1. Try Gemini 3.8 Live first (only for text turns, never with multimodal images)
      if (
        !params.isLiveModel &&
        params.model !== "gemini-3.8-live" &&
        !hasImageMessage
      ) {
        console.warn("[GEMINI FALLBACK] Retrying with Gemini 3.8 Live...");
        try {
          res = await liveGeminiAICall({
            chatMessages,
            model: "gemini-3.8-live",
            instructionString: instructions,
            retryCount: params.retryCount || 0,
            isJson: isJson,
            keyIndex: geminiKeyIndex,
          });
        } catch (liveErr: any) {
          console.warn(
            "[GEMINI LIVE FALLBACK ERROR]:",
            liveErr?.message || liveErr,
          );
        }
      }

      // 2. If still unsuccessful, fallback to stable Gemini 3.6 Flash
      if (!res || !res.success) {
        console.warn(
          "[GEMINI FALLBACK] Retrying with stable Gemini 3.6 Flash API...",
        );
        try {
          res = await geminiAICall({
            chatMessages,
            model: "gemini-3.6-flash",
            instructionString: instructions,
            retryCount: params.retryCount || 0,
            isJson: isJson,
            keyIndex: geminiKeyIndex,
          });
        } catch (fallbackErr: any) {
          console.error(
            "[GEMINI FALLBACK ERROR]:",
            fallbackErr?.message || fallbackErr,
          );
          res = {
            success: false,
            content: {
              msg:
                fallbackErr?.message || "AI failed to respond. Please try again.",
            },
          } as GeminiResponse;
        }
      }
    }

    const actualContent = res.content || {};
    if (res.usedKeyIndex !== undefined) {
      geminiKeyIndex = res.success ? res.usedKeyIndex : res.usedKeyIndex + 1;
    }

    let cmd = "";
    let msg = "";
    let workingon = "";

    const contentObj = actualContent as any;
    if (typeof actualContent === "string") {
      msg = actualContent;
    } else if (actualContent && typeof actualContent === "object") {
      cmd = contentObj.cmd || "";
      msg = contentObj.msg || contentObj.message || contentObj.text || "";
      workingon =
        contentObj.workingon ||
        contentObj.workingOn ||
        contentObj.working_on ||
        "";
    }

    return {
      cmd,
      msg,
      workingon,
      success: res.success ?? false,
      rawContent: actualContent,
    };
  }

  if (name === "tokenrouter") {
    const res = await tokenRouterAICall({
      chatMessages,
      retryCount: params.retryCount || 0,
      model:
        (params.model as TokenRouterModelsTypes) || "qwen/qwen3.8-max-free",
      instructionString: instructions,
      isJson: true,
    });
    const actualContent = res.content || {};

    return {
      cmd: actualContent.cmd || "",
      msg: actualContent.msg || "",
      workingon:
        (actualContent as any)?.workingon ||
        (actualContent as any)?.workingOn ||
        (actualContent as any)?.working_on ||
        "",
      success: res.success,
      rawContent: actualContent,
    };
  }

  throw new Error(`AI Provider '${name}' is not supported.`);
};
