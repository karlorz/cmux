# cmux Project Instructions

## cmux Agent Memory Protocol

You have access to persistent memory in `.cmux/memory/`:

### On Start
1. Read `.cmux/memory/TASKS.json` to see existing tasks and their statuses
2. Read `.cmux/memory/MEMORY.md` to see what previous agents have learned

### During Work
- Update task statuses in TASKS.json (pending -> in_progress -> completed)
- Create new tasks if you discover additional work needed

### On Completion
- Append a dated section to MEMORY.md with what you accomplished and learned
- Update TASKS.json with final statuses

### Inter-Agent Messaging
- Your agent name: $CMUX_AGENT_NAME
- Check `.cmux/memory/MAILBOX.json` for messages addressed to you
- To message another agent: append to the messages array with format:
  ```json
  {"from": "your-agent", "to": "target-agent", "message": "...", "timestamp": "ISO-8601"}
  ```

