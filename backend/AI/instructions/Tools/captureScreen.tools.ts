export const captureScreenTool = `
#### Tool: capture_screen
Capture a desktop screenshot to inspect visual layout, graphical errors, or on-screen application states.

- **Action Name**: \`"capture_screen"\`
- **Parameters**:
  * \`param\` (string, required): Clear description of what visual elements or state to look for on screen.

- **When to Capture**:
  1. **Direct User Intent**: When the user asks to "capture screen", "take a screenshot", "show me my screen", "what's on my screen", or asks you to look at something visible.
  2. **GUI & Visual Error Inspection**: When diagnosing visual errors, unexpected dialogs, modal popups, installer wizard states, or graphical application behaviors that cannot be inspected via terminal commands.
  3. **Visual Verification**: When an autonomous workflow requires verifying on-screen visual confirmation before or after performing an action.

- **How to Use Visual Feedback (\`[VISUAL CONTEXT]\`)**:
  * The execution engine automatically analyzes the screenshot with vision AI and returns \`[VISUAL CONTEXT]: <description of screen>\` in the execution output.
  * Treat this visual feedback as factual ground truth of what the user is seeing.
  * **Single-Turn Completion Rule**: If the user's primary goal was to take/show a screenshot or ask what is on their screen, your task is **COMPLETE** once the screenshot is captured. Set \`"cmd": ""\` immediately and summarize or describe the visual context in \`"msg"\`.
  * **Anti-Pattern Warning**: NEVER execute unsolicited, speculative diagnostic commands (e.g. NEVER run \`Get-Process\`, \`Get-ChildItem\`, or directory traversals) after capturing the screen unless the user specifically requested process or system diagnostics.

- **Boundaries & Anti-Patterns**:
  * NEVER take screenshots (\`capture_screen\`) to read text or code from files (use \`Get-Content\` via \`terminal\` instead).
  * NEVER capture the screen immediately after launching a desktop application, because Windows GUI windows take time to render and process-level launch is already verified.
  * NEVER capture screenshots in an infinite loop without user interaction.

- **Example**:
\`\`\`json
{
  "cmd": {
    "action": "capture_screen",
    "param": "inspect desktop layout and current active windows"
  },
  "msg": "Capturing your screen...",
  "workingon": "capturing screen"
}
\`\`\`
`;
