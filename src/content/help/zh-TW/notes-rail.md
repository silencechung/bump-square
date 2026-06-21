# Notes Rail

右側每個 frame 一列:

- **`comment`** — 你寫的意圖(自由文字)
- **`aiNote`** — agent 推斷,唯讀

兩者形成「**雙重確認**」:agent 看的就是你的 comment,你看的是 agent 怎麼理解 — 對不上的話就互相校正。

✏ 改名、⧉ 複製、✕ 刪除。浮動標籤可切換顯示。

## `` ` `` token 標記語法

comment 編輯器是 Tiptap-based,**反引號包起來的字會變成紫色 chip**(原子單位,backspace 在右緣會整個刪掉):

- `` `flex` `` `` `padding-left` `` `` `text-zinc-100` `` — 標 CSS/Tailwind/HTML token
- `` `登入按鈕` `` — 中文 / 任意字元都行(限制只有「不能有空白在裡面」)
- 打開頭 backtick 會跳 autocomplete popup(~250 條 HTML / CSS / Tailwind 字典,prefix 優先 + subsequence fallback),↑↓ 選、Tab/Space commit
- 不在字典內也沒關係 — 自己打第二個 backtick 收尾就會變 chip

**資料層保留純字串**(`` `flex` `` 在 workspace.json 裡就是 `` `flex` `` 字面),agent 用 regex `` /`([^`\s]+)`/g `` 撈出 intent token。chip 只是視覺方便,**值跟修飾語不會被吞**(`` `padding-left`: 40px `` 整句下游都看得到)。
