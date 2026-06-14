# bump-square feature backlog

> 規則:
> - 使用者說 `feature: XXX` → 直接 append 到 `## pending`。
> - 空檔 / 任務收尾時 → 從 `## pending` 挑一條建議下一步開工。
> - 完成 → 移到 `## done`,附上 commit / PR。

## pending

- **#3 i18n (en + zh-TW)** — 把 `src/content/help/*.md` 改成 `help/<locale>/*.md`,Annotation help popover 依 locale 解析。`src/components/AnnotationOverlay.vue:6` 已有 marker comment 標記「When task #3 (i18n) lands…」。
- **#4 Desktop app vs lockfile(scoping discussion)** — bump-square 要不要包成 desktop app(Tauri / Electron),還是維持 dev-server-only。先確認方向再開工。
- **#6 Custom prompt 附註(per-frame extra prompt)** — 每個 Frame 一個 freeform 附註,會被注入 `generate-structure` 的 prompt。先前起頭過、reverted pending priority。
- **Gemini support(parked)** — 加第二個 model provider。延後因為 Gemini CLI 看起來要 deprecation。重啟時優先評估「直接打 Gemini API server-side transform」路徑,**不要** spawn `gemini-cli`。

## done

(完成項目移到這,附 commit / PR。)
