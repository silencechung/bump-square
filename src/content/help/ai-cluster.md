# AI 動作

**🧩 產生意圖結構** — 依框框包含關係 + 每個 comment 組出結構樹,寫回 `workspace.json`。

**✨ 生成 assets prompt** — 依結構樹推敲每節點要哪些視覺素材,寫成 markdown 接在 prompt 後面。

兩顆按鈕背後都是 dev server spawn 一個 `claude --print`,跑 `/bump-layout` skill。底下 terminal panel 看得到即時輸出。同時只跑一個,第二顆會排 queue。
