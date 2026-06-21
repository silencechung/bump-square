/**
 * Source-of-truth dictionary for bump-square UI strings.
 *
 * - `as const` so keys + values are literal types; `en.ts` is typed against
 *   `keyof typeof strings` and a missing key won't compile.
 * - Flat namespaced keys (`<component>.<id>`) — easier to grep and to spot
 *   duplicates across components than nested objects.
 * - Help-popover *content* still lives as markdown files under
 *   `src/content/help/<locale>/*.md`; this file is only for in-chrome UI labels.
 */

export const strings = {
  // header — AppShell.vue
  'header.step.upload': '① 上傳設計截圖',
  'header.step.layout': '② 畫框並標註每塊的意圖(comment)→ 產生意圖結構',
  'header.step.structure': '③ 檢視產生的意圖結構,送交開發 agent',
  'header.ai.spec.label': '產生 Spec',
  'header.ai.spec.running': '產生中…',
  'header.ai.spec.why': '依 Frame + comment 產生意圖結構 + assets prompt(整份 spec)',
  'header.ai.spec.gate': '先在 Layout 畫至少一個 Frame',
  'header.copy.done': '已複製',
  'header.copy.action': '複製路徑',
  'header.copy.tipDone': '已複製到剪貼簿!',
  'header.copy.tipPrefix': '複製最新 save 路徑(',
  'header.copy.tipSuffix': ')給下游 reader skill',
  'header.copy.tipEmpty': '尚無 save — 先在「存檔」menu 存一份',
  'header.ai.busyOther': '另一個 AI action 進行中,請稍候',
  'header.ai.runningPrefix': 'Claude 正在執行 ',
  'header.ai.runningSuffix': '…',
  'header.reset.armedLabel': '確定清空?',
  'header.reset.idleLabel': 'Reset',
  'header.reset.armedTitle': '再按一次確認清空整個板面',
  'header.reset.idleTitle': '清空整個板面(不可復原;undo/redo 也會清掉)',
  'header.annotation.on': '關閉功能說明',
  'header.annotation.off': '開啟功能說明 — 在每個功能旁顯示可點 dot',
  'header.locale.toEn': 'Switch the UI to English',
  'header.locale.toZh': '把 UI 切回繁中',
  'header.terminal.toggle': '切換 claude --print 終端機面板(Ctrl+`)',
  'header.structureReady': 'structure ready',

  // canvas — WorkspaceCanvas.vue
  'canvas.frame.enter': '進入 Frame mode:拖曳空白處畫新 frame,Ctrl + 拖曳 frame 才能移動',
  'canvas.frame.exit': '退出 Frame mode(回到 Hand)',
  'canvas.undo': '復原 (Ctrl+Z)',
  'canvas.redo': '重做 (Ctrl+Shift+Z / Ctrl+Y)',
  'canvas.place.hint': '點擊放置',
  'canvas.place.cut': '(剪下)',
  'canvas.place.cancel': 'Esc 取消',
  'canvas.frame.dup': 'Duplicate frame (含內部 frames)',
  'canvas.ai.label': 'AI 推斷',
  'canvas.ai.adopt': '採用',
  'canvas.ai.adoptTitle': '採用為我的註解',
  'canvas.ai.dismissTitle': '略過這個推斷',

  // saves — SavesMenu.vue
  'saves.menuTitle': '存檔 / 載入元件設定',
  'saves.menu': '存檔',
  'saves.loaded': '目前載入',
  'saves.overwriteTitle': '用目前 board 覆寫這個存檔',
  'saves.save': '儲存',
  'saves.namePlaceholder': '存檔名稱…',
  'saves.saveAs': '另存新檔…',
  'saves.empty': '尚無存檔。命名後按「儲存」保留目前設定。',
  'saves.loadPrefix': '載入「',
  'saves.loadSuffix': '」',
  'saves.load': '載入',
  'saves.delete': '刪除此存檔',
  'saves.modalTitle': '另存新檔',
  'saves.modalPlaceholder': '輸入存檔名稱…',
  'saves.dupPrefix': '「',
  'saves.dupSuffix': '」已存在,請使用其他名稱。',
  'saves.cancel': '取消',

  // structure — StructureView.vue
  'structure.heading': 'Generated Structure',
  'structure.hint': 'AI actions 在 header 右上角',
  'structure.stale.headline': '下面這份 spec 跟現在的 Frame 不一致',
  'structure.stale.prompt': 'Spec 已過期 — 按 header 的「✨ 產生 Spec」重新產生。',
  'structure.stale.assets': 'Spec 已過期 — 按 header 的「✨ 產生 Spec」重新產生。',
  'structure.edited': '已編輯',
  'structure.reset': '重設',
  'structure.toggleTitle': '切換:預覽(渲染) / 原始碼(可編輯)',
  'structure.source': '原始碼',

  // tree — StructureTree.vue
  'tree.expand': '展開',
  'tree.collapse': '收合',

  // agent — AgentPanel.vue
  'agent.clear': '清空 agent 事件紀錄',
  'agent.emptyTop': '每次按 header 上的 ✨ 產生 Spec 按鈕,這裡會記一筆。',
  'agent.emptyBottom.prefix': '跑中的 entry 顯示 spinner;完成後顯示 ',
  'agent.emptyBottom.suffix': ' + 摘要那一行。即時輸出在底下 terminal panel。',
  'agent.footer': '即時輸出在底下 terminal panel。',

  // terminal — TerminalPanel.vue
  'terminal.clear': '清除終端機輸出',
  'terminal.close': '關閉終端機面板(Ctrl+`)',

  // installBanner — SkillInstallBanner.vue
  'installBanner.msg': ' skill 尚未安裝 — Claude 無法產生意圖結構',
  'installBanner.installing': '安裝中…',
  'installBanner.install': '一鍵安裝並重試',
  'installBanner.close': '關閉',

  // annotation — AnnotationDot.vue + AnnotationOverlay fallback
  'annotation.dotLabel': '說明:',
  'annotation.missing': '(說明缺失)',
} as const;
