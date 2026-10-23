> [!IMPORTANT]
> **This is AI vibe coding.**
> This project is a **passion project by Canyon Lake Labs**, built for fun and made
> almost entirely with AI assistance. It is a hobby project, not a polished
> commercial product. If you dont like AI made software then dont use it.

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
