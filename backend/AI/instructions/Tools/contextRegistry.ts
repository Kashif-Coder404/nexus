import { terminalTool } from "./terminal.tools.js";
import { searchAppTool } from "./search_app.tools.js";
import { searchTool } from "./search.tools.js";
import { systemInfoTool } from "./systemInfo.tools.js";
import { captureScreenTool } from "./captureScreen.tools.js";
import { powershellSkill } from "../skills/powershell.skills.js";
import { miscSkill } from "../skills/misc.skills.js";
import get_devices_tool from "./get_devices.tools.js";

export const context_register: Record<string, string> = {
  terminal: terminalTool,
  in_built: terminalTool,
  // Applications (both search and launch)
  search_app: searchAppTool,
  launch_app: searchAppTool,
  start_app: searchAppTool,
  // Filesystem Search
  search: searchTool,
  // Hardware Telemetry
  system_info: systemInfoTool,
  // Screen & Vision
  capture_screen: captureScreenTool,
  // Skills
  powershell: powershellSkill,
  misc: miscSkill,
  // Devices
  get_devices:
    typeof get_devices_tool === "string"
      ? get_devices_tool
      : JSON.stringify(get_devices_tool),
};

export const get_context = (
  toolOrSkill: string,
): { success: boolean; context?: string; error?: string } => {
  try {
    const key = (toolOrSkill || "").toLowerCase().trim();
    const context_string: string = context_register[key];
    if (!context_string) throw new Error("No Context Found");
    return { success: true, context: context_string };
  } catch (err: any) {
    return {
      success: false,
      error:
        "Failed to retrieve context for: " +
        toolOrSkill +
        "\nAvailable keys: " +
        Object.keys(context_register).join(", ") +
        "\nError: " +
        err.message,
    };
  }
};
