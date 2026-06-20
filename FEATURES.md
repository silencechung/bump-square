# bump-square feature backlog

> 規則:
> - 使用者說 `feature: XXX` → 直接 append 到 `## pending`。
> - 空檔 / 任務收尾時 → 從 `## pending` 挑一條建議下一步開工。
> - 完成 → 移到 `## done`,附上 commit / PR。

## pending

- **#4 Desktop app vs lockfile(scoping discussion)** — bump-square 要不要包成 desktop app(Tauri / Electron),還是維持 dev-server-only。先確認方向再開工。
- **#6 Custom prompt 附註(per-frame extra prompt)** — 每個 Frame 一個 freeform 附註,會被注入 `generate-structure` 的 prompt。先前起頭過、reverted pending priority。
- **#7 Structure / Assets prompt prefix + postfix(per-action wrapper)** — UI 提供兩格輸入(prefix / postfix),按 [產生結構] / [Assets] 時,server 把使用者填的字串包在預設 prompt 前後再 spawn `claude --print`。用途:不改 `bump-layout` skill 就能加全域指令(例:「always use TypeScript」、「output in English」)。設定持久化到 `~/.bump-square/config.json`(跟 `ui.locale` 同層級,新增 `prompts.structure` / `prompts.assets` 各 `{ prefix, postfix }`),走現有 SSE 廣播。跟 #6 不同範圍:#6 是 per-Frame,#7 是 per-action 全域。
- **#8 Claude API support(評估)** — 目前 agent path 只有 `claude --print`(Claude Code CLI + `claude login`)。評估加上「直接打 Anthropic API(API key)」做為第二條路徑。**Trade-off**:CLI path 免費繼承 skills / tool use / MCP / `--allowedTools` 安全網;API path 要在 bump-square 自己跑 tool-use loop(Read / Write workspace.json 要自己接),但少一層 CLI 依賴、可純 server-side 部署。**先決問題**:`/bump-layout` skill 的語意能不能用 inline system prompt 替代;API key 怎麼存(`~/.bump-square/config.json` 或 `ANTHROPIC_API_KEY` env)。先寫 design doc,不要直接動 `claudeRunner`。
- **#9 Assets 優化建議(per-frame image prompt)** — 針對 Frame 區域內的既有圖片(從 `~/.bump-square/uploads/` 對應 frame bbox crop 出來),呼叫 agent 產生「這張圖該怎麼優化 / 重生」的 prompt。跟 #7 的 `suggest-assets`(整張 structure 的 assets 清單)不同範圍:#9 是 per-frame、輸入是**像素**(現有圖)、輸出是**單張改進 prompt**。實作要點:crop 圖到暫存檔 → spawn agent 帶圖(`claude --print` 支援 image input?要查)→ 寫回 `square.assetsPrompt` 或新欄位。需要先驗證 `claude --print` 是否能吃 image 輸入。
- **#11 [Suggest] 按鈕 — agent 對結構提改進建議** — 新一條 agent kind `suggest-improvements`(類似現有的 generate-structure / suggest-assets)。輸入:整份 workspace.json + 已存在的 structure.tree。輸出:寫到新欄位 `structure.suggestionsPrompt`(markdown)。內容方向:type 推斷 vs 使用者 label 不一致警示、漏掉的 frame(geometry 暗示有但沒被框)、命名一致性(5 個 LinkItem 但子節點數量差一)、`#tag` token 合理性檢查、模式辨識(card grid / list-with-detail)。觸發按鈕跟 [產生結構] / [✨ Assets] 並列在 toolbar(可能命名 `💡 Suggest` 或 `🔍 Review`)。**先決問題**:跟 #7(per-action prefix/postfix)的關係 — 是直接共用 generate-structure 的 wrapper 還是獨立配置;跟「結構 client-side 預算」(speed-up B)的耦合 — 如果樹本身已被前端算好,agent 的角色就完全收斂到「補語意 + 提建議」這條,#11 就變成主要的 AI 入口。
- **Gemini support(parked)** — 加第二個 model provider。延後因為 Gemini CLI 看起來要 deprecation。重啟時優先評估「直接打 Gemini API server-side transform」路徑,**不要** spawn `gemini-cli`。

## done

- **#3 i18n (en + zh-TW)** — bilingual README + central TS dict + server-driven locale + `~src/` path alias + Teleport hydration fix。a10a845 + d6862bb。
- **#10 Comment editor with inline tag chips + autocomplete(syntax + popup)** — 從早期 `#tag` 設計 pivot 到 `` `tag` ``(paired backticks,markdown convention,off-dict + 中文 + 任意字元都行)。Tiptap-based `CommentEditor.vue`(`@tiptap/core/vue-3/extension-document/paragraph/text/history/placeholder/suggestion`)+ atomic `TagNode`(`src/lib/tagNode.ts`,markdown InputRule)+ `TagSuggestion` popup(`src/lib/tagSuggestion.ts`,~250 條 HTML/CSS/Tailwind 字典 prefix + subsequence fallback match,Tab/Space commit、Enter 留給 native newline)。Card view 端用同 regex `` /`([^`\s]+)`/g `` parser render chip,edit↔card 無視覺跳動。資料層保持純字串,downstream agent 用同 regex 抽 intent token。同 PR 修了 round-trip 用 `\n\n` separator 導致 refresh 指數爆胖的 bug + 加 M2 migration(`normalizeCommentNewlines` in `serverState.ts`)。Branch `docs/readme-config-section`(待 PR)。
