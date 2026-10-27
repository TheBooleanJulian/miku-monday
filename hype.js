// Daily hype messages and Singapore-time helpers, shared by the Worker (worker.js).
// Copy is unchanged from server.js; only the time handling is rewritten to use Asia/Singapore properly.

export const TZ = 'Asia/Singapore';

const HYPE = [
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Day of week (0 = Sunday) as seen in Singapore.
export function sgtDay(now = new Date()) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(now);
  return DAYS.indexOf(name);
}

// "Monday, 14:05:09" in Singapore time. (server.js shifted the clock +8h and then formatted it in
// Asia/Singapore as well, so it showed a time 8 hours ahead.)
export function sgtNow(now = new Date()) {
  const time = now.toLocaleTimeString('en-US', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { day: DAYS[sgtDay(now)], time };
}

// Next Monday 00:00 SGT, i.e. the next Sunday 16:00 UTC strictly after now.
export function nextMikuMonday(now = new Date()) {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0));
  t.setUTCDate(t.getUTCDate() + ((7 - t.getUTCDay()) % 7)); // move to Sunday
  if (t <= now) t.setUTCDate(t.getUTCDate() + 7);
  return t;
}

export function formatSgtDate(date) {
  return date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function buildDailyHypeMessage({ songs, channelCount, publicUrl, now = new Date() }) {
  const song = pick(songs);
  return `${pick(HYPE[sgtDay(now)])}

🎵 Miku's Song of the Day: ${song.title} by ${song.artist}
${song.url}

Channels subscribed: ${channelCount}

🎵 Add @itsmikumondaybot to your channels for weekly Miku fun!
🌐 Visit ${publicUrl}/status for bot status and info!`;
}
