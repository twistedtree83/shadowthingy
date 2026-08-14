# Design source — imported reference

The Claude Design project this app's visual system was imported from
(G16, issue #21). Source project:
`claude.ai/design/p/81959e78-2bd0-4390-9ef5-454774c0385f`.

- `Gnomon.dc.html` — the design board: tokens, typography, the working view,
  result regions, the value-with-uncertainty component, tier badges, and the
  four degraded states. This is the file the visual decisions live in.
- `locate-map.html` — the Locate-band map study the board embeds, and the
  source of the `--land` / `--coast` tokens and the scrubber styling.
- `support.js`, `image-slot.js` — the Claude Design canvas runtime the board
  needs to render *as a board*. They are viewer scaffolding, not design
  content, and nothing from them ships.

**Nothing in this directory is served by the app.** The system was applied to
`gnomon.html` by hand, with two deliberate deltas forced by the hard
constraints:

1. **No IBM Plex.** The board loads it from Google Fonts; the network gate
   forbids font fetches. The nearest system stacks stand in (`ui-monospace…`,
   `system-ui…`) at the board's sizes, weights, and letter-spacing.
2. **No theme toggle.** The board carries light and dark palettes behind a
   toggle; the no-storage rule means no persisted preference, so the app maps
   both palettes onto `prefers-color-scheme` and lets the OS decide.
