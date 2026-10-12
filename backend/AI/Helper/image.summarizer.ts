import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_Main_Acc } from "../../EnvVariables.js";
import { GEMINI_API_KEYS } from "../Providers/geminiAI.js";
import { ChatMessageType } from "../Types.js";
import { imageInstructions } from "../instructions/image.instructions.js";
import { captureScreen } from "../../tools/takeScreenShot.js";

export const imageCheck = async (): Promise<{
  success: boolean;
  buffer: Buffer | null;
  error?: string;
}> => {
  try {
    const { imageBuffer, success, error } = await captureScreen();
    if (!success || !imageBuffer || error)
      return { success: false, buffer: null, error: error || "" };
    return { success: true, buffer: imageBuffer };
  } catch (error: any) {
    return { success: false, buffer: null, error: error.message || "" };
  }
};

export const summarizeBase64Image = async (
  base64Raw: string,
  chatMessages: ChatMessageType[],
  moreContext: string,
): Promise<{ summary: string; base64: string; msg: string } | false> => {
  if (!base64Raw) return false;

  const base64Str = base64Raw.startsWith("data:")
    ? base64Raw
    : `data:image/png;base64,${base64Raw}`;

  const mimeMatch = base64Str.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const cleanBase64 = base64Str.replace(
    /^data:image\/[a-zA-Z0-9.+]+;base64,/,
    "",
  );

  const keys =
    GEMINI_API_KEYS.length > 0
      ? GEMINI_API_KEYS
      : [GEMINI_API_Main_Acc || ""].filter(Boolean);

  const promptText = moreContext
    ? `${imageInstructions}

### 🎯 PRIMARY INSPECTION OBJECTIVE:
"${moreContext}"

Focus your analysis specifically on fulfilling this objective first. Answer directly with what you see regarding this query.`
    : imageInstructions;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    if (!apiKey) continue;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      });

      const visualText = res.text?.trim() || "Image Captured";
      const summary = `[VISUAL CONTEXT SUMMARIZED BY AI]: ${visualText}`;
      return { summary, base64: base64Str, msg: visualText };
    } catch (err: any) {
      console.warn(
        `[IMAGE SUMMARIZER] Key index ${i} failed:`,
        err?.message || err,
      );
      if (i === keys.length - 1) {
        console.error(
          "[IMAGE SUMMARIZER ERROR]: All keys failed to summarize image",
          err,
        );
        return {
          summary: "Image Captured But Failed To Give Context About image",
          base64: base64Str,
          msg: err?.message || "Failed To Give Context About image",
        };
      }
    }
  }

  return {
    summary: "Image Captured But Failed To Give Context About image",
    base64: base64Str,
    msg: "No Gemini API key available for image summarization.",
  };
};

export const imageSet = async (
  chatMessages: ChatMessageType[],
  moreContext: string,
): Promise<{ summary: string; base64: string } | false> => {
  const isImage = await imageCheck();
  if (!isImage.success || !isImage.buffer) return false;
  const base64Str = `data:image/png;base64,${isImage.buffer.toString("base64")}`;
  const res = await summarizeBase64Image(base64Str, chatMessages, moreContext);
  if (!res) return false;
  return { summary: res.summary, base64: res.base64 };
};

// After screenshot of the screen....
export const summarize_image = async (
  context: string = "",
  imageBuffer: Buffer,
  session: string,
  userId: string,
) => {
  const base64Str = `data:image/png;base64,${imageBuffer?.toString("base64")}`;
  const res = await summarizeBase64Image(base64Str, [], context);
  return {
    summaryImage: {
      cmd: "",
      msg: res ? res.msg : "Failed To Give Context About image",
      workingon: "",
      success: !!res,
      rawContent: res ? res.msg : "",
    },
    success: !!res,
  };
};
