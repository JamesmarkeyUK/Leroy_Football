# ⚽ Leroy Football

A fun little **swipe-to-shoot penalty shootout** PWA. Pick a striker, bend it past
the keeper, and build a streak for bonus points. Installable and fully playable
offline.

**▶ Play:** [www.unisim.co.uk/leroy](https://www.unisim.co.uk/leroy)

## How to play

1. Tap **PLAY** and pick your striker.
2. **Swipe up from the ball** to shoot — swipe direction aims it, swipe length
   sets power, and a sideways swipe **bends** the ball around the keeper.
3. You get **3 misses**. Score 3+ in a row to go **ON FIRE 🔥** for bonus points.
4. Every goal charges the **Red Bull boost**. When the can lights up, tap it to
   arm a **winged power shot** 🪽 — extra pace and bend to beat the keeper.

Leroy is the gaffer — that's his actual mug on the pitch. **Red Bull** sponsors
the match (pitchside boards + shirt).

## The teams

| Team | Players | |
|------|---------|---|
| **Boys** | Leroy, Charlie, Jack, Frankie | solid |
| **Girls ★** | Christie, Elsie | *better — faster shots, more bend, harder to save* |

Each player has their own **power / curve / control** ratings that change how the
shot behaves.

## Tech

Pure vanilla — no framework, no build step.

- `index.html` — shell, HUD, overlays, styles
- `game.js` — canvas game engine (physics, input, WebAudio SFX)
- `manifest.webmanifest` + `sw.js` — PWA install + offline cache
- `make-icons.js` — dependency-free PNG icon generator (`node make-icons.js`)

## Run locally

```bash
cd Leroy_Football
python3 -m http.server 8000
# then open http://localhost:8000
```

Use `http://localhost` (not `file://`) so the service worker can register.
