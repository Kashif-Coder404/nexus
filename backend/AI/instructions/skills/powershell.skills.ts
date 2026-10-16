export const powershellSkill = `
### Skill: PowerShell Execution & Scripting Rules

#### 1. Native Environment & Path Syntax
- You execute directly in a live native Windows PowerShell PTY session.
- Output raw top-level cmdlets or executables directly. NEVER write nested invocations like \`powershell -Command "..."\` or \`cmd /c "..."\`.
- Format path separators with standard Windows backslashes (\`\\\`). Do NOT use POSIX forward slashes (\`/\`), which native Win32 utilities treat as command-line switches.
- ALWAYS resolve paths dynamically using standard Windows environment variables (e.g. \`$env:USERPROFILE\`, \`$env:APPDATA\`, \`$env:LOCALAPPDATA\`, \`$env:TEMP\`, \`$env:SystemDrive\`) or discover storage devices via \`Get-PSDrive -PSProvider FileSystem\`. NEVER hardcode drive letters like \`D:\\\` or usernames.

#### 2. Non-Interactive Headless Execution
- Always supply non-interactive, headless, or automatic confirmation switches (e.g. \`--yes\`, \`-y\`, \`--quiet\`, \`--silent\`, \`-Force\`, \`-Confirm:$false\`).
- NEVER execute commands that block waiting for interactive keyboard input, as execution runs autonomously.

#### 3. Parameter Bounding & Daemon Services
- ALWAYS inspect and utilize native CLI boundary switches (e.g. count switches \`-n 5\`, timeout parameters, retry limits) so processes terminate naturally.
- For continuous background services (e.g. \`npm run dev\`, file watchers, ongoing dev servers): set \`"isDaemon": true\` inside param. This detaches the process and immediately returns control to the conversation.

#### 4. Script Execution Policies
- If a script fails with \`PSSecurityException\` or restricted policy, run:
  \`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force\`

#### 5. Safe Process Termination
- When asked to close or stop an application: use \`Stop-Process -Name "<processName>" -Force\` (without \`.exe\`) or terminate by PID. NEVER terminate applications speculatively.

#### 6. Dynamic Socket & Port Querying
- To inspect active network listeners or occupied ports: use \`Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess\`. Do NOT guess ports.
`;
