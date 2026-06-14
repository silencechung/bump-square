# AI actions

**🧩 Generate structure** — assembles a structure tree from frame containment + each `comment` and writes it back to `workspace.json`.

**✨ Generate assets prompt** — walks the structure tree to suggest visual assets per node, appended as markdown after the prompt.

Both buttons spawn one `claude --print` in the dev server, running the `/bump-layout` skill. The terminal panel at the bottom streams the live output. Only one runs at a time — a second press is queued.
