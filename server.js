// Web server for handling Telegram webhooks

// Load required modules
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Redis support
const redis = require('redis');

// Bot configuration
const token = process.env.TELEGRAM_BOT_TOKEN;
const developerChatId = process.env.DEVELOPER_CHAT_ID; // Optional: for receiving feedback
if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

// Unique instance ID for debugging multiple instances
const INSTANCE_ID = crypto.randomBytes(4).toString('hex');
console.log(`Starting Miku Monday Bot instance: ${INSTANCE_ID}`);

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Create a bot instance with additional options for better reliability
const bot = new TelegramBot(token, {
  polling: true,
  retryTimeout: 10000, // 10 seconds retry timeout
  restartDelay: 5000, // 5 seconds delay before restart
  request: {
    proxy: process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
    timeout: 60000, // 60 seconds timeout
  }
});

console.log('Bot instance created with polling enabled');

// Redis client
let redisClient = null;
const REDIS_URL = process.env.REDIS_CONNECTION_STRING || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const CHAT_IDS_KEY = 'miku_monday:chat_ids';

// Initialize Redis client
async function initRedis() {
  try {
    if (process.env.REDIS_CONNECTION_STRING) {
      console.log('Initializing Redis client...');
      
      // Build Redis configuration with optional password
      const redisConfig = {
        url: REDIS_URL
      };
      
      // Add password if provided
      if (REDIS_PASSWORD) {
        redisConfig.password = REDIS_PASSWORD;
        console.log('Redis password authentication enabled');
      }
      
      redisClient = redis.createClient(redisConfig);
      
      redisClient.on('error', (err) => {
        console.error(`Redis Client Error (Instance: ${INSTANCE_ID}):`, err);
      });
      
      redisClient.on('connect', () => {
        console.log('Redis client connected successfully');
      });
      
      redisClient.on('ready', () => {
        console.log('Redis client ready for operations');
      });
      
      await redisClient.connect();
      console.log(`✅ Connected to Redis at ${REDIS_URL}${REDIS_PASSWORD ? ' with authentication' : ''}`);
    } else {
      console.log('No REDIS_CONNECTION_STRING provided, using file-based storage');
    }
  } catch (error) {
    console.error(`❌ Failed to connect to Redis (Instance: ${INSTANCE_ID}):`, error);
    redisClient = null;
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, stopping bot...');
  try {
    // Increase timeout for shutdown operations
    const shutdownTimeout = setTimeout(() => {
      console.log('Shutdown timeout reached, forcing exit...');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    if (bot) {
      console.log('Stopping bot polling...');
      await bot.stopPolling();
      console.log('Bot polling stopped');
    }
    
    if (redisClient) {
      console.log('Disconnecting Redis client...');
      await redisClient.quit();
      console.log('Redis client disconnected');
    }
    
    // Clear the timeout since we completed successfully
    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown completed');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, stopping bot...');
  try {
    // Increase timeout for shutdown operations
    const shutdownTimeout = setTimeout(() => {
      console.log('Shutdown timeout reached, forcing exit...');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    if (bot) {
      console.log('Stopping bot polling...');
      await bot.stopPolling();
      console.log('Bot polling stopped');
    }
    
    if (redisClient) {
      console.log('Disconnecting Redis client...');
      await redisClient.quit();
      console.log('Redis client disconnected');
    }
    
    // Clear the timeout since we completed successfully
    clearTimeout(shutdownTimeout);
    console.log('Graceful shutdown completed');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

// Additional cleanup on exit
process.on('exit', () => {
  console.log('Process exiting, final cleanup...');
});

// Log polling status periodically
setInterval(async () => {
  console.log(`🔍 Bot polling status check (Instance: ${INSTANCE_ID})...`);
  
  // Periodically save chat IDs to ensure persistence
  await saveChatIds();
  
  // Check Redis health if available
  if (redisClient && redisClient.isOpen) {
    try {
      const pingResult = await redisClient.ping();
      console.log(`✅ Redis health check passed (Ping: ${pingResult})`);
    } catch (error) {
      console.error(`❌ Redis health check failed:`, error.message);
    }
  }
}, 30000); // Every 30 seconds

// Store chat IDs to send GIFs to
let chatIds = new Set();

// File to persist chat IDs (fallback when Redis is not available)
const CHAT_IDS_FILE = 'chat_ids.json';

// Encryption key (in production, this should come from environment variables)
const ENCRYPTION_KEY = process.env.CHAT_IDS_ENCRYPTION_KEY || 'default-key-change-in-production';
const IV_LENGTH = 16; // For AES, this is always 16
const ALGORITHM = 'aes-256-cbc';

// Encrypt data
function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt data
function decrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Load chat IDs from Redis or file
async function loadChatIds() {
  try {
    // Try Redis first if available
    if (redisClient) {
      try {
        console.log('Attempting to load chat IDs from Redis...');
        const encryptedData = await redisClient.get(CHAT_IDS_KEY);
        if (encryptedData) {
          console.log('Found chat IDs in Redis, decrypting...');
          const decryptedData = decrypt(encryptedData);
          const ids = JSON.parse(decryptedData);
          chatIds = new Set(ids);
          console.log(`✅ Loaded ${chatIds.size} chat IDs from Redis successfully`);
          return;
        } else {
          console.log('No existing chat IDs found in Redis, starting with empty set');
        }
      } catch (redisError) {
        console.error('❌ Error loading chat IDs from Redis:', redisError);
      }
    }
    
    // Fallback to file-based storage
    if (fs.existsSync(CHAT_IDS_FILE)) {
      console.log('Loading chat IDs from encrypted file...');
      const encryptedData = fs.readFileSync(CHAT_IDS_FILE, 'utf8');
      const decryptedData = decrypt(encryptedData);
      const ids = JSON.parse(decryptedData);
      chatIds = new Set(ids);
      console.log(`✅ Loaded ${chatIds.size} chat IDs from encrypted file`);
    } else {
      console.log('No existing chat IDs file found, starting with empty set');
      // Create an empty chat IDs file
      await saveChatIds();
    }
  } catch (error) {
    console.error('Error loading chat IDs from encrypted file:', error);
    chatIds = new Set(); // Reset to empty set on error
    // Try to create a new empty file
    try {
      await saveChatIds();
    } catch (saveError) {
      console.error('Error creating initial chat IDs file:', saveError);
    }
  }
}

// Save chat IDs to Redis or file
async function saveChatIds() {
  try {
    const idsArray = Array.from(chatIds);
    const jsonData = JSON.stringify(idsArray, null, 2);
    const encryptedData = encrypt(jsonData);
    
    console.log(`Saving ${chatIds.size} chat IDs...`);
    
    // Try Redis first if available
    if (redisClient) {
      try {
        console.log('Saving chat IDs to Redis...');
        await redisClient.set(CHAT_IDS_KEY, encryptedData);
        console.log(`✅ Saved ${chatIds.size} chat IDs to Redis successfully`);
        return;
      } catch (redisError) {
        console.error('❌ Error saving chat IDs to Redis:', redisError);
      }
    }
    
    // Fallback to file-based storage
    console.log('Saving chat IDs to encrypted file...');
    fs.writeFileSync(CHAT_IDS_FILE, encryptedData);
    console.log(`✅ Saved ${chatIds.size} chat IDs to encrypted file successfully`);
  } catch (error) {
    console.error('❌ Error saving chat IDs to encrypted file:', error);
  }
}

// Load chat IDs on startup
initRedis().then(async () => {
  // Clear webhook to prevent 409 conflicts
  try {
    console.log('Attempting to clear webhook...');
    await bot.deleteWebHook();
    console.log('Webhook cleared, starting polling...');
  } catch (err) {
    console.error('Error clearing webhook:', err);
  }
  
  await loadChatIds();
});

// Path to the Miku GIF
const mikuGifPath = process.env.MIKU_GIF_PATH || './its-miku-monday.gif';

// Song pool for daily recommendations (from MIKUEXPO SG playlist)
const SONG_POOL = [
  { title: 'Sakura Biyori and Time Machine with Hatsune Miku', artist: 'Ado, Hatsune Miku', url: 'https://open.spotify.com/track/4purp1WOheBTHul8oiltQQ' },
  { title: 'ワールドイズマイン (マジカルミライ 2021 Live)', artist: 'ryo (supercell), Hatsune Miku', url: 'https://open.spotify.com/track/29rRca4BXxuUCNmcCzHvtl' },
  { title: 'BRAIN', artist: 'Kanaria', url: 'https://open.spotify.com/track/1JPXGllBrloh5PnNa8D62g' },
  { title: 'ダイダイダイダイダイキライ', artist: 'Amala', url: 'https://open.spotify.com/track/1gFVXBVuYlDUIEdwOrN5T8' },
  { title: 'テレパシ', artist: 'DECO*27', url: 'https://open.spotify.com/track/76kJA3LUe1uREGjlaOypkL' },
  { title: 'QUEEN', artist: 'Kanaria', url: 'https://open.spotify.com/track/32zpHDchUY83w80C8mMtOs' },
  { title: 'DARLING DANCE', artist: 'Kairikibear', url: 'https://open.spotify.com/track/32cvZTXsJi4EzkvVDMH4Ij' },
  { title: 'M@GICAL CURE! LOVE SHOT!', artist: 'SAWTOWNE, Hatsune Miku', url: 'https://open.spotify.com/track/63yoRZd5zl6Ah30hfDm97k' },
  { title: 'Liar Dancer', artist: 'マサラダ', url: 'https://open.spotify.com/track/1YXuCccqCx4AM1PVekISj8' },
  { title: 'Override', artist: 'Yoshida Yasei', url: 'https://open.spotify.com/track/4FXu6nhlIgbpgxt61ntlnR' },
  { title: 'ENVY BABY', artist: 'Kanaria', url: 'https://open.spotify.com/track/7rPKtXBW35rSQH1i6QAvyk' },
  { title: 'D/N/A', artist: 'Azari', url: 'https://open.spotify.com/track/2O5czKVeBaDgqLXJBglDDS' },
  { title: 'ヒバナ -Reloaded-', artist: 'DECO*27', url: 'https://open.spotify.com/track/2Rn8WVUI9l4SkzjbfISX7p' },
  { title: 'Shojo Rei', artist: 'Mikito P', url: 'https://open.spotify.com/track/7gEH5vQK5u2vAUpEUF5IJM' },
  { title: 'ベノム', artist: 'Kairikibear', url: 'https://open.spotify.com/track/54CNsOo0aB99blVSQZxQpD' },
  { title: 'エゴロック - long ver.', artist: 'ETHREEE', url: 'https://open.spotify.com/track/2FRMwFXODegegRrfLAeVwx' },
  { title: 'Alien Alien', artist: 'Nayutalien', url: 'https://open.spotify.com/track/3va7Q99A1EJk8eAZ2DV74v' },
  { title: 'BAKENOHANA', artist: 'NAKISO', url: 'https://open.spotify.com/track/3Nyt0xoTlordHqvBR1EvzG' },
  { title: 'BUG', artist: 'Kairikibear', url: 'https://open.spotify.com/track/1fqfev7K0mfX7e1W64pDvA' },
  { title: 'Heat Abnormal', artist: 'Iyowa', url: 'https://open.spotify.com/track/4sZzZNIstrMGQEnKnUFFJD' },
  { title: 'デビルじゃないもん', artist: 'DECO*27, PinocchioP', url: 'https://open.spotify.com/track/294o7PTrqj9VySUIHaJmXw' },
  { title: '劣等上等 feat. 鏡音リン・レン', artist: 'Giga, 鏡音リン・レン', url: 'https://open.spotify.com/track/367IrkRR4wk5WtSL41rONn' },
  { title: 'Ghost Rule', artist: 'DECO*27', url: 'https://open.spotify.com/track/1OAp6qN5KmoGUQ2edICKsC' },
  { title: 'アイデンティティ', artist: 'Kanaria', url: 'https://open.spotify.com/track/4X3L6G6KDs0jBKvfTkmKmi' },
  { title: 'チェリーポップ', artist: 'DECO*27', url: 'https://open.spotify.com/track/6yID3RbYKiwn2p2LPz0OkK' },
  { title: "Rollin' Girls", artist: 'wowaka', url: 'https://open.spotify.com/track/2qEdhXi9KANaoPji89PsNP' },
  { title: 'ロミオとシンデレラ', artist: 'doriko', url: 'https://open.spotify.com/track/0kiDN35Ern4Mi3rqv3dP6D' },
  { title: 'リレイアウター', artist: 'INABAKUMORI', url: 'https://open.spotify.com/track/1hc0G2VMFmkqI0JnW5Zbjh' },
  { title: 'Non-breath oblige', artist: 'PinocchioP', url: 'https://open.spotify.com/track/0LsKplOVgboKBm5MpJsX0H' },
  { title: 'マトリョシカ', artist: 'hachi', url: 'https://open.spotify.com/track/74A5fPLR86U9XWYostkXwS' },
  { title: 'ビターチョコデコレーション', artist: 'syudou', url: 'https://open.spotify.com/track/6JFD96zWsIdGPqLOTVE1uU' },
  { title: 'Cute Na Kanojo', artist: 'syudou', url: 'https://open.spotify.com/track/6eKutUNTqGrL0XfULcnczp' },
  { title: 'KING', artist: 'Kanaria', url: 'https://open.spotify.com/track/5vCNAauCaecW0tT2mZDLG9' },
  { title: 'キャットラビング', artist: '香椎モイミ', url: 'https://open.spotify.com/track/2EjDBwyMAALFfKaaSUCRkz' },
  { title: 'Tell Your World', artist: 'livetune, Hatsune Miku', url: 'https://open.spotify.com/track/3FY8S1VGJEPw16ejMPILzY' },
  { title: 'ロキ', artist: 'Mikito P', url: 'https://open.spotify.com/track/5WCK18MbTKuOcmLsOXMaHd' },
  { title: '右肩の蝶', artist: 'noripy', url: 'https://open.spotify.com/track/53iR93x3jFWRDKfFRKEqEr' },
  { title: '乙女解剖', artist: 'DECO*27', url: 'https://open.spotify.com/track/3n7wJstsHWn6Yl4oKNMPfq' },
  { title: 'ドーナツホール', artist: 'hachi', url: 'https://open.spotify.com/track/6kwLcF9pDovUbmGOtHo4Ml' },
  { title: 'マーシャル・マキシマイザー', artist: '柊マグネタイト, Kafu', url: 'https://open.spotify.com/track/38XY1ShCSiYwDaV51sFPT9' },
  { title: 'プレイ', artist: 'Giga', url: 'https://open.spotify.com/track/4dSanhvaTVCDyVbnl6Uw8T' },
  { title: 'manimani', artist: 'r-906', url: 'https://open.spotify.com/track/7ntAoXzFfyVDYarUnAzhdO' },
  { title: '天使の翼。', artist: 'A4。', url: 'https://open.spotify.com/track/1Cd71qm2ohDGj0TesT0m6I' },
  { title: '宇宙散歩', artist: 'DECO*27', url: 'https://open.spotify.com/track/3I3A9V9uWlop9PYPM8LrlB' },
  { title: 'Hadal Abyss Zone', artist: 'INABAKUMORI', url: 'https://open.spotify.com/track/0ne8m5zyxvWaD5Hv0Q5MVC' },
  { title: 'モニタリング (Best Friend Remix)', artist: 'DECO*27', url: 'https://open.spotify.com/track/5an1RVI4IDE9xP7iBRVssg' },
  { title: 'シンクタンク', artist: 'INABAKUMORI, RIME', url: 'https://open.spotify.com/track/7u4D80x7YHLSOOFPRopioI' },
  { title: 'Beyond the way', artist: 'Giga', url: 'https://open.spotify.com/track/26I5UfjfxqsUAB2Ryr4utP' },
  { title: 'CH4NGE feat. KAFU', artist: 'Giga, Kafu', url: 'https://open.spotify.com/track/3ipGZWQ7Q64OA7SwFNVfy2' },
  { title: 'HERO', artist: 'Ayase, Hatsune Miku', url: 'https://open.spotify.com/track/4oJVybTP5RihSfOn5sxf3W' },
  { title: 'ボルテッカー', artist: 'DECO*27', url: 'https://open.spotify.com/track/4ESSvbIBRw2Mo6lyQPfhGr' },
  { title: '花に風', artist: 'balloon', url: 'https://open.spotify.com/track/3SOSqAmO4m7rzC2zbnqwU6' },
  { title: 'Magnet', artist: 'Koizumi Shinoko, Miss Rabbits', url: 'https://open.spotify.com/track/5RQmv48apWI1EcDlh4ZqlM' },
  { title: '耳のあるロボットの唄 / 吉原ラメント / おちゃめ機能', artist: 'Tokyo Philharmonic Orchestra, Teto Kasane', url: 'https://open.spotify.com/track/0GPSprVrkINlB24Qceub77' },
  { title: 'Why Do I', artist: 'Set It Off, Hatsune Miku', url: 'https://open.spotify.com/track/5FH2ZZZDxuaDV4IoVlmjzX' },
  { title: 'Catch the Wave', artist: 'livetune, Hatsune Miku', url: 'https://open.spotify.com/track/1WCjYD3Tjy3NTKbMJi4yfM' },
  { title: '熱風', artist: 'Hatsune Miku, 星乃一歌, 花里みのり, 小豆沢こはね, 天馬司, 宵崎奏', url: 'https://open.spotify.com/track/5UHKLcWz2k0NU9OHMsToMi' },
  { title: '砂の惑星', artist: 'hachi', url: 'https://open.spotify.com/track/2RBQ84niVRC6bBdhe7lc9F' },
  { title: 'Jack Pot Sad Girl', artist: 'syudou', url: 'https://open.spotify.com/track/7LtUhPG1p6BuPtcow242En' },
  { title: 'えれくとりっく・えんじぇぅ', artist: 'ヤスオ', url: 'https://open.spotify.com/track/2NuZgqzYhbvoP2IHpt1W7D' },
  { title: 'Machine Love', artist: 'Jamie Paige', url: 'https://open.spotify.com/track/1H2pPtoPS8kNlqCN7HfT6g' },
  { title: 'Dizzy Paranoia Girl', artist: 'EVocaloKAT', url: 'https://open.spotify.com/track/2xtFF3XDNWzyaE722SvAWq' },
  { title: 'Shinkaisyouzyo -deep sea girl-', artist: 'Yuuyu, Hatsune Miku', url: 'https://open.spotify.com/track/3lVvyDll0zmUqtMncLuCKP' },
  { title: 'G.L.I.T.C.H.', artist: 'Yuta Imai, Teto Kasane', url: 'https://open.spotify.com/track/4UebcAakOAkttze3IwQBRO' },
  { title: 'モア！ジャンプ！モア！', artist: 'MORE MORE JUMP!', url: 'https://open.spotify.com/track/2l44rj2fDZDv6sTgyYMPxL' },
  { title: 'JOUOU', artist: 'Hachioji P', url: 'https://open.spotify.com/track/2WP4ioEpsNrHAeI3JkByHE' },
  { title: '歌姫X', artist: '宮守文学, Hatsune Miku', url: 'https://open.spotify.com/track/343YrHQJvdmZTi8Ii9m3TA' },
  { title: '光線歌', artist: 'Guiano', url: 'https://open.spotify.com/track/0VQMy7eYKAPQcoOpoOZwga' },
  { title: 'Tetoris', artist: '柊マグネタイト', url: 'https://open.spotify.com/track/1p4EbJLS0jdWX3tOHdru8S' },
  { title: 'Anti You', artist: 'Chinozo', url: 'https://open.spotify.com/track/7JNI5KkzH0kmSsPFEnggMf' },
  { title: 'バグ', artist: '25時、ナイトコードで。', url: 'https://open.spotify.com/track/3Lu59KjuBy96vEaMBgGPud' },
  { title: 'アイディスマイル', artist: '25時、ナイトコードで。', url: 'https://open.spotify.com/track/6D83eyksFpi3mIIs3KMWrS' },
  { title: 'ハローセカイ', artist: 'DECO*27', url: 'https://open.spotify.com/track/2SLuTdPR3ptm4V4byF8Iry' },
  { title: 'Hand in Hand', artist: 'livetune, Hatsune Miku', url: 'https://open.spotify.com/track/7kgTu64wW8N6s4GTk0ksNO' },
  { title: 'Intergalactic Bound', artist: 'Yunosuke, CircusP, Hatsune Miku', url: 'https://open.spotify.com/track/25tNraNmMNwSEccFVcXxnu' },
  { title: 'Millennia', artist: 'EMIRI', url: 'https://open.spotify.com/track/3h8I68Sgmgfx1D6OuT7RPz' },
  { title: 'Medicine', artist: 'Sasuke Haraguchi', url: 'https://open.spotify.com/track/2CYuM18L6hjDyAYT7Xz25h' },
  { title: '気まぐれメルシィ', artist: 'Hachioji P, Hatsune Miku', url: 'https://open.spotify.com/track/2nvR3T8wXynnDS7N6d81qv' },
  { title: 'Echo', artist: 'ECrusher-P', url: 'https://open.spotify.com/track/3MUqQ9UOLOJmM3dhYd986M' },
  { title: 'テオ', artist: 'Leo/need', url: 'https://open.spotify.com/track/579x3N3nGDTEwpSmvwix0F' },
  { title: 'Happy Halloween', artist: 'Junky, Kagamine Rin', url: 'https://open.spotify.com/track/3slgBP4KlhdO2XOiRnn0R1' },
  { title: 'カトラリー', artist: '25時、ナイトコードで。', url: 'https://open.spotify.com/track/0AwJspaHoAf5Sq7HNJSdIC' },
  { title: 'No branding', artist: 'Chinozo', url: 'https://open.spotify.com/track/7sy0DxNzz5vY4hdKDkon9i' },
  { title: "Don't say Goodbye", artist: 'MIMI, Kafu', url: 'https://open.spotify.com/track/4HQYO8doWO3CrqzjPEaSXV' },
  { title: 'ふわり', artist: 'Loveit Core, MIMI, Kafu, Hatsune Miku', url: 'https://open.spotify.com/track/4pGIS6fI11UDcfUd0Nqc6i' },
  { title: "It's okay now", artist: 'MIMI, Kafu', url: 'https://open.spotify.com/track/4VWObwvpVF1llXpLxwUEkb' },
  { title: 'SECRET', artist: 'MIMI, Kafu', url: 'https://open.spotify.com/track/7dUKNjRiLxS2OXRldCIjH4' },
  { title: 'サラマンダー', artist: 'DECO*27', url: 'https://open.spotify.com/track/64LMCa7fkdfHYLtCm0kGTR' },
  { title: 'Yoidoreshirazu', artist: 'Kanaria', url: 'https://open.spotify.com/track/26zbAdTJC4vqqpGwSzvh8Q' },
  { title: '限りなく灰色へ', artist: '25時、ナイトコードで。', url: 'https://open.spotify.com/track/2kvYOzDQ8BZ9t0w3XU2Qpi' },
  { title: 'ラグトレイン', artist: 'INABAKUMORI', url: 'https://open.spotify.com/track/6v8fX5yXd15H3xSyvVvJ5e' },
  { title: 'live', artist: 'Atsu Mizuno, Kafu', url: 'https://open.spotify.com/track/41ZD1iqyS4tMNDem6tBY9Z' },
  { title: 'Rokuchonen to ichiya monogatari', artist: 'kemu, IA', url: 'https://open.spotify.com/track/6F1dWmY6wDqLTXb3Omt1Oz' },
  { title: 'Parasite', artist: 'DECO*27', url: 'https://open.spotify.com/track/4re8kXgENW5wqmW2AazeIZ' },
  { title: 'Until you hug yourself', artist: 'MIMI, Kafu', url: 'https://open.spotify.com/track/6hLrCv5MCXEpG4iIgWiZLU' },
  { title: 'フォニイ', artist: 'ツミキ, Kafu', url: 'https://open.spotify.com/track/5pBIavXhjzTi0u7pkOK71N' },
  { title: 'Kuninaru', artist: 'MIMI, Kafu', url: 'https://open.spotify.com/track/3GDrQUjCYUnBL26fG5BGkA' },
  { title: 'Decadence', artist: 'sasakure.UK', url: 'https://open.spotify.com/track/65tPQdbKnbib1qSVtfogF6' },
  { title: 'Ready Steady', artist: 'Vivid BAD SQUAD', url: 'https://open.spotify.com/track/3gkNuMdF4BgdEQRr0UuOfl' },
  { title: '天樂', artist: 'Yuuyu', url: 'https://open.spotify.com/track/79HcrcBQ6s2gDpetLznvAt' },
];

// Helper function to get next Monday date
function getNextMonday() {
  const now = new Date();
  const nextMonday = new Date();
  nextMonday.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

// Serve static files
app.use(express.static('public'));

// Shared command handler function
async function handleCommand(chatId, messageText, isChannel = false) {
  console.log('=== HANDLING COMMAND ===');
  console.log(`Handling command: chatId=${chatId}, messageText=${messageText}, isChannel=${isChannel}`);
  console.log(`Message text type: ${typeof messageText}`);
  console.log(`Message text value: "${messageText}"`);
  
  // Add chat ID to our set
  const sizeBefore = chatIds.size;
  chatIds.add(chatId);
  
  // Save chat IDs if we added a new one
  if (chatIds.size > sizeBefore) {
    console.log(`🆕 New chat ID registered: ${chatId} (Total: ${chatIds.size})`);
    await saveChatIds();
    console.log(`💾 Chat ID ${chatId} saved successfully`);
  } else {
    console.log(`🔄 Existing chat ID detected: ${chatId} (Total: ${chatIds.size})`);
  }
  
  // Normalize message text by trimming whitespace
  const normalizedText = messageText ? messageText.trim() : '';
  console.log(`Normalized text: "${normalizedText}"`);
  
  if (normalizedText === '/start' || (isChannel && normalizedText && normalizedText.startsWith('/start'))) {
    const welcomeMessage = `👋 Hello! I'm the Miku Monday Bot!

I'll send a Hatsune Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC).

Type /help to see all available commands.`;
    if (isChannel) {
      // Send a confirmation message to the channel
      bot.sendMessage(chatId, `✅ Miku Monday Bot registered!

I'll send a Hatsune Miku GIF every Monday at 12:00 AM.

Channels subscribed: ${chatIds.size}`).catch((error) => {
        console.error(`Failed to send message to channel ${chatId}:`, error.message);
      });
    } else {
      bot.sendMessage(chatId, welcomeMessage).catch((error) => {
        console.error(`Failed to send message to chat ${chatId}:`, error.message);
      });
    }
  } else if (normalizedText === '/help' || (isChannel && normalizedText === '/help')) {
    const nextMonday = getNextMonday();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = nextMonday.toLocaleDateString('en-US', options);
    
    if (isChannel) {
      bot.sendMessage(chatId, `🤖 Miku Monday Bot Help 🤖

I automatically send a Hatsune Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC) to all channels I'm added to.
I also send daily hype messages at 12:00 AM GMT+8 to build anticipation for Miku Monday!

Available Commands:
/start - Register this channel/chat with the bot
/help - Show this help message
/status - Show bot status and next scheduled post
/countdown - Show time remaining until next Miku Monday
/today - Show today's daily hype message
/unsubscribe - Remove this channel from bot subscriptions
/feedback - Send feedback to the developer`).catch((error) => {
        console.error(`Failed to send help message to channel ${chatId}:`, error.message);
      });
    } else {
      bot.sendMessage(chatId, `I'm Miku Monday Bot! 🎵

Commands:
/start - Welcome message
/help - This help message
/status - Show subscription status
/countdown - Time until next Miku Monday
/today - Show today's daily hype message
/feedback - Send feedback to the developer
/listchannels - List subscribed channels (dev only)

I'll automatically send a Miku GIF every Monday at 12:00 AM to all channels I'm added to.`).catch((error) => {
        console.error(`Failed to send help message to chat ${chatId}:`, error.message);
      });
    }
  } else if (normalizedText === '/status' || (isChannel && normalizedText === '/status')) {
    const nextMonday = getNextMonday();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = nextMonday.toLocaleDateString('en-US', options);
    
    if (isChannel) {
      // Get current time in GMT+8
      const nowUtc = new Date();
      // Properly convert UTC to GMT+8 using timezone offset
      const gmt8Offset = 8 * 60; // GMT+8 in minutes
      const gmt8Time = new Date(nowUtc.getTime() + (gmt8Offset * 60000));
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDayName = dayNames[gmt8Time.getDay()];
      const currentTimeGmt8 = gmt8Time.toLocaleTimeString('en-US', { 
        timeZone: 'Asia/Singapore',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      bot.sendMessage(chatId, `📊 Miku Monday Bot Status 📊

Current time (GMT+8): ${currentDayName}, ${currentTimeGmt8}

I'll automatically send a Miku GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC) to all channels I'm added to.

Channels subscribed: ${chatIds.size}
Next scheduled post: Monday 12:00 AM GMT+8 (${formattedDate})`).catch((error) => {
        console.error(`Failed to send status message to channel ${chatId}:`, error.message);
      });
    } else {
      bot.sendMessage(chatId, `📊 Miku Monday Bot Status

Channels subscribed: ${chatIds.size}
Next scheduled post: Monday 12:00 AM (${formattedDate})

Visit https://its-miku-monday.zeabur.app/status for detailed status information.`).catch((error) => {
        console.error(`Failed to send status message to chat ${chatId}:`, error.message);
      });
    }
  } else if (normalizedText === '/countdown') {
    // Get current time in GMT+8
    const nowUtc = new Date();
    // Properly convert UTC to GMT+8 using timezone offset
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const gmt8Time = new Date(nowUtc.getTime() + (gmt8Offset * 60000));
    
    // Calculate next Monday at 00:00 GMT+8
    const nextMondayGmt8 = new Date(gmt8Time);
    nextMondayGmt8.setDate(gmt8Time.getDate() + (8 - gmt8Time.getDay()) % 7);
    nextMondayGmt8.setHours(0, 0, 0, 0);
    
    // If next Monday is today and it's already past 00:00, set to next week
    if (nextMondayGmt8 <= gmt8Time) {
      nextMondayGmt8.setDate(nextMondayGmt8.getDate() + 7);
    }
    
    // Convert back to UTC for calculation
    const nextMondayUtc = new Date(nextMondayGmt8.getTime() - (gmt8Offset * 60000));
    
    const timeDiff = nextMondayUtc.getTime() - nowUtc.getTime();
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    // Get current day name and time in GMT+8
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[gmt8Time.getDay()];
    const currentTimeGmt8 = gmt8Time.toLocaleTimeString('en-US', { 
      timeZone: 'Asia/Singapore',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    bot.sendMessage(chatId, `⏰ Countdown to next Miku Monday:
    
Current time (GMT+8): ${currentDayName}, ${currentTimeGmt8}

Time remaining: ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`).catch((error) => {
      console.error(`Failed to send countdown message to ${isChannel ? 'channel' : 'chat'} ${chatId}:`, error.message);
    });
  } else if (normalizedText === '/today' || (isChannel && normalizedText === '/today')) {
    const todayMessage = buildDailyHypeMessage();
    bot.sendMessage(chatId, todayMessage).catch((error) => {
      console.error(`Failed to send today message to ${isChannel ? 'channel' : 'chat'} ${chatId}:`, error.message);
    });
  } else if (normalizedText === '/feedback') {
    bot.sendMessage(chatId, `📬 Feedback for Miku Monday Bot:

Please send your feedback, bug reports, or suggestions to @JulianC97 on Telegram.

You can also type your message after /feedback and I'll forward it to the developer!`).catch((error) => {
      console.error(`Failed to send feedback message to ${isChannel ? 'channel' : 'chat'} ${chatId}:`, error.message);
    });
  } else if (normalizedText && normalizedText.startsWith('/feedback ')) {
    const feedback = normalizedText.substring(9); // Remove '/feedback '
    bot.sendMessage(chatId, `Thank you for your feedback! I've forwarded your message to the developer.`).catch((error) => {
      console.error(`Failed to send feedback confirmation to ${isChannel ? 'channel' : 'chat'} ${chatId}:`, error.message);
    });
    
    // Send feedback to developer if chat ID is configured
    if (developerChatId) {
      bot.sendMessage(developerChatId, `📬 New feedback received:

From ${isChannel ? 'channel' : 'chat'}: ${chatId}
Message: ${feedback}`).catch((error) => {
        console.error(`Failed to send feedback to developer ${developerChatId}:`, error.message);
      });
    } else {
      console.log(`Feedback received from ${chatId}: ${feedback}`);
      console.log('Note: DEVELOPER_CHAT_ID not set, feedback not sent to developer.');
    }
  } else if (normalizedText === '/listchannels') {
    // Only allow developer to list channels
    if (developerChatId && chatId.toString() === developerChatId.toString()) {
      // Mask channel IDs for privacy (show only last 4 digits)
      const channelList = Array.from(chatIds).map(id => {
        const maskedId = id.toString().slice(-4).padStart(id.toString().length, '*');
        return `• ${maskedId}`;
      }).join('\n') || 'No channels subscribed';
      bot.sendMessage(chatId, `📋 Subscribed Channels:

${channelList}

Total: ${chatIds.size} channels`).catch((error) => {
        console.error(`Failed to send channel list to developer ${chatId}:`, error.message);
      });
    } else {
      bot.sendMessage(chatId, `🔐 This command is restricted to the bot developer only.

🔒 Privacy Notice: Channel information is protected and masked even from the developer.
Only the last 4 digits of channel IDs are visible (e.g., ********1234).`).catch((error) => {
        console.error(`Failed to send restricted access message to ${chatId}:`, error.message);
      });
    }
  } else if (normalizedText === '/unsubscribe') {
    // Check if this is a private chat (not a channel)
    if (!isChannel) {
      bot.sendMessage(chatId, `❌ Unsubscribe Error
        
You can only unsubscribe channels from the bot, not private chats. 

To remove the bot from a channel:
1. Go to your channel settings
2. Select "Administrators" 
3. Remove the Miku Monday Bot as an administrator

If you wish to stop receiving direct messages, you can simply ignore them or block the bot.`).catch((error) => {
          console.error(`Failed to send unsubscribe error message to chat ${chatId}:`, error.message);
        });
      } else {
        // Handle channel unsubscription
        if (chatIds.has(chatId)) {
          chatIds.delete(chatId);
          
          // Save updated chat IDs
          saveChatIds().then(() => {
            bot.sendMessage(chatId, `✅ Successfully Unsubscribed
            
This channel has been unsubscribed from Miku Monday Bot.
You will no longer receive Miku GIFs or daily hype messages here.

To resubscribe in the future, simply send /start@itsmikumondaybot`).catch((error) => {
              console.error(`Failed to send unsubscribe confirmation to channel ${chatId}:`, error.message);
            });
          }).catch((error) => {
            console.error('Error saving chat IDs after unsubscription:', error);
            bot.sendMessage(chatId, `⚠️ Unsubscription Notice
            
This channel has been unsubscribed from Miku Monday Bot, but there was an error saving the change. Please contact the bot developer if this issue persists.`).catch((error) => {
              console.error(`Failed to send unsubscribe notice to channel ${chatId}:`, error.message);
            });
          });
        } else {
          bot.sendMessage(chatId, `ℹ️ Not Subscribed
            
This channel is not currently subscribed to Miku Monday Bot.
No changes were made.`).catch((error) => {
            console.error(`Failed to send not subscribed message to channel ${chatId}:`, error.message);
          });
        }
      }
    }
  // Note: No default response to avoid spamming channels
}// Log when bot is ready
bot.on('polling_start', () => {
  console.log(`=== BOT POLLING STARTED (Instance: ${INSTANCE_ID}) ===`);
  console.log('Bot is now actively polling for messages');
});

console.log('Bot initialized successfully!');
console.log('Bot token (first 10 chars):', token.substring(0, 10));

// Test if bot can send messages
console.log('Testing bot message sending capability...');

// Test network connectivity to Telegram
const https = require('https');
const url = 'https://api.telegram.org';

https.get(url, (res) => {
  console.log(`Network test (Instance: ${INSTANCE_ID}) - Connected to Telegram API. Status: ${res.statusCode}`);
}).on('error', (err) => {
  console.error(`Network test (Instance: ${INSTANCE_ID}) - Failed to connect to Telegram API:`, err.message);
});

// Schedule the bot to send the GIF every Monday at 12:00 AM GMT+8 (4:00 PM UTC Sunday)
cron.schedule('0 16 * * 0', () => {
  console.log('Sending Miku GIF to all channels...');
  
  // Send GIF to all registered chat IDs
  chatIds.forEach(chatId => {
    bot.sendAnimation(chatId, mikuGifPath, {
      caption: 'Happy Miku Monday! 🎉\nHave a great week with Hatsune Miku! 🎵'
    }).then(() => {
      console.log(`✅ Miku GIF sent successfully to chat ${chatId}!`);
    }).catch((error) => {
      console.error(`❌ Error sending Miku GIF to chat ${chatId}:`, error.message);
    });
  });
});

// Also schedule for testing purposes (every minute in development)
if (process.env.NODE_ENV === 'development') {
  cron.schedule('* * * * *', () => {
    console.log('Sending test Miku GIF to all channels...');
    
    chatIds.forEach(chatId => {
      bot.sendAnimation(chatId, mikuGifPath, {
        caption: 'Dev is testing Miku GIF! 🎉\nPlease ignore this message.'
      }).then(() => {
        console.log(`✅ Test Miku GIF sent successfully to chat ${chatId}!`);
      }).catch((error) => {
        console.error(`❌ Error sending test Miku GIF to chat ${chatId}:`, error.message);
      });
    });
  });
}

// Builds the daily hype message for the current GMT+8 day
function buildDailyHypeMessage() {
  const now = new Date();
  const gmt8Offset = 8 * 60;
  const gmt8Date = new Date(now.getTime() + (gmt8Offset * 60000));
  const dayOfWeek = gmt8Date.getDay();

  // Create day-specific hype messages (5 options per day, one picked randomly)
  const hypeMessageOptions = [
    // Sunday (0)
    [
      `🎵 Sunday Hype! 🎵\n\nRest, reflect, and prepare the next melody.\nTomorrow is Miku Monday!`,
      `🌅 Sunday Serenity 🌅\n\nThe calm before the storm of teal hair and twin-tails.\nMiku Monday is just around the corner!`,
      `🎶 Sunday Soundcheck 🎶\n\nOne more sleep until the best day of the week.\nAre you ready for Miku Monday?`,
      `🌙 Sunday Night Hype 🌙\n\nThe week ends, but the excitement is just beginning.\nMiku Monday drops at midnight!`,
      `🎤 Sunday Countdown 🎤\n\nT-minus 24 hours to Miku Monday.\nGet your speakers ready!`,
    ],
    // Monday (1)
    [
      `🎉 IT'S MIKU MONDAY! 🎉\n\nNew week, new track—press play!`,
      `🌟 MIKU MONDAY IS HERE! 🌟\n\nThe wait is over. Let the vocaloid vibes carry you through the week!`,
      `🎵 HAPPY MIKU MONDAY! 🎵\n\nToday we celebrate the one and only Hatsune Miku.\nTurn it up!`,
      `💙 IT'S THE BEST DAY OF THE WEEK! 💙\n\nMiku Monday has arrived—sing loud and sing proud!`,
      `🎤 MIKU MONDAY ACTIVATED! 🎤\n\nAnother Monday made infinitely better by teal twin-tails.\nEnjoy the drop!`,
    ],
    // Tuesday (2)
    [
      `🔥 Tuesday Momentum 🔥\n\nMomentum builds; keep the tempo steady.\n6 more days to Miku Monday!`,
      `🎸 Tuesday Groove 🎸\n\nYesterday's hype doesn't have to die.\nRide the wave—6 days until the next Miku Monday!`,
      `⚡ Tuesday Energy ⚡\n\nChannel that Monday Miku energy into your Tuesday.\n6 more days to go!`,
      `🎵 Tuesday Encore 🎵\n\nThe encore of Miku Monday lasts all week.\n6 days until the next performance!`,
      `🌊 Tuesday Ripple 🌊\n\nEvery great song has a lasting echo.\nMiku Monday's vibe carries through—6 days left!`,
    ],
    // Wednesday (3)
    [
      `🎼 Wednesday Rhythm 🎼\n\nHalfway there—your rhythm is holding strong.\n5 more days to Miku Monday!`,
      `🎹 Wednesday Harmony 🎹\n\nMiddle of the week, middle of the bridge.\nStay in tune—5 days to Miku Monday!`,
      `🌀 Wednesday Drop 🌀\n\nYou've hit the midpoint. The chorus is almost here.\n5 more days until Miku Monday!`,
      `🎶 Hump Day Hype 🎶\n\nWednesday means we're closer than we are far.\n5 days to Miku Monday—keep it going!`,
      `🎵 Wednesday Wavelength 🎵\n\nSync up and push through. You're halfway to Miku Monday!\n5 more days!`,
    ],
    // Thursday (4)
    [
      `🎯 Thursday Focus 🎯\n\nFine-tune the details; clarity creates impact.\n4 more days to Miku Monday!`,
      `🔊 Thursday Buildup 🔊\n\nThe bassline is dropping. Can you feel the weekend approaching?\n4 days to Miku Monday!`,
      `🎻 Thursday Tension 🎻\n\nThe anticipation is part of the experience.\n4 more days until Miku Monday!`,
      `⚙️ Thursday Preparation ⚙️\n\nAlmost there. Sharpen your focus and lock in.\n4 days to Miku Monday!`,
      `🎵 Thursday Countdown 🎵\n\nThe weekend—and Miku Monday—are within reach.\n4 more days!`,
    ],
    // Friday (5)
    [
      `✨ Friday Finish ✨\n\nFinish with confidence; let the chorus hit.\n3 more days to Miku Monday!`,
      `🎊 Friday Feels 🎊\n\nThe weekend is here, and Miku Monday follows close behind.\n3 days to go!`,
      `🎤 Friday Night Hype 🎤\n\nThe drop is coming. Just 3 more days to Miku Monday—stay hyped!`,
      `🌟 Friday Energy 🌟\n\nEnd the week strong. Miku Monday rewards those who push through.\n3 more days!`,
      `🎸 TGIF + Miku 🎸\n\nThank goodness it's Friday—and in 3 days, it's Miku Monday!`,
    ],
    // Saturday (6)
    [
      `🎸 Saturday Freedom 🎸\n\nCreate freely—no schedule, just sound.\n2 more days to Miku Monday!`,
      `🌈 Saturday Vibes 🌈\n\nEnjoy the weekend—Miku Monday is almost here!\nJust 2 more days!`,
      `🎵 Saturday Serenade 🎵\n\nLet the music fill your Saturday.\n2 days until the Miku Monday drop!`,
      `🏖️ Saturday Chill 🏖️\n\nRelax today, because Miku Monday arrives the day after tomorrow!\n2 more days!`,
      `🎉 Saturday Warmup 🎉\n\nConsider this your pre-game for Miku Monday.\n2 days and counting!`,
    ],
  ];

  // Pick a random message from today's options
  const todayOptions = hypeMessageOptions[dayOfWeek];
  const randomIndex = Math.floor(Math.random() * todayOptions.length);
  console.log(`📅 Picked random message index ${randomIndex} of ${todayOptions.length} options for day ${dayOfWeek}`);

  // Pick a random song recommendation
  const randomSong = SONG_POOL[Math.floor(Math.random() * SONG_POOL.length)];
  const songLine = `🎵 Miku's Song of the Day: ${randomSong.title} by ${randomSong.artist}\n${randomSong.url}`;

  return `${todayOptions[randomIndex]}

${songLine}

Channels subscribed: ${chatIds.size}

🎵 Add @itsmikumondaybot to your channels for weekly Miku fun!
🌐 Visit https://its-miku-monday.zeabur.app/status for bot status and info!`;
}

// Schedule daily hype messages (runs at 12:00 AM GMT+8 every day)
cron.schedule('0 16 * * *', () => {
  console.log('Sending daily hype message to all channels...');
  const hypeMessage = buildDailyHypeMessage();
  chatIds.forEach(chatId => {
    bot.sendMessage(chatId, hypeMessage).then(() => {
      console.log(`✅ Daily hype message sent successfully to chat ${chatId}!`);
    }).catch((error) => {
      console.error(`❌ Error sending daily hype message to chat ${chatId}:`, error.message);
    });
  });
});

// Handle incoming messages
bot.on('message', async (msg) => {
  console.log(`=== RECEIVED MESSAGE (Instance: ${INSTANCE_ID}) ===`);
  console.log('Message timestamp:', new Date().toISOString());
  console.log('Message object:', JSON.stringify(msg, null, 2));
  
  const chatId = msg.chat.id;
  const messageText = msg.text;
  
  console.log(`Processing message: chatId=${chatId}, messageText=${messageText}`);
  await handleCommand(chatId, messageText, false);
  console.log('Finished processing message');
});


// Handle incoming channel posts
bot.on('channel_post', async (msg) => {
  console.log(`=== RECEIVED CHANNEL POST (Instance: ${INSTANCE_ID}) ===`);
  console.log('Channel post timestamp:', new Date().toISOString());
  console.log('Channel post object:', JSON.stringify(msg, null, 2));
  
  const chatId = msg.chat.id;
  const messageText = msg.text;
  
  console.log(`Processing channel post: chatId=${chatId}, messageText=${messageText}`);
  await handleCommand(chatId, messageText, true);
  console.log('Finished processing channel post');
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const healthData = {
      online: true,
      timestamp: new Date().toISOString(),
      instanceId: INSTANCE_ID,
      chatIdsCount: chatIds.size,
      redis: {
        connected: !!redisClient,
        status: redisClient ? (redisClient.isOpen ? 'connected' : 'disconnected') : 'not_configured'
      },
      telegram: {
        polling: bot ? bot.isPolling() : false
      }
    };

    // Test Redis connectivity if available
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.ping();
        healthData.redis.ping = 'success';
      } catch (pingError) {
        healthData.redis.ping = 'failed';
        healthData.redis.pingError = pingError.message;
      }
    }

    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      online: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Redis-specific health check endpoint
app.get('/api/redis-health', async (req, res) => {
  if (!redisClient) {
    return res.status(404).json({ 
      status: 'not_configured', 
      message: 'Redis is not configured' 
    });
  }

  if (!redisClient.isOpen) {
    return res.status(503).json({ 
      status: 'disconnected', 
      message: 'Redis client is not connected' 
    });
  }

  try {
    const pingResult = await redisClient.ping();
    const chatIdsCount = await redisClient.exists(CHAT_IDS_KEY);
    
    res.status(200).json({
      status: 'healthy',
      ping: pingResult,
      connected: true,
      chatIdsStored: chatIdsCount > 0,
      chatIdsKey: CHAT_IDS_KEY,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Route to view current chat IDs (masked for privacy)
app.get('/api/chat-ids', (req, res) => {
  try {
    // Mask chat IDs for privacy (show only last 4 digits)
    const maskedIds = Array.from(chatIds).map(id => {
      const strId = String(id);
      return strId.length > 4 ? '*'.repeat(strId.length - 4) + strId.slice(-4) : strId;
    });

    res.status(200).json({
      count: chatIds.size,
      maskedIds: maskedIds,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching chat IDs:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Miku Monday Bot is running!');
});

// Status endpoint
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// API endpoint for status data
app.get('/api/status', (req, res) => {
  try {
    // Get current time in GMT+8
    const nowUtc = new Date();
    // Properly convert UTC to GMT+8 using timezone offset
    const gmt8Offset = 8 * 60; // GMT+8 in minutes
    const gmt8Time = new Date(nowUtc.getTime() + (gmt8Offset * 60000));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[gmt8Time.getDay()];
    const currentTimeGmt8 = gmt8Time.toLocaleTimeString('en-US', { 
      timeZone: 'Asia/Singapore',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const statusData = {
      online: true,
      channelCount: chatIds.size,
      nextPost: 'Monday at 12:00 AM GMT+8',
      dailyHype: '12:00 AM GMT+8 with day-specific content',
      currentTime: {
        day: currentDayName,
        time: currentTimeGmt8,
        timezone: 'GMT+8'
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString()
    };
    
    res.json(statusData);
  } catch (error) {
    console.error('Error fetching status data:', error);
    res.status(500).json({ error: 'Failed to fetch status data' });
  }
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error(`=== POLLING ERROR (Instance: ${INSTANCE_ID}) ===`);
  console.error('Timestamp:', new Date().toISOString());
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  
  // If it's a request error, provide more details
  if (error.response) {
    console.error('Response status:', error.response.statusCode);
    console.error('Response body:', error.response.body);
  }
  
  if (error.options) {
    console.error('Request options:', JSON.stringify(error.options, null, 2));
  }
  
  console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  console.error('====================');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Close DB connections, flush logs, etc.
  process.exit(1);
});

// Start the server
app.listen(port, () => {
  console.log(`Miku Monday Bot server (Instance: ${INSTANCE_ID}) running on port ${port}`);
  console.log(`Webhook URL: /bot${token}`);
  console.log('Server started successfully!');
});

module.exports = app;