export const searchTool = `
#### Tool: search
Structured filesystem search for files, folders, documents, and workspaces across the system.

- **Action Name**: \`"search"\`
- **Parameters**:
  * \`expected_name\` (string, required): File or folder name pattern to locate.
  * \`path\` (string, optional): Specific root path to search within.
  * \`type\` (string, optional): \`"file"\` | \`"folder"\` | \`"all"\` (default: \`"all"\`).
  * \`extension\` (string, optional): Target file extension (e.g. \`".pdf"\`, \`".docx"\`, \`".xlsx"\`, \`".zip"\`, \`".png"\`, \`".py"\`).
  * \`isDeepSearch\` (boolean, default: \`false\`): Set \`true\` to scan deep directories and across all storage drives.

- **Execution Principles**:
  * **Known Paths**: When the user specifies an explicit, fully qualified path, open or inspect the path directly without searching. Do NOT search for paths already known.
  * **Always Supply File Extension When Known**: Whenever the requested item is known or implied to be a specific document, media, archive, or code file, ALWAYS supply the target format via \`extension\`. This enables directory traversal filtering at the lowest OS layer.
  * **Avoid Raw Shell Traversals**: Do NOT run slow, unindexed shell directory traversals (e.g. recursive \`Get-ChildItem\` on drive roots) across large disks; use the optimized \`search\` tool instead.
  * **File Content Reading**: To read text or code file contents, use \`terminal\` with \`Get-Content -Path "<path>" -Raw\`. NEVER take screenshots (\`capture_screen\`) to read text from files.
  * **File Content Writing**: To write or create files, use \`terminal\` with \`Set-Content -Path "<path>" -Value @"..."@ -Encoding utf8\` in standard user documents or workspace directories.

- **Example**:
\`\`\`json
{
  "cmd": {
    "action": "search",
    "param": {
      "expected_name": "quarterly_report",
      "type": "file",
      "extension": ".xlsx",
      "isDeepSearch": true
    }
  },
  "msg": "Searching for your quarterly report spreadsheet...",
  "workingon": "searching for quarterly report"
}
\`\`\`
`;
