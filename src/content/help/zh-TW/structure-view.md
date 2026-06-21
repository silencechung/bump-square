# Structure (意圖結構樹)

agent 整理完的結果。兩個 tab:

- **Tree** — 可收合的結構樹(圓形 +/− toggle、連接線)
- **Prompt** — markdown 渲染,「預覽 / 原始碼」toggle 可編輯。內容由三段 section 組成:
  - `## 結構` + `## 節點說明`(由 ✨ 產生 Spec 寫入,存到 `structure.prompt.structure`)
  - `## Assets`(同一次 Spec run 一起寫入,存到 `structure.prompt.assets`)
  - `## 建議`(預留給未來 💡 Suggest,存到 `structure.prompt.suggestions`)

這三段渲染時拼成一份完整 markdown,就是要存檔、複製路徑、交給下游的 **spec**。

stale 判定共用一個版號(`promptVersion`)— 板面有改動就會出現「過期」橫幅,提示重按 ✨ 產生 Spec。
