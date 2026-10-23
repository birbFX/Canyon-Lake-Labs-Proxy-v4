<h1>Canyon Lake Lab's Proxy — Demo v4</h1>

A public web proxy demo by **Canyon Lake Labs**. Enter an address or a search and
browse through the proxy.

v4 is the **most complete public demo** — about 75% of the internal build's
features (everything except the VPN/location system).

## Features

- **Browser** — search bar + proxied iframe
- **Tabs** — closable tabs with an activity rail
- **Start** — quick-launch portal
- **Network** — request inspector (method, status, timing, headers)
- **Console** — run JavaScript inside the active proxied page
- **Playground** — edit HTML/CSS/JS with live preview + **Import/Export**
- **Settings** — home page, Wisp server, request limit, fast mode
- Arcade theme with Clash Display / Clash Grotesk

## Run it

```sh
npm install
npm run dev
```

Then open <http://localhost:3030> (honors `$PORT`).

## Deploy

Set the start command to `npm start` (or `node server.js`). The server serves the
UI and hosts the proxy (Wisp) endpoints itself.

## Notes

- Powered by the open-source [Scramjet](https://github.com/MercuryWorkshop/scramjet)
  proxy engine. All credit for the engine goes to Mercury Workshop.
- Licensed under the AGPL-3.0.

---

## AI note

This is an **AI "vibe-coded" passion project**, built for fun by **Canyon Lake
Labs**. It is made with AI. If you don't like AI, then don't use it.

