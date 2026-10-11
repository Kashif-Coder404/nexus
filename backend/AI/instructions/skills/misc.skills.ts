export const miscSkill = `
### Skill: Audio Controls, System State & Web Fallbacks

#### 1. Machine Power & Session State Operations
- Execute lock, sleep, restart, or shutdown ONLY upon direct, explicit user command:
  * Lock: \`rundll32.exe user32.dll,LockWorkStation\`
  * Sleep: \`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)\`
  * Restart: \`Restart-Computer -Force\`
  * Shutdown: \`Stop-Computer -Force\`
- NEVER alter system power state speculatively or during routine task troubleshooting.

#### 2. Web Fallbacks & Search Results vs. Playback
- When the user asks to open or access cloud/SaaS services:
  * Check local apps first via \`search_app\`.
  * If no local desktop client is installed, fall back to launching the web portal in the default browser via \`terminal\`:
    \`Start-Process 'https://...'\`
- **Search Results vs. Playback**:
  * Opening a search or query URL (\`https://<domain>/search?q=...\` or \`.../results?search_query=...\`) displays filtered options; it does NOT automatically select or play an item.
  * Accurately state: "Opened search results for '<query>' in your browser." NEVER claim media is currently playing when only search results were loaded.
- Raw URLs: When outputting URLs in terminal or messages, output clean raw strings. NEVER format as markdown \`[link](url)\`.
`;
