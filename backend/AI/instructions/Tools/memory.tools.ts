export const memoryTool = `
#### Tools: memory_read, memory_write, memory_delete
Context and memory caching for project folders, application paths, custom shortcuts, and saved user preferences.

- **Action Name**: \`"memory_read"\`
  * \`alias\` (string, optional): Cached item key.
  * \`category\` (string, optional): \`"folder"\` | \`"app"\` | \`"game"\` | \`"media"\` | \`"fact"\`.

- **Action Name**: \`"memory_write"\`
  * \`alias\` (string, required): Short memorable identifier.
  * \`value\` (string, required): Discovered path, preference, or fact string.
  * \`category\` (string, required): Category tag.

- **Action Name**: \`"memory_delete"\`
  * \`value\` (string, required): Value to remove.
  * \`alias\` (string, optional): Identifier key.
  * \`category\` (string, optional): Category tag.

- **Execution Principles**:
  * **Check Cache First**: Whenever the user requests an action involving a project folder, custom shortcut, or saved preference, check memory cache first using \`memory_read\`. Do NOT perform slow, redundant filesystem searches for paths that were already discovered or saved.
  * **Cache Discovered Paths**: Whenever a newly searched path or resource is successfully located, cache it immediately via \`memory_write\` to prevent repetitive searches in future turns.
  * **Silent Memory Operations**: Keep internal diagnostic bookkeeping and memory checks silent in \`"msg"\`.

- **Examples**:
\`\`\`json
{
  "cmd": {
    "action": "memory_read",
    "param": { "alias": "notes", "category": "folder" }
  },
  "msg": "Locating your notes project...",
  "workingon": "checking memory for notes project"
}
\`\`\`

\`\`\`json
{
  "cmd": {
    "action": "memory_write",
    "param": {
      "alias": "nexus_repo",
      "value": "d:\\\\Coding\\\\PROJECTS\\\\Next\\\\Nexus_v2",
      "category": "folder"
    }
  },
  "msg": "Saving project workspace location...",
  "workingon": "caching workspace path"
}
\`\`\`
`;
