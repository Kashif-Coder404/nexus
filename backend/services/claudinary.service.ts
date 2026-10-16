import { v2 as cloudinary } from "cloudinary";
import {
  CLOUDINARY_API,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_NAME,
} from "../EnvVariables.js";

cloudinary.config({
  cloud_name: CLOUDINARY_NAME,
  api_key: CLOUDINARY_API,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadScreenshotToCloudinary(
  base64Data: string,
): Promise<string> {
  try {
    const dataUri = base64Data.startsWith("data:")
      ? base64Data
      : `data:image/png;base64,${base64Data}`;
    const res = await cloudinary.uploader.upload(dataUri, {
      folder: "nexus_screenshots",
      resource_type: "image",
    });
    return res.secure_url;
  } catch (err) {
    console.error("[CLOUDINARY ERROR]:", err);
    return "";
  }
}
