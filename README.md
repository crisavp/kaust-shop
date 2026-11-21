# Second-hand at KAUST

A one-page shop for selling second-hand items on campus. Buyers browse the items and tap **Reserve on WhatsApp**, which opens a chat with the item ID already in the message. They pay cash or by transfer at pickup.

## How it works

- **Items and settings** come live from the Google Sheet *Shop items* (published to the web). Edits show up on the site within about 5 minutes, with no rebuild.
  - `Items` tab: one row per item. Status is `available`, `reserved` or `sold`.
  - `Settings` tab: shop name, WhatsApp number, pickup and payment text, and the WhatsApp message.
- **Photos** live in `photos/<ID>/` in this repo, resized for phones, and are listed in `photos/manifest.json`.
- The sheet's published link and tab IDs are at the top of `app.js` (`CONFIG`).

## Adding photos

1. In Google Drive, right-click the **Photos** folder → **Download**. Drive gives you a zip (or several, for many photos).
2. Run:
   ```bash
   python3 scripts/sync_photos.py ~/Downloads/Photos-*.zip
   ```
   Add `--prune` to also remove photos of items whose folder was deleted in Drive.
   iPhone HEIC photos need `pip install pillow-heif` once.
3. Commit and push. GitHub Pages republishes in a minute or two.

## Files

| Path | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The website |
| `photos/` | Item photos and `manifest.json` |
| `scripts/sync_photos.py` | Turns the Drive Photos download into `photos/` |
| `template/` | The original sheet template and the script that built it |

## Local preview

```bash
python3 -m http.server 8000
```
Then open http://localhost:8000.
