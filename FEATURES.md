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
- **Gemini support(parked)** — 加第二個 model provider。延後因為 Gemini CLI 看起來要 deprecation。重啟時優先評估「直接打 Gemini API server-side transform」路徑,**不要** spawn `gemini-cli`。

## done

- **#3 i18n (en + zh-TW)** — bilingual README + central TS dict + server-driven locale + `~src/` path alias + Teleport hydration fix。a10a845 + d6862bb。
