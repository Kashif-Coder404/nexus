import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_Main_Acc } from "../../EnvVariables.js";

async function listGeminiModels() {
  // The client automatically picks up the GEMINI_API_KEY environment variable
  // await initializeKeys();
  console.log("api key: ", GEMINI_API_Main_Acc);
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_Main_Acc });

  try {
    console.log("Fetching available Gemini models...\n");

    // List all available models
    const response = await ai.models.list();
    const modelsName: any[] = [];
    (response as any).pageInternal?.forEach((model: any) => {
      if (model.name.toLowerCase().includes("gemini")) {
        modelsName.push({ name: model.name, description: model.description });
      }
    });
    console.log(JSON.stringify(modelsName, null, 2));
  } catch (error) {
    console.error("Error fetching models:", error);
  }
}

listGeminiModels();
