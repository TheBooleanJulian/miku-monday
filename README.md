# Miku Monday Bot

A Telegram bot that automatically posts a Hatsune Miku GIF and random Vocaloid song at 12:00 AM GMT+8 (4:00 PM UTC) everyday to Telegram channels. Designed for easy deployment on cloud platforms like Zeabur, allowing non-technical users to simply add the bot to their channels without any complex setup.

## Features

- Automatically sends a Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC Sunday)
- Sends daily hype messages at 12:00 AM GMT+8 with randomised day-specific quotes and a Spotify song recommendation
- Works with multiple Telegram channels
- No technical setup required for end users
- Completely free and open source
- Interactive command interface for user engagement
- Feedback system for user-developer communication
- Health monitoring endpoints
- Automatic channel registration system
- Channel unsubscription capability

## For Users

You can easily add it to your Telegram channels or have the bot private DM you:

1. Search for the bot @itsmikumondaybot in Telegram, or through https://t.me/itsmikumondaybot
2. Click "Start" or send `/start`
3. Add the bot to your Telegram channels as an administrator
4. Send `/start@itsmikumondaybot` to register your channel to the bot

That's it! The bot will automatically send a Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC Sunday) to your channels.

For detailed instructions, see the [User Guide](USER_GUIDE.md).

## Bot Commands

- `/start` - Welcome message and instructions
- `/help` - Show help information
- `/status` - Show bot status, subscription info, and next scheduled post date
- `/countdown` - Show time remaining until next Miku Monday
- `/today` - Show today's daily hype message with song recommendation on demand
- `/unsubscribe` - Remove this channel from bot subscriptions
- `/feedback` - Send feedback to the developer (@TheBooleanJulian)

## For Developers

For technical implementation details, deployment instructions, and developer features, please refer to the technical documentation.

## License

MIT