// OpenCode notification plugin for cmux sandbox
// Sends notifications to cmux UI when agent becomes idle
export const NotificationPlugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        try {
          await $`cmux-bridge notify "OpenCode awaiting input"`;
        } catch (err) {
          // Ignore notification failures
        }
      }
    },
  };
};
