<p align="center">
  <img src="public/logo.png" width="88" alt="bump-square logo">
</p>

# bump-square

> 設計稿與「真正寫程式的 agent」之間的**意圖確認層 (intent layer)**。

bump-square 不做最終 codegen。它讓你在設計截圖上畫出版面、寫下意圖，確認後由 agent
整理成「意圖結構樹」，再把一份 **markdown prompt 送交 (handoff)** 給下游的開發 agent。

bump-square 的職責**終點就是這份意圖 spec**——下游 agent / developer 拿它去產出什麼
（元件程式碼、別的設計、文件……）由對方決定，**不見得是程式碼**，也不屬於本專案範圍。

**北極星**：Figma 提供視覺真實（顏色、間距、尺寸、層級），bump-square 提供意圖真實
（重複、響應式、變體、互動、結構意義）。bump-square 負責「確認 / 意圖」，把確認過的意圖交棒出去。

## 流程

```
upload  →  layout  →  structure  →  handoff
截圖       畫 Frame    意圖結構樹     markdown spec
           + 寫意圖     (agent 產生)   送交開發 agent
```

1. **Upload** — 上傳設計截圖。
2. **Layout** — 在圖上畫 Frame、標註 `comment`（你的意圖）；agent 可加唯讀 `aiNote`（推斷）形成雙重確認。
3. **Structure** — agent 依幾何包含關係 + 各框 comment 組出可收合的結構樹，並渲染成可編輯的 markdown prompt。
4. **Handoff** — 把編輯後的意圖 spec 交棒給下游 agent / developer（產出由對方決定）。

這個 live Claude session 本身就是那個 agent：透過 MCP 讀寫同一份 workspace 狀態，並接收 UI
觸發的即時請求（door­bell）。

## 需求

- **Node ≥ 22**（實際以 24 測試）
- **pnpm**（沒有的話 `install.sh` 會用 corepack 啟用）
- 完整 agent 流程需要 **Claude Code**，並以 fakechat channel 啟動（見下方）

## 安裝

```bash
git clone <repo-url> bump-square
cd bump-square
pnpm install        # 相依套件（跨平台）
pnpm run setup      # 把 skill 連進 ~/.claude/skills/（接 Claude Code 流程用）
```

`pnpm run setup --copy` 改成複製 skill（而非 symlink）。安裝器是 Node 寫的（`scripts/install.mjs`），
Linux / macOS / Windows 通用。只想跑 app（不接 agent）的話，`pnpm install` 即可。

## 使用

```bash
pnpm dev            # dev server → http://localhost:4399
pnpm build          # 產生 production build
```

### 接上 Claude Code（即時 agent 流程）

door­bell（UI 觸發 → 即時進到 session）走官方 **fakechat** channel：

```bash
claude --channels plugin:fakechat@claude-plugins-official
```

- channel 只送達**用這個 flag 啟動的 main session**（sub-agent 收不到）。
- fakechat 服務 :8787 必須在跑（一次 `/mcp` reconnect 會把它拉起來）。
- MCP server 由專案的 `.mcp.json` 在你開啟此專案時自動 spawn。

裝好 skill 後，在任何目錄輸入 `/bump-square` 即可帶起環境並 health-check 各 port。

## 架構

單一真實來源在 server，瀏覽器與 agent 都讀寫同一份。

| 檔案 | 角色 |
|---|---|
| `src/lib/serverState.ts` | **single source of truth**；持久化到 `.bump-square/workspace.json`，含 undo/redo |
| `src/pages/api/events.ts` | **SSE** `/api/events`，把權威狀態推給瀏覽器 |
| `src/pages/api/state.ts` | 瀏覽器 → server 的 mutation |
| `src/pages/api/mcp.ts` | agent → server 的工具面 |
| `mcp/server.ts` | stdio **MCP bridge**，把工具呼叫 HTTP 轉發到 `/api/mcp` |
| `src/lib/containment.ts` | 幾何包含關係（結構樹的依據） |
| `src/stores/workspace.ts` | Pinia store，瀏覽器端唯讀鏡像 + dispatch |
| `.claude/skills/bump-square/` | Claude Code skill：環境帶起 + health-check |

**Tech stack**：Astro 6（SSR, Node standalone）+ Vue 3 islands + Pinia + UnoCSS（presetWind4）、
Vite、TypeScript。MCP 用 `@modelcontextprotocol/sdk`。

API 為 localhost-only，state-mutating endpoint 以 `Sec-Fetch-Site` 做 CSRF guard
（見 `src/lib/guard.ts`）。`.bump-square/`（持久化狀態、上傳圖片、存檔）整個 gitignore。

開發者導向的完整說明（door­bell 協定、agent 視角操作）見 [`CLAUDE.md`](./CLAUDE.md)。

## License

[MIT](./LICENSE) © 2026 silencechung
