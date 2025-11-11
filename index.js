import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import QRCode from "qrcode";
import dotenv from "dotenv";
dotenv.config();

/**
 * Notes:
 * - Requires Message Content Intent (you already enabled it).
 * - Supports both slash command `/qr` and free-text detection in messages.
 * - Optional channel whitelist (set FRIEND_CODE_CHANNEL_ID) or leave null for all channels.
 * - Simple per-user cooldown to prevent spam.
 */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Future-proof the ready event rename warning
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ====== CONFIG ====== */
// Put a channel ID to restrict auto-detection to one channel; leave as "" to allow anywhere.
const FRIEND_CODE_CHANNEL_ID = ""; // e.g. "123456789012345678"
// Delete original user message after responding? Requires Manage Messages perm in that channel.
const DELETE_ORIGINAL_MESSAGE = false;
// Cooldown (ms) to avoid spam per user:
const USER_COOLDOWN_MS = 10_000;
/* ==================== */

const lastUseByUser = new Map(); // userId -> timestamp

// Robust extractor: accepts 123456789012 or 1234 5678 9012 or 1234-5678-9012
function findFriendCodeIn(text) {
  if (!text) return null;

  // 1) Match grouped format 4-4-4 with spaces or hyphens
  const grouped = text.match(/\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/);
  if (grouped) {
    const code = (grouped[1] + grouped[2] + grouped[3]);
    if (/^\d{12}$/.test(code)) return code;
  }

  // 2) Fallback: any contiguous 12 digits
  const contiguous = text.match(/\b\d{12}\b/);
  if (contiguous) return contiguous[0];

  return null;
}

async function generateQRBuffer(code) {
  return QRCode.toBuffer(code, {
    errorCorrectionLevel: "M",
    margin: 4,   // quiet zone
    width: 512,  // crisp on mobile
    color: { dark: "#000000", light: "#FFFFFF" }
  });
}

async function sendQR(channel, authorName, code) {
  const png = await generateQRBuffer(code);
  const file = new AttachmentBuilder(png, { name: `pg-friend-${code}.png` });
  return channel.send({
    content: `**${authorName}**’s friend code: \`${code}\``,
    files: [file]
  });
}

/* ------- Free-text detection in messages ------- */
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    // Restrict to a specific channel if configured
    if (FRIEND_CODE_CHANNEL_ID && message.channel.id !== FRIEND_CODE_CHANNEL_ID) {
      return;
    }

    const code = findFriendCodeIn(message.content);
    if (!code) return;

    // Basic per-user cooldown
    const now = Date.now();
    const last = lastUseByUser.get(message.author.id) || 0;
    if (now - last < USER_COOLDOWN_MS) return;
    lastUseByUser.set(message.author.id, now);

    await sendQR(message.channel, message.member?.displayName ?? message.author.username, code);

    if (DELETE_ORIGINAL_MESSAGE && message.deletable) {
      await message.delete().catch(() => {});
    }
  } catch (err) {
    console.error(err);
    // Avoid noisy error replies on every message
  }
});

/* ------- Slash command handler (/qr) ------- */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "qr") return;

  const raw = interaction.options.getString("code") ?? "";
  const code = (raw.replace(/\D/g, "")).slice(0, 12); // sanitise; allow spaces/dashes

  if (!/^\d{12}$/.test(code)) {
    await interaction.reply({ content: "Please provide a **12-digit** friend code.", ephemeral: true });
    return;
  }

  try {
    const png = await generateQRBuffer(code);
    const file = new AttachmentBuilder(png, { name: `pg-friend-${code}.png` });
    await interaction.reply({ content: `Here’s the QR for \`${code}\`.`, files: [file] });
  } catch (e) {
    console.error(e);
    await interaction.reply({ content: "Sorry, I couldn’t generate that QR.", ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);
