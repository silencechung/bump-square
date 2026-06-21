# AI 動作

**✨ 產生 Spec** — dev server spawn 一個 `claude --print`,跑 `/bump-layout` skill,**一次寫完整份 spec**:
- `structure.tree` — 結構樹
- `structure.prompt.structure` — `## 結構` + `## 節點說明` markdown
- `structure.prompt.assets` — `## Assets` markdown(視覺素材建議)

底下 terminal panel 看得到即時輸出。

0.2.0 之前是 🧩 結構 + ✨ Assets 兩顆按鈕、兩條 agent kind;現在收成一條因為兩段本來就同屬一份 spec,分開按代表跑兩次 LLM、stale flag 兩條獨立追,複雜度沒換到對應的價值。

未來 💡 Suggest(#11)會獨立加進來,寫 `structure.prompt.suggestions`。
