# bump-square

> 給 Claude 的專案說明。技術名詞用英文、路徑用實際檔名；不確定的請先讀程式碼或實際狀態再行動（見 user-level「No vibe answers」）。

## 目的

bump-square 是設計稿與「真正寫程式的 agent」之間的**意圖確認層 (intent layer)**，不是最終 codegen。

流程：使用者上傳設計截圖 → 在上面畫 Frame、寫 comment（意圖）→ 確認版面 → 由 agent 產生「意圖結構樹」+ 一份 markdown spec → 使用者**存檔 + 複製 save path**(或複製 spec 文字),交給下游 reader skill / 開發 agent / 人類去實作。bump-square 本身不寫 code,handoff 是使用者層面的動作,不是 server-spawn 的 agent kind。

**agent = 由 dev server spawn 的 `claude --print`**（Claude Code CLI；使用者一次 `claude login` 即可，不需要 API key）。每次 UI 觸發動作（generate-structure / suggest-assets — 沒有 handoff kind,handoff 是使用者複製 save path 給下游),server 起一個 `claude --print` 行程，帶 `/bump-layout` skill prompt，agent 直接讀寫 `~/.bump-square/workspace.json`；server 用 `fs.watch` 偵測檔案變更後再 SSE 推回瀏覽器。北極星：Figma + 人工意圖疊加 → agent build；bump-square 負責「確認/意圖」，不負責產出最終程式碼。

## 架構

單一真實來源在 server，瀏覽器與 `claude --print` 都讀寫同一份 `~/.bump-square/workspace.json`。

- `src/lib/serverState.ts` — **single source of truth**(module-scope,HMR-safe via `globalThis`)。持久化到 `~/.bump-square/workspace.json`(debounced atomic write,tmp + rename);含 undo/redo 快照堆疊(board only,上限 30)。**`fs.watch` 監聽該目錄**:若檔案被外部(`claude --print`)改動就 reload + 廣播給瀏覽器(自寫時用 `_suppressWatch` flag 避免迴圈;reload 時**保留 in-memory 的 `boardVersion` / `structure.*Version` 戳記**,server 是版號的唯一裁決者)。**版號模型**:`boardVersion`(timetick,`Date.now()`)在每次 board mutation 時 bump(`mutate({ bumpVersion: true })`,預設跟著 `history` 走;undo/redo 顯式 bump);`structure.promptVersion` / `assetsPromptVersion` 在 `claudeRunner` agent spawn 時抓 `boardVersion` 當 stamp,close handler 在 exit 0 時用 `stampStructureVersion()` 寫回。UI 比對 `boardVersion !== promptVersion` 判定 stale。**UI locale 也住這**(`currentLocale` module-level,初值來自 `loadConfig().ui.locale`):`getLocale()` 讀、`setLocaleAndSave()` 寫(同時 persist 到 config.json + 重 emit SSE 讓所有 tab 更新)。
- `src/pages/api/events.ts` — **SSE** `/api/events`，把權威狀態（+ `canUndo/canRedo`）推給瀏覽器。
- `src/pages/api/state.ts` — **瀏覽器 → server** 的 mutation（`action` + `payload`）。CSRF guard。Action 列表含 board ops(addSquare / updateSquare / removeSquare / duplicateFrame / moveFrameGroup / pasteFrame / undo / redo / reset...)、save ops(listSaves / saveState / loadState / updateCurrentSave / deleteSave)、`setLocale`(switch UI 語言走這條,不存 localStorage)。
- `src/pages/api/run-claude.ts` — **瀏覽器 → server** 觸發 agent：`POST { kind: 'generate-structure' | 'suggest-assets' }`，CSRF guard，回 `202` 後立即 spawn。Pre-flight 檢查 `~/.claude/skills/bump-layout/SKILL.md` 存在；不存在回 `409 skill-missing`，UI 顯示安裝 banner。
- `src/lib/claudeRunner.ts` — 管理 `claude --print` lifecycle（**同時只跑一個**，後續排 queue）。每次 spawn 都重讀 `~/.bump-square/config.json`（見 `src/lib/config.ts`）；預設 args：`--model sonnet --output-format stream-json --verbose --allowedTools Read,Write,Edit`，使用者可在 config 覆寫 model / allowedTools / outputFormat / verbose。**沒有任意 extra-args 逃生口**——`--allowedTools` 只是 auto-approve list，真正擋住「不在 list 內的工具」是因為 `--print` 沒人能 prompt + 預設 permission-mode；若放任意 args，攻擊者可塞 `--permission-mode bypassPermissions`／`--dangerously-skip-permissions`／`--add-dir /`／第二個 `--allowedTools` 直接繞過。stream-json 一行一個事件，`formatStreamEvent()` 把它翻成 xterm-friendly 進度行（drop hook 噪音；assistant 文字直出；tool_use → `🛠 ToolName <target>`；tool_result 沉默除非 error），同時推進 circular buffer（最多 10000 行）與 SSE bus。
- `src/lib/config.ts` — `~/.bump-square/config.json` 的 schema 跟讀寫。Schema:`{ claude: { model, allowedTools, outputFormat, verbose }, ui: { locale } }`。`loadConfig()` 把 file 合併到 hardcoded defaults(`model: 'sonnet'`、`allowedTools: ['Read','Write','Edit']`、`locale: 'zh-TW'`),讀檔失敗就 fallback 到 defaults 讓 app 永遠跑得起來;`saveLocale()` 用 read-modify-write 寫回,保留其他無關 override(例:不會把 `claude.model` 蓋掉)。**typed fields only — 不收任意 args / extras 陣列**(`extraArgs` 1.0 安全課程,見 memory 同名 entry)。
- `src/pages/api/terminal/events.ts` — SSE `/api/terminal/events`，連線時 replay buffer，之後 live push chunks／clear／status（running 狀態）。chunk 用 base64 encode（避開 SSE 換行問題）。
- `src/pages/api/install-skill.ts` — `POST`，把 repo 內 `skills/bump-layout/SKILL.md` copy 到 `~/.claude/skills/bump-layout/SKILL.md`（idempotent）。CSRF guard。
- `src/pages/api/i18n.ts` — `GET /api/i18n[?locale=en|all=1]`,read-only snapshot。SSR 初次 render / 外部 debug 用;**locale 變更本身走既有 SSE**(`/api/events`),UI 不需 poll 這個 endpoint。
- `skills/bump-layout/SKILL.md` — `claude --print` 真正讀的 skill：`/bump-layout` 指令告訴 agent 讀 `~/.bump-square/workspace.json`、依 containment + comment 產生 structure、直接寫回該檔案。**只允許動 workspace.json**；JSON 寫檔禁用 `Edit` 工具（用 Read + Write）。
- `src/components/TerminalPanel.vue` — 底部 xterm.js readonly panel（`disableStdin: true`，FitAddon），預設收起，header `>_` 按鈕切換；首次 `terminalRunning` 自動展開一次（之後使用者關了就不再自動開）；高度 240px 可拖。
- `src/components/SkillInstallBanner.vue` — 偵測 `store.skillMissing`，顯示「一鍵安裝 bump-layout skill」banner，POST `/api/install-skill` → 清掉 flag → store 自動 retry 原本的 run。
- `src/lib/imageStore.ts` — 圖片存 `~/.bump-square/uploads/<uuid>.<ext>`，狀態只存 filename 引用；用 `/api/image/[name]` 回傳。
- `src/lib/saveStore.ts` — 具名存檔 `~/.bump-square/saves/<id>.json`（只存 board，不含 agent log）。
- `src/lib/containment.ts` — 幾何包含關係（結構樹的依據）。
- `src/lib/guard.ts` — `crossOriginBlocked()`：用 `Sec-Fetch-Site` 擋跨站 POST，避免使用者開到惡意網頁就被 RCE（任意 `claude --print`）。
- `src/stores/workspace.ts` — Pinia store，瀏覽器端的唯讀鏡像 + dispatch；`runAgentKind(kind)` 打 `/api/run-claude`，409 時把 `skillMissing` 記下、安裝完自動 retry。`locale` ref + `toggleLocale()` / `setLocale()` 也住這(`toggleLocale` 在 `zh-TW` / `en` 之間 swap;dispatch `'setLocale'` 走 `/api/state`)。
- `src/i18n/{zh-TW.ts, en.ts, index.ts}` — **中央 i18n dict + 型別**。`index.ts` 匯出 `getStrings(locale)` / `getString(locale, key)` / `StringKey`(= `keyof typeof zhTW`,讓 `t('typo')` 直接 compile error)。新增字串就改 dict、不用碰每個 component;沒拉 vue-i18n 是因為只有 2 locale + ~70 字串,full library 的 plural / number / date 用不到。
- `src/composables/` — 共用 reactive 邏輯(component 只剩 wiring + template):
  - `useViewport.ts` — zoom／pan／fit／focus／1:1（WorkspaceCanvas 用;座標數學在 `lib/viewport.ts`，這裡是 reactive glue：container size、auto-fit、wheel zoom）。
  - `useFrameInteractions.ts` — 畫框／pan／resize（8 handle）／拖移群組／copy-cut-paste,含幾何 helper(`screenRect`／`imgStyle`／z-stacking／ghost preview)與統一 pointer handlers。**單一 `drawMode` 狀態**:false = Hand mode(預設,純 pan 工具,所有拖曳都 pan),true = Frame mode(canvas 拖曳畫 frame、frame 拖曳畫巢狀;`Ctrl + frame body` 才移動 — 唯一移動路徑)。`handMode` computed 維持 inverse 給呼叫端用。
  - `useNotesRail.ts` — Notes rail 的 leader line（hover + 選取兩種）、浮動 label 排版、`notesOpen`／`showLabels`。
  - `useT.ts` — i18n lookup(32 行);`useT()` 回傳 `(key: StringKey) => string`,讀 `store.locale` 所以 reactive(切 locale 全部 re-render)。
  - `useAnnotations.ts` — `AnnotationDot` 共用的 popover open state + `HelpArea` union 型別(下面那條解釋)。
- `src/components/{AnnotationDot, AnnotationOverlay}.vue` + `src/content/help/{en,zh-TW}/<area>.md` — **ⓘ help popover 系統**。每個區塊放 `<AnnotationDot area="...">`,hover 跳出對應的 markdown 文章(`markdown-it`,`html:false` 防 XSS)。`area` 是 `HelpArea` union(在 `useAnnotations.ts`),compile 期把 `<AnnotationDot area="typo">` 擋下(typo 不會默默變「(說明缺失)」)。Content locale-aware,跟著 `store.locale` 切目錄。目前 8+ dot 散落在 `AppShell`(breadcrumb / save-cluster / ai-cluster / reset)、`WorkspaceCanvas`(canvas / canvas-toolbar / notes-rail)、`StructureView`、`TerminalPanel`。

`~/.bump-square/` 與 `.bump-square/`（rare local override）整個 gitignore。

**locale 同步路徑**(跟 workspace.json 同 pattern,server 是唯一真相):瀏覽器 toggle 按鈕 → `store.toggleLocale()` → `dispatch('setLocale', { locale })` → `POST /api/state` 的 `setLocale` action → `serverState.setLocaleAndSave()` 寫 `~/.bump-square/config.json` + 重 emit SSE → 所有打開的 tab 同步切換 + 所有用 `useT()` 的 component reactive re-render。**沒新 socket、沒 localStorage,re-use 既有 mutation + SSE 管道**;`useT()` 只是 store.locale + dict lookup 的 thin wrapper(32 行),locale 是 reactive ref 所以 `t('key')` 在 template / computed 裡會自動 track。

### 已移除的舊架構（commits 0bd570e → 0f0013b）

- ❌ `mcp/server.ts`（MCP stdio bridge）
- ❌ `.mcp.json`（自動 spawn MCP）
- ❌ `src/pages/api/mcp.ts`（MCP → HTTP 轉發 endpoint）
- ❌ fakechat 門鈴鏈：`ringFakechat`、`DoorbellStatus.vue`、`<channel source="fakechat">` 流程
- ❌ `agentRequests` queue（server 排隊 + agent 拉取的舊模型）
- ❌ `claude --channels plugin:fakechat@claude-plugins-official` 啟動需求

新流程不需要 API key、不需要常駐 session、不需要 fakechat singleton port。

## Tech stack

- **Astro 6**（`output: 'server'`，Node standalone adapter）+ **Vue 3** islands（`<script setup lang="ts">`）+ **Pinia** + **UnoCSS**（`presetWind4`，對齊原本的 Tailwind v4／oklch 色票與 v4 reset；`@unocss/astro` integration + `uno.config.ts`）。
- **Vite**、**pnpm**、Node ≥ 22（實際跑 24）。**TypeScript** + `@types/node` + **`~src/*` path alias**（`tsconfig.json` 的 `paths`,等於 `./src/*`,整 codebase 50+ 處 import 都用這個 — 重構搬檔不會把相對路徑 `../../../lib/x` 拉斷）；`pnpm exec tsc --noEmit` 可型別檢查。
- `@xterm/xterm` + `@xterm/addon-fit`（terminal panel）、`zod`、`uuid`、`sharp`、`konva` / `vue-konva`、`markdown-it`（Structure 的 Prompt 預覽渲染，`html:false` 防 XSS）。
- Dev server **port 固定 4399**（`astro.config.mjs`）。
- **CLI 依賴**：`claude`（Claude Code CLI）必須在 PATH 上、已 `claude login`。`claudeRunner` 用 `spawn('claude', ...)`；找不到會在 terminal 顯示 spawn error。

UnoCSS 注意事項：用 `presetWind4({ preflights: { reset: true } })` 還原原本 Tailwind v4 的樣子（oklch 色票 + 內建 v4 reset，含全域 `border:0 solid` 讓 `border-2`/`border-4` 這類「只設寬度」的 utility 看得到框）。**改用 `presetWind3` 會踩雷：v3 不設全域 `border-style`，所有 `border-N` 變透明 → 框線全部消失。** 自訂 reset／`<button>` 背景／`.no-scrollbar` 放在 `uno.config.ts` 的 `preflights`；共用樣式用 `shortcuts`（`btn` / `btn-primary` / `btn-neutral` / `icon-btn`）。Astro `<style>` 是 scoped，全域樣式要 `is:global`。**pnpm 坑**：`unocss/astro` 內部 re-export `@unocss/astro`，pnpm 巢狀下從專案根解不到 → 直接 `pnpm add -D @unocss/astro` 並 import `@unocss/astro`。

## Permissions / 啟動

- **啟動指令**：`pnpm dev`（:4399）。**不需要 `--channels` flag**，不需要任何特殊 session 模式。
- **前置一次性設定**：使用者跑 `claude login`（支援 Google OAuth），確保 `claude` 在 PATH 上。
- **bump-layout skill 安裝**：app 第一次按「產生意圖結構」時 `/api/run-claude` 回 `409 skill-missing`，UI 顯示安裝 banner，按一下 POST `/api/install-skill` 把 repo 內 `skills/bump-layout/SKILL.md` 複製到 `~/.claude/skills/bump-layout/SKILL.md`。也可 `pnpm run setup` 額外裝一份 ops skill（`/bump-square`，幫使用者快速 health-check + 起 dev server，跟 agent 流程無關）。
- **agent 工具範圍**：`claudeRunner` 預設加 `--allowedTools Read,Write,Edit`（可在 `~/.bump-square/config.json` 的 `claude.allowedTools` 覆寫，例如要加 `Bash`），skill 本身規定只動 workspace.json。下游 reader skill 在 `~/Documents/Projects` 下實作元件是另一個 process,不在這個 dev server spawn 的 agent 範圍內。
- **同時只跑一個 `claude --print`**：第二次觸發會 queue。
- **CSRF**：`/api/run-claude`、`/api/install-skill`、`/api/state` 都檢查 `Sec-Fetch-Site`（`src/lib/guard.ts`）。

## 功能說明

工作流三步：`upload → layout → structure`（header 的 chevron 麵包屑可切換）。

- **Upload** — 上傳設計截圖。
- **Layout (WorkspaceCanvas)** — 在圖上畫 Frame、標註意圖：
  - `comment`（使用者意圖）/ `aiNote`（agent 推斷，唯讀、與 comment 形成雙重確認）。
  - **手勢模型(toolbar 單一 `Frame` toggle)**:
    - **Hand mode**(預設,Frame 關):純 pan 工具 — 拖曳空白或 frame body 都只 pan canvas;frame 只能 click 選取。
    - **Frame mode**(Frame 開):拖曳空白 = 畫新 frame、拖曳 frame body = 畫**巢狀** frame、**`Ctrl` + 拖曳 frame body = 移動**(含內部,依 containment;`Ctrl` modifier 把畫巢狀跟移動分開,避免誤觸)。
    - **移動 frame 只有一條路徑**:Frame mode + `Ctrl` + 拖曳 frame body。
    - 兩種模式都:選中粗紫框 + 8 向 resize handle、滾輪對游標位置 zoom、`Space` 按住或中鍵拖曳 = 臨時 pan(escape hatch)。
  - Frame 動作:**⧉ 複製**(含內部,置於下方)。
  - **Ctrl+C/X/V 點擊放置**：複製/剪下選中框 → Ctrl+V 進入放置模式（幽靈預覽跟游標、點擊落點、Esc 取消）。
  - **Undo/Redo**：工具列 ↶↷ + Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y（全 board 操作，agent log 不進 history）。
  - 框依**面積排 z-index**（小框在上，可點進內層）。
  - Notes rail：單擊改名、✏/⧉/✕；浮動標籤可切換顯示。**選中 Frame 會畫一條虛線 leader line 指到它在 Notes rail 的編輯列**（提示去哪寫意圖；隨 zoom/pan/scroll 即時跟動）。
  - `🧩 產生意圖結構` → 觸發 `generate-structure`：POST `/api/run-claude` → spawn `claude --print`（terminal panel 首次自動展開）→ agent 寫回 workspace.json → fs.watch 偵測 → SSE 推新 structure 給瀏覽器。
  - **Reset（header）** 兩段式確認：第一下變紅「確定清空？」，3 秒內再按一次才真的清空。
- **Structure (StructureView)** — 兩個 tab：
  - **Tree**：可收合的結構樹（圓形 +/− toggle、連接線）。
  - **Prompt**：markdown 渲染（**預覽/原始碼** toggle 可編輯）；內容＝`## 結構`（code-fence 樹狀）+ `## 節點說明`（清單）+ 選配 `## Assets 生成 prompt`。
  - **Stale banner**:當 `boardVersion !== structure.promptVersion`(或 assetsPromptVersion)時,Tree 跟 Prompt 上方會出現琥珀色提示「下面這份 spec 跟現在的 Frame 不一致」,提醒使用者重新按🧩 / ✨ 產生。Prompt 是 snapshot 不是 live,版號模型讓使用者知道什麼時候要重跑。
  - `✨ 生成 assets prompt` → 觸發 `suggest-assets`。沒有「送交開發」按鈕 — handoff 是使用者手動行為:在 SavesMenu 存一份,按 header 的「複製路徑」把 save JSON 的絕對路徑放剪貼簿,貼給下游 reader skill / 開發 agent / 人類去實作元件。
- **💾 存檔（SavesMenu，header）** — 多組具名存檔，可載入/刪除；只存 board，不含 agent log。
- **`>_` Terminal 面板（header）** — 底部 xterm readonly panel 顯示 `claude --print` 即時輸出；預設收起、首次跑時自動展開一次；按鈕右上有 pulsing dot 表示「跑中但 panel 關著」。

## 操作方式（agent / `claude --print` 視角）

被 dev server spawn 時收到的 prompt 開頭是 `/bump-layout`，下面接 `workspace: <絕對路徑>` + 操作描述。**真實檔案路徑以 prompt 中的 `workspace:` 為準**（會是 `~/.bump-square/workspace.json` 的展開）。

1. **讀 `workspace.json`**（用 `Read` 工具）— `squares[]` 是 frames、`structure` 是要寫回的目標。
2. 依 `kind` 處理：
   - `generate-structure` → 依 containment + 各框 `comment` 組出意圖結構樹 → 寫 `structure.tree` + `structure.prompt` + `structure.assetsPrompt: null`。重複的子結構可收斂成「範本 ×N」（列表/資料驅動意圖）。沒 comment 的框，型別用推斷並標 `（推斷）`、**不杜撰使用者意圖**。
   - `suggest-assets` → 依現有 `structure.tree` 推敲每節點需要的視覺素材，寫成 markdown 進 `structure.assetsPrompt`（不動 tree/prompt）。
3. **JSON 寫檔用 `Read` + `Write`，不要用 `Edit`**（Edit 容易把 JSON 改壞）。
4. 結束時用繁中印出做了什麼的一行摘要 — `claudeRunner` 會把這行流進 xterm 給使用者看。

```mermaid
flowchart TD
    A["UI 按鈕觸發\n(generate-structure / suggest-assets)"] --> B["POST /api/run-claude\n(CSRF guard)"]
    B --> C{"skill 已裝?"}
    C -- "否" --> D["409 skill-missing\n→ UI 安裝 banner\n→ POST /api/install-skill\n→ auto-retry"]
    C -- "是" --> E["claudeRunner.runClaude(prompt)\nspawn claude --print --model sonnet\n--output-format stream-json\n--allowedTools Read,Write,Edit"]
    E --> F["stream-json → formatStreamEvent\n→ SSE /api/terminal/events\n→ xterm TerminalPanel"]
    E --> G["agent 用 /bump-layout skill\n讀寫 ~/.bump-square/workspace.json"]
    G --> H["fs.watch 偵測檔案變更\n→ serverState reload\n→ bus.emit('change')"]
    H --> I["SSE /api/events\n→ 瀏覽器 Pinia store 更新\n→ UI 立即看到新 structure"]
```

開發指令：`pnpm dev`（:4399）、`pnpm build`、`pnpm run setup`（裝 `/bump-square` ops skill，可選）。
