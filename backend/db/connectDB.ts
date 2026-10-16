import mongoose from "mongoose";
import { MONGO_URI } from "../EnvVariables.js";
export async function connectDB() {
  try {
    const MONGOURI: string = MONGO_URI || "";
    await mongoose.connect(MONGOURI);
    console.log("DB CONNECTED SUCCESSFULLY! ✅");
  } catch (error: any) {
    console.error("[DATABASE] ERROR WHILE CONNECTING TO DB 🫠");
    console.error("[DATABASE ERROR]: ", error);
  }
}

// let tempCMD: string = "memory_write | | | |";
// const matchedKey: string = tempCMD.trim().split("|")[0].trim();
// console.log(commandHandlerDict[matchedKey as keyof typeof commandHandlerDict]);
