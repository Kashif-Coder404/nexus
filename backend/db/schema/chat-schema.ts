import { InferSchemaType, Schema, model } from "mongoose";

const CMDSchema = new Schema(
  {
    action: {
      type: String,
    },
    param: {
      type: Schema.Types.Mixed,
    },
    // Removed timeout
  },
  { _id: false },
);
const CommandExecutionSchema = new Schema(
  {
    steps: {
      type: Number,
      required: true,
    },
    cmd: {
      type: CMDSchema,
    },
    msg: {
      //It can be workingon parameter from the ai
      type: String,
      required: true,
    },
    terminalOutput: {
      type: String,
      required: true,
    },
    terminalError: {
      type: String,
      required: true,
    },
    isSuccess: {
      type: Boolean,
      required: true,
    },
    exitCode: {
      type: String,
      required: false,
    },
    duration: {
      type: String,
      required: false,
    },
    cwd: {
      type: String,
      required: false,
    },
    imageBase64: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);
const ChatMessageSchema: Schema = new Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant"],
    },
    content: {
      type: String,
      required: true,
    },
    executions: {
      type: [CommandExecutionSchema],
      default: [],
    },
    image: {
      type: String,
    },
    workedSeconds: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const chatSchema: Schema = new Schema({
  userId: {
    type: Schema.ObjectId,
    ref: "Users",
    required: true,
    index: true,
  },
  sessionId: {
    type: Schema.ObjectId,
    ref: "Sessions",
    required: true,
    index: true,
  },
  chatMessages: [ChatMessageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});
chatSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
export type IChat = InferSchemaType<typeof chatSchema>;
export const ChatModel = model<IChat>("Chat", chatSchema);
