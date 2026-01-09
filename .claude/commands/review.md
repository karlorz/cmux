---
description: Run codex code review against main branch
allowed-tools: Bash(codex:*)
---

Run the codex code review against main branch using this command (timeout 5 minutes):

```
codex review --base main -c model="gpt-5.2" -c model_reasoning_effort="high"
```

Analyze the findings and address any issues found.
