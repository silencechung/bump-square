# bump-square feature backlog

> Rules:
> - When the user says `feature: XXX`, append it to `## pending`.
> - At idle / end-of-task moments, suggest one item from `## pending` to pick up next.
> - When done, move the item to `## done` with the related commit / PR.

## pending

- **#3 i18n (en + zh-TW)** — restructure `src/content/help/*.md` as `help/<locale>/*.md`; have the Annotation help popover resolve content by locale. `src/components/AnnotationOverlay.vue:6` already has a marker comment ("When task #3 (i18n) lands…") pointing at the planned API.
- **#4 Desktop app vs lockfile (discussion)** — scoping discussion: should bump-square ship as a desktop app (Tauri / Electron), or stay dev-server-only? Decide direction before any implementation.
- **#6 Custom prompt 附註 (per-frame extra prompt)** — a small freeform note per Frame that gets injected into the `generate-structure` prompt. Earlier attempt was started then reverted pending priority.
- **Gemini support (parked)** — add a second model provider. Deferred because the Gemini CLI looks like it's heading toward deprecation. When revived, evaluate "direct Gemini API server-side transform" first; **do not** spawn `gemini-cli`.

## done

(empty — completed items move here with commit / PR.)
