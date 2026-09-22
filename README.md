<div align="center">

# Miku Monday Bot

**A Telegram bot that posts a Hatsune Miku GIF every Monday and a randomised daily hype message with a Vocaloid song recommendation — zero setup for the channels that add it.**

![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![Telegram](https://img.shields.io/badge/-Telegram-26A5E4?logo=telegram&logoColor=white)
![Zeabur](https://img.shields.io/badge/-Zeabur-6C5CE7)
![License](https://img.shields.io/badge/license-AGPLv3%20%2B%20Commercial-00D4C8.svg)

</div>

---

## What it does

Miku Monday Bot automatically posts a Hatsune Miku GIF at 12:00 AM GMT+8 (4:00 PM UTC Sunday) every Monday to any Telegram channel or group that adds it, plus a daily hype message with a randomised day-specific quote and a song recommendation pulled from a pool of 1,468 Vocaloid tracks. It's designed for non-technical end users — add the bot, register the channel with one command, and it just runs.

## Features

- Automatic Miku GIF post every Monday at 12:00 AM GMT+8
- Daily hype messages at 12:00 AM GMT+8 with randomised day-specific quotes and a song recommendation
- Song pool of 1,468 Vocaloid tracks loaded from `Vocaloid_Combined.csv`
- Works across multiple Telegram channels/groups simultaneously
- Automatic channel registration and unsubscription via bot commands
- Interactive command interface (`/status`, `/countdown`, `/today`, `/feedback`)
- Health monitoring endpoint for uptime checks
- No technical setup required for end users — completely free and open source

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js |
| Bot | node-telegram-bot-api |
| Scheduling | node-cron |
| Web/health server | Express |
| State | Redis, `chat_ids.json` |
| Config | dotenv |
| Hosting | Zeabur |

## Screenshots

_Screenshots coming soon._ The repository includes the bot's signature GIF asset (`its-miku-monday.gif`), posted automatically to subscribed channels every Monday, and a status page under `public/status.html`.

## Quick Start

```bash
git clone https://github.com/TheBooleanJulian/miku-monday.git
cd miku-monday
npm install
cp .env.example .env
# fill in your Telegram bot token and any other required values in .env
npm start
```

## For Users

You can add the bot directly to your Telegram channels or DM it:

1. Search for the bot `@itsmikumondaybot` in Telegram, or visit https://t.me/itsmikumondaybot
2. Click "Start" or send `/start`
3. Add the bot to your Telegram channels as an administrator
4. Send `/start@itsmikumondaybot` to register your channel with the bot

For detailed instructions, see the [User Guide](USER_GUIDE.md). For technical implementation details, see [TECHNICAL.md](TECHNICAL.md).

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Welcome message and instructions |
| `/help` | Show help information |
| `/status` | Bot status, subscription info, and next scheduled post date |
| `/countdown` | Time remaining until next Miku Monday |
| `/today` | Today's daily hype message with song recommendation on demand |
| `/unsubscribe` | Remove this channel from bot subscriptions |
| `/feedback` | Send feedback to the developer (@TheBooleanJulian) |

## Status / Roadmap

- [x] Weekly Miku Monday GIF post, scheduled correctly for GMT+8
- [x] Daily hype messages with randomised quotes and song recommendations
- [x] CSV-backed song pool (1,468 tracks)
- [x] Multi-channel support and automatic registration
- [x] Health monitoring endpoint
- [x] Feedback command for user-developer communication
- [ ] Automated tests for scheduling and command handlers

## Changelog

- **2026-04** — Status webpage refresh, settings and chat-ID persistence updates
- **2026-02** — CSV-backed song pool (1,468 tracks) replacing the hardcoded list; `/today` command added; randomised daily quotes and song-of-the-day recommendations
- **2025-12** — Initial release: Telegram bot posting a weekly Miku Monday GIF, multi-channel registration, and core commands

## License

This project is dual licensed.

- Community Edition — [GNU Affero General Public License v3 (AGPLv3)](LICENSE). Free to use, modify, and self-host. If you distribute a modified version or run it as a network service, you must make the corresponding source available.
- Commercial License — for organisations that want to embed, modify, or distribute this software without AGPLv3's obligations. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

---

<div align="center">
<sub>Built by <a href="https://github.com/TheBooleanJulian">@TheBooleanJulian</a></sub>
</div>
