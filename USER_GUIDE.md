# User Guide: Adding Miku Monday Bot to Your Channels

This guide explains how to add the Miku Monday Bot to your Telegram channels so you can receive weekly Miku GIFs.

## Why Miku Monday?

Miku Monday is a celebration of Hatsune Miku, the world's most famous Vocaloid character! Every Monday, we share a special Miku GIF to brighten your week and connect you with fellow Miku fans around the world.

Our bot brings joy, creativity, and community to your channels with:
- Weekly Miku GIFs to start the week with positivity
- Daily hype messages to build anticipation
- No technical setup required
- Completely free service

## Prerequisites

- A Telegram account
- Access to a Telegram channel where you have admin rights

## Steps to Add the Bot to Your Channel

### 1. Find the Bot

1. Open Telegram
2. Search for the bot by username (@itsmikumondaybot)
3. Click on the bot in the search results

### 2. Start the Bot

1. Click the "Start" button or send `/start` to the bot
2. The bot will send you a welcome message with instructions

### 3. Add the Bot to Your Channel

1. Open your Telegram channel
2. Tap on the channel name at the top to open channel info
3. Tap "Manage Channel" or "Edit"
4. Tap "Administrators"
5. Tap "Add Administrator"
6. Search for the bot's username
7. Select the bot from the search results
8. Grant the necessary permissions:
   - Post messages
   - Edit messages (optional)
9. Tap "Save" or "Done"
10. Send `/start@itsmikumondaybot` to register your channel to the bot

### 4. Confirm Setup

1. The bot should now be added to your channel
2. You can test it by sending `/status` to the bot in a private chat
3. The bot will automatically send a Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC Sunday)
4. You'll also receive daily hype messages at 12:00 AM GMT+8 with a randomised quote and Spotify song recommendation to build anticipation for Miku Monday

## Bot Commands

- `/start` - Welcome message and instructions
- `/help` - Show help information
- `/status` - Show bot status, subscription info, and next scheduled post date
- `/countdown` - Show time remaining until next Miku Monday
- `/today` - Show today's daily hype message with song recommendation on demand
- `/unsubscribe` - Remove this channel from bot subscriptions
- `/feedback` - Send feedback to the developer (@JulianC97)

> **Note:** The bot sends daily hype messages at 12:00 AM GMT+8 with a randomised quote and Spotify song recommendation. Use `/today` to get it any time!

## Managing Your Subscription

### Unsubscribing a Channel

If you want to remove the bot from a channel:
1. Send `/unsubscribe` command in the channel
2. The bot will confirm removal and stop sending messages to that channel
3. To resubscribe later, simply send `/start@itsmikumondaybot` again

> **Note:** You can only unsubscribe channels, not private chats. To remove the bot from a channel completely, you'll need to remove it as an administrator in your channel settings.

## Privacy Protection

The `/listchannels` command is restricted to the bot developer only and returns masked, unidentifiable channel data even to the developer. This ensures privacy protection for channels using the bot and prevents exposure of sensitive channel information. Channel IDs are masked to show only the last 4 digits with the rest replaced by asterisks (e.g., ********1234).

## Persistent Storage

The bot supports persistent storage of subscribed channels across deployments:

1. **Redis Storage** (recommended): If a `REDIS_CONNECTION_STRING` environment variable is provided, chat IDs are stored in Redis with encryption
2. **File Storage** (fallback): If Redis is not available, chat IDs are stored in an encrypted `chat_ids.json` file

For Redis instances that require authentication, set the `REDIS_PASSWORD` environment variable.

With Redis configured, the bot will automatically use Redis for persistent storage, eliminating the need for local file storage. The file-based approach is maintained only as a fallback for environments where Redis is not available.

This ensures that your channel subscriptions are maintained even when the bot is restarted or redeployed.

## Troubleshooting

### If the bot isn't sending GIFs:

1. Check that the bot has the necessary permissions in your channel
2. Make sure the bot hasn't been restricted or banned
3. Verify that the channel is active and not deleted

### If you can't add the bot to your channel:

1. Ensure you have admin rights in the channel
2. Check that the bot is not set to private mode by the owner
3. Make sure you're using the correct bot username

## Privacy and Data

The bot only stores:
- Chat IDs of channels it's added to (needed to send GIFs)
- No personal messages or data are stored
- All data is automatically deleted if the bot is removed from a channel

## Marketing and Community

### Spread the Joy!

Love Miku Monday? Help us spread the word:
- Share your favorite Miku Monday GIFs with friends
- Tell other channel admins about the bot
- Mention @itsmikumondaybot in your social media posts
- Join the global Miku Monday community!

### Community Guidelines

We believe in creating a positive, inclusive space for all Miku fans:
- Keep discussions respectful and friendly
- Share your love for Miku and Vocaloid music
- Be welcoming to newcomers
- Report any inappropriate content to the bot developer

## Support

If you encounter any issues, contact the bot owner @JulianC97 for assistance.