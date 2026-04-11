# Discord Relay Bot

A Node.js + discord.js bot with:

- slash commands
- a configurable relay channel
- consent-based DM relays
- persistent relay state on disk

## What it does

This bot creates private temporary channels for moderation and support interactions:

- **Relay channels**: When you invite a user with `/relayrequest`, a private channel is created where:
  - Only the user and a specified role (ID: 1492370989399543808) can see the channel
  - Messages flow both ways: user DMs ↔ server channel
  - The channel is deleted when the relay ends
  
- **Ban command**: Use `/ban` to ban users and automatically close their relay channel

This is opt-in and consent-based. Users receive a DM invitation and must accept to start the relay.

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
- `/relayrequest user:<member> note:<optional>` creates a private temporary channel and sends the user a DM invitation.
- `/relayend user:<member>` stops the relay and deletes the channel.
- `/ban user:<member> reason:<optional>` bans a user and closes their relay channel.

## Relay Setup

Relay channels automatically restrict visibility to:
- The specified role (ID: 1492370989399543808)
- The invited user

Edit the `RELAY_ROLE_ID` constant in [src/index.js](src/index.js) if you want a different moderator role.

## Development

```bash
npm install
npm.cmd run deploy
npm.cmd start
```

On Windows, use `npm.cmd` instead of `npm` if you hit PowerShell execution policy blocks.

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

After the service is healthy, run slash command registration once:

- in a local clone: `npm run deploy`
- or in a Render shell for the service: `npm run deploy`

The blueprint uses a web service fallback with a `/health` endpoint, because some Render free plans do not allow background workers.
The bot process still runs in the same service.

Important: free web services may sleep or be restricted depending on current Render plan rules, so uptime is not guaranteed.

If Render still fails, open deploy logs and look for one of these startup messages:

- Startup error: DISCORD_TOKEN is missing
- Discord login failed

Those indicate environment variable or token issues, not code build issues.

## discord.js vs discord.py

You only need one library, not both.

- This project is Node.js and already uses `discord.js` in `package.json` and `src/index.js`.
- A Python version would use `discord.py` instead, but that would be a different codebase.
- So yes, this project works with Discord as-is once your bot token and app IDs are set.

## Notes

- Relay state is stored in `data/state.json`.
- If the host filesystem is ephemeral, relay configuration can reset after restarts.
- The bot only forwards DMs after a user explicitly accepts the relay invitation.
