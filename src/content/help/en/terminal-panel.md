# Terminal panel

Bottom xterm.js readonly panel, streaming `claude --print`'s live output — `🛠 ToolName <target>` shows what the agent touched, assistant text prints through, tool errors are flagged with ⚠.

- Collapsed by default; auto-expands once on the first agent run (after you close it, it stays closed)
- Toggle from the header `>_` button or **`` Ctrl+` ``** (VSCode-style)
- When something's running but the panel is closed, the button shows a pulsing dot at the top-right
