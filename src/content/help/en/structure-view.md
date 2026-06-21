# Structure (intent tree)

The agent's output. Two tabs:

- **Tree** — collapsible structure tree (round +/− toggles, connector lines)
- **Prompt** — markdown render with a "preview / source" toggle, editable. Three sections:
  - `## 結構` + `## 節點說明` (written by ✨ Generate Spec, stored at `structure.prompt.structure`)
  - `## Assets` (written in the same Spec run, stored at `structure.prompt.assets`)
  - `## 建議` (reserved for the future 💡 Suggest button, stored at `structure.prompt.suggestions`)

These sections concatenate at render time into one markdown — the **spec** to save, copy the path of, and hand off downstream.

Staleness is tracked by a single `promptVersion` — any board edit triggers a "stale" banner prompting a fresh ✨ Generate Spec press.
