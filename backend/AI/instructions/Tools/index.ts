export * from "./terminal.tools.js";
export * from "./search_app.tools.js";
export * from "./search.tools.js";
export * from "./systemInfo.tools.js";
export * from "./captureScreen.tools.js";
export * from "./memory.tools.js";
export * from "./contextRegistry.js";

export const minimalToolsCatalog = `
### Available Tools (Minimal Schemas)

1. "terminal": { "command": string, "timeout"?: number, "isDaemon"?: boolean }
2. "search_app": { "name": string, "isDeepSearch"?: boolean, "extension"?: string }
3. "launch_app": { "application": string, "arguments"?: string }
4. "search": { "expected_name": string, "type"?: "file" | "folder" | "all", "extension"?: string, "isDeepSearch"?: boolean }
5. "system_info": {}
6. "capture_screen": string (description of what visual elements to look for on screen)
7. "get_context": { "name": "terminal" | "search_app" | "launch_app" | "search" | "system_info" | "capture_screen" | "powershell" | "misc" | "get_devices" }
    * Purpose: Dynamically loads the complete operational manual, edge cases, and syntax rules for a tool or skill into your system prompt.
    * When to invoke: Call "get_context" IMMEDIATELY whenever any tool execution fails, OR when you need specialized operational heuristics before executing a complex action. Once loaded, the manual is permanently available for the remainder of the session.
8. "get_devices": {}
`;
