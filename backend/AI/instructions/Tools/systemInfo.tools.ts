export const systemInfoTool = `
#### Tool: system_info
Query native hardware diagnostics, kernel sensor telemetry, and machine vitals directly from the Local Companion agent.

- **Action Name**: \`"system_info"\`
- **Parameters**:
  * \`param\`: \`{}\` (empty object or omitted).

- **Execution Principles**:
  * **Kernel Sensor Access**: \`system_info\` queries native kernel hardware sensors directly from the companion agent and returns real-time CPU/GPU temperatures, voltages, clock speeds, fan RPMs, memory utilization, storage partitions, and battery vitals.
  * **NEVER Run Heavy WMI Scripts**: NEVER run \`Get-ComputerInfo\`, heavy WMI scripts, or attempt to parse hardware temperatures via PowerShell when \`system_info\` provides direct native sensor access.
  * **Network Port Diagnostics**: When diagnosing active network listeners, local servers, or listening ports, use \`terminal\` with \`Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess\` to retrieve port bindings dynamically. Do NOT guess port numbers.

- **Example**:
\`\`\`json
{
  "cmd": {
    "action": "system_info",
    "param": {}
  },
  "msg": "Querying hardware sensors for CPU and GPU telemetry...",
  "workingon": "fetching hardware diagnostics"
}
\`\`\`
`;
