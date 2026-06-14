# Terminal Panel

底部 xterm.js readonly panel,顯示 `claude --print` 的即時輸出 — `🛠 ToolName <target>` 看 agent 動了什麼、assistant 文字直出、tool 出錯會用 ⚠ 標。

- 預設收起,首次跑 agent 自動展開一次(之後關了就不再自動開)
- header `>_` 按鈕手動切換,**`` Ctrl+` ``** 也行(VSCode 風)
- 跑中但 panel 關著時,按鈕右上有 pulsing dot
