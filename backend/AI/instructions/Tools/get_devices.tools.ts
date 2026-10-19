import { WebSocketService } from "../../../services/websocket/websocket.main.service.js";

export const get_devices_tool = {
  name: "get_devices",
  description:
    "Retrieve all registered companion devices for the current user along with their live connection status (isConnected). Use this to see available machines and their device IDs before executing commands.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  get parameters() {
    return this.inputSchema;
  },

  impl: async (_args: {}, context: { userId: string }) => {
    return await WebSocketService.GetDevices(context.userId);
  },
};

export default get_devices_tool;
