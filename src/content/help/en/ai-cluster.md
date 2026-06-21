# AI actions

**✨ Generate Spec** — spawns one `claude --print` in the dev server, running the `/bump-layout` skill. **Writes the whole spec in one pass**:
- `structure.tree` — the intent tree
- `structure.prompt.structure` — `## 結構` + `## 節點說明` markdown
- `structure.prompt.assets` — `## Assets` markdown (visual-asset suggestions)

The terminal panel at the bottom streams live output.

Pre-0.2.0 had two buttons (🧩 Structure + ✨ Assets) and two agent kinds. Collapsed to one because both sections belong to the same spec — splitting them meant two LLM runs and two independent staleness flags without proportional benefit.

The future 💡 Suggest button (#11) will be a separate addition, writing `structure.prompt.suggestions`.
