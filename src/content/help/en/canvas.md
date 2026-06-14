# Canvas: Frame + intent

Draw frames on the screenshot, and write one sentence of "**what you want**" per frame — that's the intent the agent reads.

- Default **Hand mode**: pure pan (drag empty space or a frame body, both pan the canvas); frames can only be click-selected
- Switch to **Frame mode** to create / move: drag empty space to draw a new frame, drag a frame body to draw a **nested** one; **`Ctrl + drag frame body`** is the only path to move a frame
- A selected frame shows 8 resize handles (in both modes); `⧉` duplicates it with its children
- Frames z-order by **area** — smaller frames sit on top so you can click into inner ones
- Selecting a frame draws a dashed leader line to its row in the Notes rail on the right

Full tool / shortcut list lives in the toolbar dot at the top-left.
