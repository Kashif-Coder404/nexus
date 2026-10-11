import axios from "axios";
import { instructions } from "../instructions/main.Instructions.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { GeminiResponse } from "../Types.js";
import { GoogleGenAI, Modality } from "@google/genai";
import { extractJSON } from "../Parsers.js";
import {
  GEMINI_API_BGMI15,
  GEMINI_API_Don_Acc,
  GEMINI_API_Main_Acc,
  GEMINI_API_MYLIFE,
  GEMINI_API_K69,
  GEMINI_API_COLLGEWISE,
  GEMINI_API_DIALYUI,
  initializeKeys,
} from "../../EnvVariables.js";
await initializeKeys();
export const GEMINI_API_KEYS = [
  GEMINI_API_Main_Acc,
  GEMINI_API_Don_Acc,
  GEMINI_API_BGMI15,
  GEMINI_API_MYLIFE,
  GEMINI_API_K69,
  GEMINI_API_COLLGEWISE,
  GEMINI_API_DIALYUI,
].filter(Boolean) as string[];

export type GeminiModelsTypes =
  | "gemini-3.7-flash"
  | "gemini-3.6-flash"
  | "gemini-3.5-flash"
  | "gemini-3.5-flash-lite"
  | "gemini-3.1-flash-lite"
  | "gemini-3.1-pro"
  | "gemini-3.1-pro-preview"
  | "gemini-3.1-flash-live-preview"
  | "gemini-3.8-live";
type GeminiAICallOptions = {
  chatMessages: Array<{ role: string; content: string }>;
  retryCount: number;
  model: GeminiModelsTypes;
  instructionString: string;
  isJson: boolean;
  keyIndex?: number;
};
export const geminiAICall = async ({
  chatMessages,
  retryCount = 0,
  model,
  instructionString = instructions,
  isJson = true,
  keyIndex = 0,
}: GeminiAICallOptions): Promise<GeminiResponse> => {
  const maxKeys = Math.max(GEMINI_API_KEYS.length, 1);
  const safeKeyIndex =
    GEMINI_API_KEYS.length > 0 ? keyIndex % GEMINI_API_KEYS.length : 0;
  const Current_API_KEY = GEMINI_API_KEYS[safeKeyIndex] || GEMINI_API_Main_Acc;
  console.log(
    `[GEMINI AI CALL] Model: ${model} | KeyIndex: ${safeKeyIndex} | Retry: ${retryCount}`,
  );
  if (retryCount >= maxKeys) {
    return {
      success: false,
      content: {
        cmd: "",
        msg: "Gemini API Failed or Rate Limited!",
        workingon: "",
      },
      usedKeyIndex: safeKeyIndex,
    };
  }

  let targetModel = model || "gemini-3.7-flash";
  if (targetModel === "gemini-3.1-pro") {
    targetModel = "gemini-3.1-pro-preview";
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
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        model: targetModel,
        messages: MessageToAI,
        temperature: 0.5,
        ...(isJson && {
          response_format: {
            type: "json_object",
          },
        }),
      },
      {
        headers: {
          Authorization: `Bearer ${Current_API_KEY}`,
          "Content-Type": "application/json",
        },
        // uncomment if you want to use the proxy
        // httpsAgent: agent,
      },
    );

    const messageContent = response.data.choices[0].message.content;
    let parsedContent;
    if (isJson) {
      try {
        parsedContent = extractJSON(messageContent);
      } catch {
        parsedContent = null;
      }
      if (!parsedContent || typeof parsedContent !== "object") {
        parsedContent = {
          cmd: "",
          msg: messageContent,
          workingon: "",
        };
      }
    } else {
      parsedContent = messageContent;
    }
    return {
      content: parsedContent,
      success: true,
      usedKeyIndex: safeKeyIndex,
    };
  } catch (error: any) {
    console.error("[GEMINI AI] API CALL FAILED");

    const status = error.response?.status;
    const errorMsg = error.message || "";
    const errorData = JSON.stringify(error.response?.data || "");
    const isParseError = error instanceof SyntaxError;

    // Detect Service Busy, Overloaded, Rate Limits (429), or Quota Exceeded
    const isRetryableError =
      status === 429 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 503 ||
      status === 500 ||
      status === 504 ||
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT" ||
      errorMsg.toLowerCase().includes("overloaded") ||
      errorMsg.toLowerCase().includes("busy") ||
      errorMsg.toLowerCase().includes("capacity") ||
      errorMsg.toLowerCase().includes("unavailable") ||
      errorData.includes("RESOURCE_EXHAUSTED") ||
      errorData.includes("UNAVAILABLE") ||
      errorData.toLowerCase().includes("overloaded") ||
      errorData.toLowerCase().includes("quota") ||
      isParseError;

    const maxKeys = Math.max(GEMINI_API_KEYS.length, 1);
    if (isRetryableError && retryCount < maxKeys - 1) {
      const nextKeyIndex = (safeKeyIndex + 1) % maxKeys;
      console.warn(
        `[GEMINI AI] Service busy or rate-limited (${status || errorMsg}). Silently switching to key index ${nextKeyIndex} (Attempt ${retryCount + 1}/${maxKeys})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 800));
      return geminiAICall({
        chatMessages,
        retryCount: retryCount + 1,
        model,
        instructionString,
        isJson,
        keyIndex: nextKeyIndex,
      });
    }

    let userFriendlyMsg =
      "AI service encountered an unexpected error. Please try again.";

    if (
      status === 429 ||
      errorData.includes("RESOURCE_EXHAUSTED") ||
      errorMsg.includes("quota")
    ) {
      userFriendlyMsg =
        "AI request limit or quota exceeded. Please wait a few moments before trying again.";
    } else if (status === 401 || status === 403) {
      userFriendlyMsg =
        "AI authentication error. Please verify your API key in configuration.";
    } else if (
      status === 503 ||
      status === 500 ||
      error.code === "ECONNABORTED"
    ) {
      userFriendlyMsg =
        "AI service is currently busy or experiencing high traffic. Please try again shortly.";
    } else if (error instanceof SyntaxError) {
      userFriendlyMsg =
        "AI response format was invalid. Please try rephrasing your request.";
    }

    if (error.response) {
      console.error("[GEMINI AI] Status:", error.response.status);
    } else {
      console.error("[GEMINI AI] Error:", error.message);
    }

    return {
      success: false,
      content: {
        cmd: "",
        msg: userFriendlyMsg,
        workingon: "",
      },
      usedKeyIndex: safeKeyIndex,
    };
  }
};

export const liveGeminiAICall = async ({
  chatMessages,
  retryCount = 0,
  model = "gemini-3.8-live",
  instructionString = instructions,
  isJson = true,
  keyIndex = 0,
}: GeminiAICallOptions): Promise<GeminiResponse> => {
  const maxKeys = Math.max(GEMINI_API_KEYS.length, 1);
  const safeKeyIndex =
    GEMINI_API_KEYS.length > 0 ? keyIndex % GEMINI_API_KEYS.length : 0;
  const Current_API_KEY = GEMINI_API_KEYS[safeKeyIndex] || GEMINI_API_Main_Acc;
  console.log(
    `[GEMINI LIVE AI CALL] Model: ${model} | KeyIndex: ${safeKeyIndex} | Retry: ${retryCount}`,
  );

  if (retryCount >= maxKeys) {
    return {
      success: false,
      content: {
        cmd: "",
        msg: "Gemini Live API Failed or Rate Limited!",
        workingon: "",
      },
    };
  }

  const ai = new GoogleGenAI({
    apiKey: Current_API_KEY,
  });

  return new Promise(async (resolve) => {
    let modelTurnText = "";
    let transcriptionText = "";

    try {
      const liveTargetModel = model || "gemini-3.8-live";

      // 1. Establish the real-time bidirectional session
      const session = await ai.live.connect({
        model: liveTargetModel,
        config: {
          systemInstruction: {
            parts: [{ text: instructionString }],
          },
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
        callbacks: {
          onopen: () => {
            console.log("[GEMINI LIVE] WebSocket connection ready.");
          },
          onmessage: (message: any) => {
            // Collect text transcription if available
            if (message.serverContent?.outputTranscription?.text) {
              transcriptionText +=
                message.serverContent.outputTranscription.text;
            }

            // Also check modelTurn parts for any text chunks
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  modelTurnText += part.text;
                }
              }
            }

            // Close session and resolve once the model completes its turn
            if (message.serverContent?.turnComplete) {
              session.close();
            }
          },
          onerror: (error: any) => {
            console.error("[GEMINI LIVE] Error:", error);
          },
          onclose: async (event: any) => {
            // Prioritize modelTurnText; fallback to audio transcription
            const textToParse =
              modelTurnText.trim() || transcriptionText.trim();

            if (!textToParse && retryCount < maxKeys - 1) {
              const nextKeyIndex = (safeKeyIndex + 1) % maxKeys;
              console.log(
                `[GEMINI LIVE] Empty response / closed early (code ${event?.code}). Retrying with next key index ${nextKeyIndex}... (Attempt ${retryCount + 1}/${maxKeys})`,
              );
              await new Promise((r) => setTimeout(r, 1500));
              const retryRes = await liveGeminiAICall({
                chatMessages,
                retryCount: retryCount + 1,
                model,
                instructionString,
                isJson,
                keyIndex: nextKeyIndex,
              });
              return resolve(retryRes);
            }

            let parsedContent: any;
            if (isJson) {
              try {
                parsedContent = extractJSON(textToParse);
              } catch {
                parsedContent = null;
              }
              if (!parsedContent || typeof parsedContent !== "object") {
                parsedContent = {
                  cmd: "",
                  msg: textToParse,
                  workingon: "",
                };
              }
            } else {
              parsedContent = textToParse;
            }

            resolve({
              content: parsedContent,
              success: Boolean(textToParse),
              usedKeyIndex: safeKeyIndex,
            });
          },
        },
      });

      // 2. Format chat messages into Live API turns
      const turns = chatMessages.map((msg) => ({
        role:
          msg.role === "assistant"
            ? "model"
            : msg.role === "system"
              ? "user"
              : msg.role,
        parts: [
          {
            text:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
          },
        ],
      }));

      if (turns.length === 0) {
        turns.push({ role: "user", parts: [{ text: "Hello" }] });
      }

      // 3. Send turns to the active session
      await session.sendClientContent({
        turns,
        turnComplete: true,
      });
    } catch (error: any) {
      console.error("[GEMINI LIVE] Failed to execute call:", error);

      if (retryCount < maxKeys - 1) {
        const nextKeyIndex = (safeKeyIndex + 1) % maxKeys;
        console.warn(
          `[GEMINI LIVE] Service busy or disconnected. Retrying with next key index ${nextKeyIndex}... (Attempt ${retryCount + 1}/${maxKeys})`,
        );
        await new Promise((r) => setTimeout(r, 1200));
        const retryRes = await liveGeminiAICall({
          chatMessages,
          retryCount: retryCount + 1,
          model,
          instructionString,
          isJson,
          keyIndex: nextKeyIndex,
        });
        return resolve(retryRes);
      }

      resolve({
        success: false,
        content: {
          cmd: "",
          msg: "Gemini Live AI service encountered an error. Please try again.",
          workingon: "",
        },
      });
    }
  });
};
