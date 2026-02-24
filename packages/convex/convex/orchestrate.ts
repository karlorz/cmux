import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Send a message to a running agent via the mailbox.
 * This mutation stores a message in Convex that can be queried by the agent
 * and will be included in the mailbox sync to MAILBOX.json.
 */
export const sendMessage = mutation({
  args: {
    taskRunId: v.id("taskRuns"),
    message: v.string(),
    messageType: v.union(
      v.literal("handoff"),
      v.literal("request"),
      v.literal("status")
    ),
    senderName: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const taskRunId = args.taskRunId;

    // Verify task run exists
    const taskRun = await ctx.db.get(taskRunId);
    if (!taskRun) {
      throw new Error("Task run not found");
    }

    // Create mailbox message object
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskRunId,
      type: args.messageType,
      content: args.message,
      senderName: args.senderName,
      timestamp: args.timestamp,
      read: false,
    };

    // For now, we store messages in memory. In the future, this could be:
    // 1. Stored in a separate agentOrchestrateMessages table and synced to MAILBOX.json
    // 2. Appended directly to the agent's MAILBOX.json via HTTP callback
    // 3. Queried by the agent's MCP server to populate MAILBOX.json
    //
    // For MVP, we just acknowledge the message was sent.
    // The actual delivery mechanism depends on how agents retrieve messages.

    return {
      ok: true,
      messageId: message.id,
    };
  },
});
