# Pedro Kart

A kart racer that runs in the browser on your Mac, steered with your iPhone as a tilt wheel.
Up to 4 players (split screen) against CPU racers, 3 laps, drifting with mini-turbos, boost pads,
items (mushroom, banana, green shell, blue shell, Bullet Bill), and several tracks.

## Run

```sh
npm install
npm start
```

1. On the Mac, open **http://localhost:8080/host** (fullscreen with ⌃⌘F). It gets a room code.
2. On the iPhone (same Wi-Fi), scan the QR code. Safari will warn about the self-signed
   certificate: tap **Show Details → visit this website**. iOS only allows the motion sensors on HTTPS.
3. Tap **Join**, allow motion access, and hold the phone sideways like a steering wheel.
4. Press **ITEM** on a phone (or Enter on the Mac) to start.

Reloading the game tab keeps the same room, and connected phones stay in.

## Controls

| Phone | Keyboard | |
|---|---|---|
| Tilt like a wheel | ← → | Steer |
| GAS | ↑ | Accelerate |
| BRAKE | ↓ | Brake / reverse |
| DRIFT (hold while turning) | Space | Drift. Sparks go blue → orange; let go for a boost |
| ITEM | Shift | 🍄 boost · 🍌 drop behind · 🐢 green shell · 🔵 blue shell (hunts 1st place) · 🚀 Bullet Bill (autopilot) |

Hold GAS just after the "2" in the countdown for a rocket start. In the lobby, DRIFT on a phone (or ◀ ▶ on the
keyboard) switches tracks.

Phone extras: **⟲ Center** re-levels the wheel, **Mode** switches to touch steering with
auto-gas, **⇄** inverts the tilt direction.

If the HTTPS page won't connect, the touch-only fallback at `http://<mac-ip>:8080/c` works without the certificate.

## Layout

- `server.js`: static server (HTTP + self-signed HTTPS), WebSocket relay, race recorder, `/maps.json`
- `public/main.js`: game loop, kart physics, CPU AI, items, split screen, HUD, data recording
- `public/world.js`: level builder (sky, terrain, road, walls, scenery) driven by a map's theme
- `public/kart.js`, `public/fx.js`, `public/icons.js`: kart/driver models, particles, HUD item art
- `public/maps/*.js`: one file per track (see below)
- `public/controller.html`: the phone controller

## Making tracks

A track is one file in `public/maps/`: a closed loop of `ctrl` points, item box rows, boost pads, a `theme`
(overrides of `DEFAULT_THEME` in `world.js`) and optional `terrain` / `decorate` hooks. New files show up in
the lobby automatically.

```sh
node tools/check-map.mjs public/maps/mytrack.js          # geometry checks (corner radius, overlaps, start straight…)
node tools/shoot.mjs --map mytrack --top --lobby --at 3,10,20   # screenshots of a bot racing it → shots/mytrack/
```

## How phones connect

Each game screen ("host") gets a 4-letter room from the server; phones join it at `/j/<CODE>`. Every phone
keeps a WebSocket to the server (the *relay*), which forwards its messages to the room's host. Over that
relay the phone and host also set up a **WebRTC data channel**; when it connects (usually: same Wi-Fi)
input goes straight from phone to game screen without touching the server, sent unordered and without
retries so a lost packet never delays newer input. If it can't connect (guest/hotel Wi-Fi that isolates
devices, or different networks), input stays on the relay automatically. The phone and the lobby show
which path each player is on (⚡ direct / ☁︎ relay) and the round-trip time.

## Hosting it on the web

`PUBLIC_URL` switches the server to hosted mode: one HTTP listener on `$PORT` behind the platform's HTTPS,
join links/QR codes use your domain, no self-signed certificate, and recording is off unless `RECORD=1`
(then only players who tick the opt-in on their phone are recorded).

```sh
PUBLIC_URL=https://your.domain PORT=8080 npm start
```

Fly.io (config in `fly.toml`, image in `Dockerfile`):

```sh
brew install flyctl && fly auth login
fly launch --no-deploy --copy-config   # pick an app name; set PUBLIC_URL in fly.toml to match
fly deploy
fly scale count 1                      # rooms live in memory: exactly one machine
```

Then anyone opens your URL, clicks **Host** on a laptop/TV, and phones scan the QR (or type the code at
your URL). Rooms live in the server's memory, so run a single instance until there's room-aware routing.

## Data collection (behavioral cloning)

Every race is recorded to `data/races/<timestamp>.jsonl.gz` (a red **● REC** badge shows while
recording). Turn it off with `RECORD=0 npm start`. Only players who tick "share my driving" on their
phone are recorded (checked by default locally, unchecked when hosted); others appear only as positions.

Each file is gzipped JSON lines:

- **meta**: roster (which kart is which player / pid / device), `obs_names`, `state_names`,
  `action_names`, track definition, physics constants, `sim_hz` (60)
- **tick** (one per 60 Hz simulation step, countdown included):
  - `state[i]`: raw state of every kart (see `state_names`)
  - `obs[i]`: 90-dim kart-relative observation, only for karts a human is driving that tick
  - `act[i]`: `[steer, gas, brake, drift, item]` for every kart (humans and CPUs)
  - `src`: who controlled each kart (`h` human, `c` CPU/autopilot, `n` disconnected)
  - `bananas`, `shells`, `boxes`: hazards and item box state
- **end** (results and finish times) or **abort** (game tab closed mid-race)

`observe()` in `public/main.js` defines the observation. It's the same function a trained policy
will be fed in-game, so train/deploy features always match. If you change it, bump `OBS_VERSION`.

Build a training set:

```sh
uv run ml/load_races.py                 # → data/bc_dataset.npz (obs, act, episode, ...)
uv run ml/load_races.py --min-finish    # only drivers who finished
```
