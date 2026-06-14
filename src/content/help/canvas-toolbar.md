# Toolbar + 快捷鍵

**Frame** toggle — 開啟畫框模式,在畫布上按住拖出新 frame。
**Hand** toggle — 拖移整個畫布,跟 `Space` 按住效果一樣。兩者互斥。
**frames 計數** — 目前 board 上有多少個 frame。
**↶ / ↷** — undo / redo,只動 board 不動 agent log。

## 快捷鍵

| 鍵 | 動作 |
| --- | --- |
| `Esc` | 取消 placing → blur → 收選取 → 離開 hand/frame mode → fit |
| `Space` (按住) | 暫時 pan(放開回原 tool) |
| `F` | fit overview |
| `Ctrl+Z` | undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | redo |
| `Ctrl+C` / `Ctrl+X` | 複製 / 剪下選中 frame |
| `Ctrl+V` | 進入點擊放置模式(幽靈預覽,點落點;`Esc` 取消) |
| ``Ctrl+` `` | 開/關 terminal panel |
| 滾輪 | 對游標位置 zoom |
| 雙擊畫布 | fit overview |
