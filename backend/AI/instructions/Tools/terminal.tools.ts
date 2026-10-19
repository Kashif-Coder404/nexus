export const terminalTool = `
#### Tool: terminal
Execute raw PowerShell statements in the native companion terminal session.

- **Action Name**: \`"terminal"\`
- **Parameters**:
  * \`command\` (string, required): Raw PowerShell statement to execute.
  * \`timeout\` (integer, seconds, default: \`30\`): Execution timeout in seconds. Use \`30\` for normal queries; \`60\` to \`300\` for heavy builds, package installs, or slow tasks.
  * \`isDaemon\` (boolean, default: \`false\`): Set \`true\` for continuous background services (e.g. dev servers, file watchers, ongoing daemons) that should remain active after execution.

- **Execution Principles**:
  * **Strict Prohibition on File/Folder Searches**: NEVER use \`terminal\` to search for files, documents, or directories across the filesystem (e.g. NEVER run \`Get-ChildItem -Recurse\`, \`Get-ChildItem $env:USERPROFILE\`, \`dir /s\`, or \`findstr\`). ALWAYS use the dedicated \`search\` tool. If the \`search\` tool does not find the item, DO NOT attempt to search via \`terminal\` — simply inform the user directly that the item could not be found.
  * **Top-Level Cmdlets**: Output raw PowerShell cmdlets or executable calls directly. NEVER wrap commands in nested shell meta-invocations (e.g. do NOT write \`powershell -Command "..."\` or \`cmd /c "..."\`). Your commands execute directly in a live native PowerShell PTY session.
  * **Dynamic Path Resolution**: Always resolve system locations, user directories, or drive roots dynamically using Windows environment variables (e.g. \`$env:USERPROFILE\`, \`$env:APPDATA\`, \`$env:LOCALAPPDATA\`, \`$env:TEMP\`, \`$env:SystemDrive\`) or discover storage devices via \`Get-PSDrive -PSProvider FileSystem\`. NEVER hardcode specific drive letters (like \`D:\\\`) or usernames (like \`C:\\Users\\...\`).
  * **Path Separators**: When passing filesystem paths to native Windows GUI or Win32 utilities (e.g. \`explorer.exe\`), format path separators with Windows backslashes (\`\\\`). Do NOT use POSIX forward slashes (\`/\`).
  * **Non-Interactive Switches**: Always supply non-interactive, headless, or automatic confirmation switches (e.g. \`--yes\`, \`-y\`, \`--quiet\`, \`--silent\`, \`-Force\`, \`-Confirm:$false\`). NEVER execute commands that block waiting for interactive keyboard input.
  * **Atomic Single-Step Execution**: Execute EXACTLY ONE atomic action per turn. NEVER chain multiple commands with semicolons (\`;\`), \`&&\`, or multi-line batch scripts in a single turn.
  * **Parameter Bounding**: ALWAYS use the tool's own native CLI boundary switches (count switches, duration flags, retry limits) so processes terminate naturally. NEVER spawn unbounded continuous streams and attempt to kill them with secondary scripts.
  * **Background Daemons**: For continuous background processes (e.g. \`npm run dev\`), set \`"isDaemon": true\` so the execution engine verifies startup and immediately returns control to the conversation.
  * **Raw URLs**: When outputting web links or URLs, output clean, raw URL strings (e.g. \`https://github.com/...\`). NEVER wrap URLs in Markdown link formatting like \`[text](url)\`.
  * **Script Execution Policies**: When a script or tool fails with \`PSSecurityException\`, run: \`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force\`.

- **Examples**:
\`\`\`json
{
  "cmd": {
    "action": "terminal",
    "param": {
      "command": "Get-ChildItem -Path $env:USERPROFILE\\\\Desktop",
      "timeout": 30,
      "isDaemon": false
    }
  },
  "msg": "Listing files on your desktop.",
  "workingon": "listing desktop files"
}
\`\`\`

\`\`\`json
{
  "cmd": {
    "action": "terminal",
    "param": {
      "command": "npm run dev",
      "timeout": 60,
      "isDaemon": true
    }
  },
  "msg": "Starting the development server in the background...",
  "workingon": "launching dev server"
}
\`\`\`

\`\`\`json
{
  "cmd": {
    "action": "terminal",
    "param": {
      "command": "ping 192.168.1.1 -n 5",
      "timeout": 15,
      "isDaemon": false
    }
  },
  "msg": "Pinging 192.168.1.1 (5 packets)...",
  "workingon": "testing network connection"
}
\`\`\`
`;
