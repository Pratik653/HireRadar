# HireRadar Research Companion

An optional Chrome/Edge extension for [HireRadar](https://pratik653.github.io/HireRadar/). It lets you step
through HireRadar's LinkedIn research searches from a small floating window, so you don't have to return to the
HireRadar tab after every search.

- **Previous / Next** move one LinkedIn tab through your prioritized searches (Balanced first). It reuses that
  one tab, so you don't end up with dozens of tabs.
- **Try broader search** follows HireRadar's relaxation ladder (Focused → Balanced → Broad → Discovery) for the
  same role. It skips searches you have already reviewed.
- **What did you find?** You mark each search *Relevant results found*, *No results* or *Results not relevant*.
  The companion then offers a broader or more focused search, and HireRadar picks up your marks when you return
  to it.
- Progress (current search, searches opened, feedback) survives page navigation, browser restarts and closing
  the companion.

HireRadar works fully without the extension. The *Open on LinkedIn* links are unchanged.

## Install (desktop Chrome or Edge 116+)

The companion is not in the Chrome Web Store or Edge Add-ons yet, so installation is manual:

1. Download `hireradar-companion-1.0.0.zip` from the
   [companion release](https://github.com/Pratik653/HireRadar/releases/tag/companion-v1.0.0) and unzip it.
2. Open `chrome://extensions` (Chrome, Brave) or `edge://extensions` (Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped `hireradar-companion-1.0.0` folder (the one containing
   `manifest.json`).
4. Optional: pin *HireRadar Research Companion* in the toolbar's extensions menu.
5. Open HireRadar → **LinkedIn research** → **Enable Research Companion** → **Start companion**.

The extension ID is always `gcboglbpfkdbfdmapiggnplpbeljhonn`, because the manifest's `key` fixes it. HireRadar
uses that ID to find the extension.

## Using the window

| Action | How |
|---|---|
| Move | Drag the window's title bar. Its position is remembered. |
| Resize | Drag any edge or corner. Size is kept between 320 × 420 and 720 × 1000 px, and never larger than the screen. |
| Minimize | The **–** button shrinks it to a small HireRadar bubble that shows your position (e.g. `3/17`). Click the bubble to restore the previous size and position. The OS minimize button works too. |
| Close | The **×** button. Your session, progress and feedback are kept. |
| Reopen | Click the HireRadar icon in the browser toolbar, or **Show companion** in HireRadar. |
| Keep on top | The pin button floats the companion above all windows, including LinkedIn, using the browser's Picture-in-Picture window. Resize it from its edges and close it with its own ×. Shown only where the browser supports it. |
| Keyboard | Tab between controls. **Alt + →** for next and **Alt + ←** for previous, only while the companion has focus. |

If the window ends up off screen (for example after unplugging a monitor), it is moved back onto the visible
screen the next time it opens or changes size.

## Why a separate window, not a bubble inside LinkedIn

LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) (section 8.2) prohibits overlaying or
otherwise modifying LinkedIn's pages or their appearance, including inserting elements. LinkedIn's help page on
[prohibited software and extensions](https://www.linkedin.com/help/linkedin/answer/a1341387) says extensions that
change the site's appearance can lead to account restrictions. So the companion **never injects anything into
LinkedIn**. It is its own window, owned by the browser extension:

- Moving, resizing, minimizing and closing are real window operations, done with the mouse as with any window.
- The *Keep on top* mode gives the floating-bubble experience without touching LinkedIn's page.
- Without *Keep on top*, clicking the LinkedIn window brings that window to the front. Place the companion beside
  it, or use *Keep on top*.

The companion does no scraping, reads no results, never clicks, posts or messages anything, and never runs
searches by itself. Every navigation starts with your click.

## Permissions and privacy

| Permission | Why |
|---|---|
| `storage` | Keeps the research queue, your position, feedback and window size on this device (`chrome.storage.local`). |

That is the only permission. The extension has **no host permissions**: it cannot read or change any website,
including LinkedIn, and it has no access to cookies, passwords or browsing history. It opens or re-points its one
research tab with `chrome.tabs.create` / `chrome.tabs.update`, which need no permission and cannot read the tab.

- **What HireRadar sends:** each search's id, strategy, category, label (role · place), query text and LinkedIn
  search URL, plus your feedback. No resume text, imports, statuses or personal details.
- **Who can send it:** `externally_connectable` admits only `https://pratik653.github.io`. The service worker
  also checks the sender's origin, accepts only four message types, and validates every field. URLs must be
  `https://www.linkedin.com/search/results/content/` with the same keywords as the query; anything else is
  rejected.
- **What leaves your device:** nothing. There is no server, analytics or telemetry. Sessions expire after 30 days.
- **Removing it:** delete the extension from the extensions page; Chrome removes its stored data with it.

## Browser support

| Browser | Status |
|---|---|
| Chrome 116+ (Windows, macOS, Linux, ChromeOS) | Supported |
| Microsoft Edge 116+ | Supported |
| Brave and other Chromium browsers | Should work (same APIs); not tested |
| *Keep on top* | Needs Document Picture-in-Picture (Chrome / Edge 116+ on desktop) |
| Firefox, Safari, mobile browsers | Not supported. Use HireRadar's *Open on LinkedIn* links. |

## Development

```bash
cd extension
node --test "test/*.test.mjs"       # unit tests (validation, relaxation, bounds, permissions)
node scripts/build.mjs --check      # verify the manifest's permission boundary
node scripts/build.mjs              # dist/hireradar-companion-<version>.zip + unpacked folder
node scripts/build.mjs --dev        # also accepts http://localhost:5173, for local development only
```

`src/background.js` is the service worker. `src/companion.*` is the window UI. `src/session.js` holds the pure,
tested logic shared by both, and HireRadar's frontend tests run their sessions through the same validator.
