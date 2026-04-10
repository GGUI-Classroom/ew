# Discord Relay Bot

A Node.js + discord.js bot with:

- slash commands
- a configurable relay channel
- consent-based DM relays
- persistent relay state on disk

## What it does

This bot lets a moderator invite a user into a relay flow. The user receives a DM with accept/decline buttons. If they accept, any new DMs they send to the bot are forwarded into the configured server channel.

This is intentionally opt-in. It does not silently forward private messages.

## Setup

1. Install Node.js 18 or newer.
2. Create a Discord application and bot in the Developer Portal.
3. Turn on the **Message Content Intent** for the bot, or DM message forwarding will not work.
4. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID` for fast command registration during testing
   - `RELAY_CHANNEL_ID` if you want a default relay channel from environment variables
5. Install dependencies.
6. Register slash commands.
7. Start the bot.

## Commands

- `/ping` checks latency.
- `/about` explains the bot.
- `/setrelaychannel` sets the server text channel used for forwarded relays.
- `/relayrequest user:<member> note:<optional>` sends the opt-in DM invitation.
- `/relayend user:<member>` stops an active relay session.

## Development

```bash
npm install
npm run deploy
npm start
```

If you are testing in one server, keep `GUILD_ID` set so slash commands appear immediately. If you want global commands later, remove `GUILD_ID` and run `npm run deploy` again.

## Free deployment options

Best options for an always-on Discord bot:

- Oracle Cloud Always Free: most reliable free option for a persistent bot process.
- Fly.io: good if you already know container-based deployment and the free allowance fits your usage.
- Koyeb: convenient for small Node services when a free instance is available in your region/account.
- Render free tiers: simple to use, but check current free-service behavior before relying on it for 24/7 uptime.
- Replit: easy for prototyping, but not ideal for a production bot because free workspaces may sleep.

If you want the bot to stay online all the time, Oracle Cloud Always Free is the safest choice.

## Render Blueprint

This repo includes a Render Blueprint file at `render.yaml`.

1. Push this project to GitHub.
2. In Render, choose **New** > **Blueprint**.
3. Select your repo.
4. Set required environment variables when prompted:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID` (recommended while testing)
   - `RELAY_CHANNEL_ID` (optional)
5. Deploy.

The blueprint creates a background worker (not a web service), which is what a Discord bot needs.

## discord.js vs discord.py

You only need one library, not both.

- This project is Node.js and already uses `discord.js` in `package.json` and `src/index.js`.
- A Python version would use `discord.py` instead, but that would be a different codebase.
- So yes, this project works with Discord as-is once your bot token and app IDs are set.

## Notes

- Relay state is stored in `data/state.json`.
- If the host filesystem is ephemeral, relay configuration can reset after restarts.
- The bot only forwards DMs after a user explicitly accepts the relay invitation.
