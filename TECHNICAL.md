# Technical Documentation: Miku Monday Bot

This document contains technical implementation details, deployment instructions, and developer features for the Miku Monday Bot.

## Technical Implementation

### Core Components
- **Telegram Integration**: Uses `node-telegram-bot-api` for Telegram bot functionality
- **Web Framework**: Built with Express.js for webhook handling and health endpoints
- **Scheduling**: Uses `node-cron` for timing the weekly GIF posts and daily hype messages
- **Environment Management**: Uses `dotenv` for configuration management
- **File Handling**: Sends locally stored GIF animations to channels
- **Data Persistence**: Uses Redis for persistent storage with file-based fallback
- **Security**: Implements AES-256-CBC encryption for chat ID storage

### Architecture
- **Webhook-based**: Designed for Zeabur deployment without polling
- **Event Handling**: Processes both private messages and channel posts
- **Chat ID Tracking**: Maintains a set of registered channel IDs
- **Health Monitoring**: Includes health check endpoints
- **Privacy Protection**: Implements encrypted storage for chat IDs and masked output for developer commands
- **Persistent Storage**: Supports both Redis and file-based storage for chat ID persistence
- **Graceful Shutdown**: Handles SIGTERM and SIGINT signals for clean deployment

### Deployment
- **Platform**: Optimized for Zeabur cloud deployment
- **Environment Variables**: Configurable through environment variables
- **Static Assets**: Serves static HTML files for web interface
- **Production Ready**: Clean client-facing distribution without development files
- **Redis Support**: Optional Redis storage for persistent chat ID management across deployments

## Environment Variables

The bot requires the following environment variables:

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token from BotFather
- `DEVELOPER_CHAT_ID` - (Optional) Your Telegram chat ID to receive feedback
- `CHAT_IDS_ENCRYPTION_KEY` - (Optional) Encryption key for chat IDs storage (defaults to a default key for development)
- `REDIS_CONNECTION_STRING` - (Optional) Redis connection URL for persistent storage (e.g., `redis://localhost:6379`)
- `REDIS_PASSWORD` - (Optional) Password for Redis authentication

In production environments (like Zeabur), set these variables in your deployment platform's environment settings rather than using a .env file.

## Developer Features

### Admin Commands
- `/listchannels` - Lists all subscribed channels with masked IDs for privacy protection

### Privacy & Security
- **Encrypted Storage**: Chat IDs are stored in an encrypted file using AES-256-CBC
- **Masked Output**: Even developers only see masked channel IDs (e.g., ********1234)
- **Environment Isolation**: Sensitive keys are managed through environment variables
- **Secure Configuration**: Production keys never committed to the repository

### Graceful Shutdown
The bot implements proper shutdown handlers for SIGTERM and SIGINT signals to ensure clean deployment:
- Stops bot polling
- Disconnects Redis client
- Saves chat IDs to persistent storage
- Times out after 10 seconds to prevent hanging deployments

### Webhook Management
- Clears existing webhooks on startup to prevent 409 conflicts
- Uses proper error handling for webhook operations

## Scheduling Details

### Main Miku Monday Post
- **Schedule**: `0 16 * * 0` (16:00 UTC on Sundays)
- **Time**: 12:00 AM GMT+8 (4:00 PM UTC Sunday)
- **Content**: Sends Miku GIF to all registered channels

### Daily Hype Messages
- **Schedule**: `0 16 * * *` (16:00 UTC daily, which is 00:00 GMT+8)
- **Content**: Each day has 5 randomised quote variants plus a randomly selected Spotify song recommendation from the MIKUEXPO SG playlist (100-track pool)
- **Days**:
  - Sunday: Rest and prepare for Monday (5 variants)
  - Monday: "IT'S MIKU MONDAY!" announcement (5 variants)
  - Tuesday–Saturday: Countdown messages with day-specific flavour (5 variants each)
- **On-demand**: `/today` calls the same `buildDailyHypeMessage()` function used by the cron, producing an identical message at any time

## Data Persistence

### Redis Storage (Primary)
When `REDIS_CONNECTION_STRING` is provided:
- Chat IDs stored in Redis with key `miku_monday:chat_ids`
- Data encrypted before storage
- Supports password authentication with `REDIS_PASSWORD`

### File Storage (Fallback)
When Redis is not available:
- Chat IDs stored in `chat_ids.json` file
- Data encrypted using AES-256-CBC
- Encryption key from `CHAT_IDS_ENCRYPTION_KEY` environment variable

## Error Handling

### Network Issues
- Retry mechanisms for Telegram API calls
- Timeout handling for external requests
- Graceful degradation when services are unavailable

### Data Storage
- Fallback mechanisms between Redis and file storage
- Error recovery for encryption/decryption operations
- Validation of stored data formats

## Testing

### Development Mode
- Special cron schedules for testing
- Enhanced logging for debugging
- Environment-specific behavior

## Monitoring

### Health Endpoints
- `/api/status` - Returns bot status and metrics
- `/api/health` - Returns health check information
- Logging of key events and errors

### Instance Tracking
- Unique instance IDs for debugging multiple deployments
- Periodic status logging
- Chat ID persistence verification