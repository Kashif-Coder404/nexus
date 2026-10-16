export const searchAppTool = `
#### Tools: search_app & launch_app
Application discovery and verified GUI launching detached from terminal job objects via the Windows Shell.

- **Action Name**: \`"search_app"\`
  * \`name\` (string, required): Clean application or brand name to search for (e.g. \`"brave"\`, \`"discord"\`, \`"steam"\`, \`"code"\`).
  * \`isDeepSearch\` (boolean, default: \`false\`): Set \`true\` to scan non-standard drives and custom installation directories.
  * \`extension\` (string, optional): Specific extension to match (e.g. \`".lnk"\` or \`".exe"\`).

- **Action Name**: \`"launch_app"\`
  * \`application\` (string, required): Full verified path to executable or \`.lnk\` shortcut, or standard built-in Windows PATH utility name (e.g. \`"notepad"\`, \`"calc"\`, \`"code"\`).

- **Core Heuristics**:
  * **Two-Stage Launch Pattern**: First query \`search_app\` to discover the application. When verified, pass the top result (\`results[0]\`) to \`launch_app\`.
  * **Why launch_app**: \`launch_app\` delegates execution directly to the Windows Shell (\`explorer.exe\`), completely detaching the application from terminal job objects, preventing ConPTY from forcefully killing child processes upon command completion.
  * **NEVER launch GUI apps via terminal**: Do NOT run \`Start-Process\`, \`Invoke-Item\`, or raw executable names inside \`terminal\`.
  * **Query Normalization**: Extract the clean root brand name without conversational filler (e.g. "please open brave browser for me" -> \`name: "brave"\`).
  * **Candidate Filtering**: \`search_app\` returns candidates ranked by shortcut priority, Start Menu registration, and active window scoring. Always pick the top match (\`results[0]\`). NEVER select uninstallers (\`*unins*.exe\`), update/installer stubs (\`*setup*.exe\`, \`*updater*.exe\`), crashpad monitors (\`*crashpad*.exe\`), or \`.dll\` files.
  * **Completion**: When \`launch_app\` returns \`[LAUNCHED] <Name> (PID: <pid>, Window: "<title>")\` or \`[ALREADY RUNNING or LAUNCHED] ...\`, the operation is complete. Set \`"cmd": ""\` on your next turn and confirm to the user.
  * **Tool Execution Boundary (No In-App Actions)**: \`launch_app\` is a launch-only primitive. It starts processes and windows via the Windows Shell. It CANNOT type, search, click, or navigate inside the opened GUI window. If the user asked to search for or interact with content inside an application that has no CLI search parameters, launch the app and honestly inform the user you opened it, but NEVER claim you completed the in-app action.

- **10 Application Edge Cases**:
  1. **Built-in Windows PATH Utilities (Zero-Search Direct Launch)**: Built-in utilities (\`notepad\`, \`calc\`, \`mspaint\`, \`explorer\`, \`taskmgr\`, \`cmd\`, \`powershell\`, \`snippingtool\`, \`regedit\`, \`control\`, \`mstsc\`) and global CLI shortcuts (\`code\`) may be launched directly via \`launch_app\` (\`application: "notepad"\`) without preliminary \`search_app\`.
  2. **Multi-Drive & Custom Install Directories (Deep Search Escalation)**: If fast search (\`isDeepSearch: false\`) returns 0 matches, immediately execute secondary search with \`isDeepSearch: true\` before concluding the application is absent.
  3. **Already Running Applications**: When \`launch_app\` returns \`[ALREADY RUNNING or LAUNCHED] ...\`, treat this as an immediate success, set \`"cmd": ""\`, and inform the user. NEVER treat as failure.
  4. **Parameterized Content vs. Blank App Launch**: Distinguish between opening an application and searching for specific content:
     - When the user asks for specific content, a query, or a search on an online platform (media, cloud services, repositories): desktop shortcuts (\`.lnk\`) cannot receive query parameters. Prefer generating the direct parameterized deep link via \`terminal\`: \`Start-Process 'https://<domain>/search?<query>'\`.
     - When the user only requests the empty application opened without parameters: check local apps first via \`search_app\`; only if 0 results, fall back to the web portal via browser.
  5. **Document & Project Opening (Shell File Association)**: \`launch_app\` accepts any valid document/media file path (\`.pdf\`, \`.docx\`, \`.xlsx\`, \`.png\`, \`.mp4\`, \`.sln\`). Passing a document path to \`launch_app\` delegates execution to Windows Shell, opening the user's default associated application.
  6. **Browser & Electron Launcher Stubs**: Modern multi-process applications (Brave, Chrome, Discord, Slack, Steam) briefly exit the launcher stub while transferring execution to a background worker. If a valid PID is detected, consider it launched even if the window title has not finished rendering.
  7. **Games & URI Protocol Schemes**: Games installed via Steam, Epic Games, or Xbox often use \`.lnk\` shortcuts pointing to launcher URLs (e.g. \`steam://rungameid/...\`). Always pass the \`.lnk\` shortcut path found by \`search_app\` directly to \`launch_app\`.
  8. **Ambiguous or Colloquial Software Names**: When given colloquial names ("Word" for Microsoft Word, "Excel" for Microsoft Excel), query the core keyword in \`search_app\`. Select top match, or ask clarification if multiple major separate suites match.
  9. **Closing or Terminating an Application**: When the user explicitly asks to close or quit an application, use \`terminal\` with \`Stop-Process -Name "<processName>" -Force\` (without \`.exe\`), or terminate by PID. NEVER terminate applications speculatively.
  10. **Truly Non-Existent Software**: When both fast and deep \`search_app\` return 0 results and it is not a web service, stop execution (\`"cmd": ""\`) and politely notify the user which drives were scanned. NEVER fabricate executable paths.

- **Examples**:
\`\`\`json
{
  "cmd": {
    "action": "search_app",
    "param": { "name": "discord", "isDeepSearch": false }
  },
  "msg": "Searching for Discord...",
  "workingon": "searching for Discord"
}
\`\`\`

\`\`\`json
{
  "cmd": {
    "action": "launch_app",
    "param": { "application": "C:\\\\Users\\\\User\\\\AppData\\\\Roaming\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\Discord Inc\\\\Discord.lnk" }
  },
  "msg": "Launching Discord...",
  "workingon": "opening Discord"
}
\`\`\`

\`\`\`json
{
  "cmd": {
    "action": "launch_app",
    "param": { "application": "notepad" }
  },
  "msg": "Opening Notepad...",
  "workingon": "opening Notepad"
}
\`\`\`
`;
