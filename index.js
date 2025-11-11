import { Client, GatewayIntentBits, AttachmentBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import QRCode from "qrcode";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

/**
 * Per-guild config store (JSON file):
 * {
 *   "guildId1": { "channelId": "123..." },
 *   "guildId2": { "channelId": "" }  // empty => no restriction
 * }
 */
const STORE_PATH = path.join(process.cwd(), "store.json");

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

let store = loadStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent  // required for free-text detection
  ]
});

// future-proof ready event rename
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ----------------- helpers ----------------- */

function findFriendCodeIn(text) {
  if (!text) return null;
  // 4-4-4 with optional spaces or hyphens
  const grouped = text.match(/\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/);
  if (grouped) {
    const code = grouped[1] + grouped[2] + grouped[3];
    if (/^\d{12}$/.test(code)) return code;
  }
  // fallback: contiguous 12 digits
  const contiguous = text.match(/\b\d{12}\b/);
  return contiguous ? contiguous[0] : null;
}

async function generateQRBuffer(code) {
  return QRCode.toBuffer(code, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" }
  });
}

/* ----------------- message handler (free-text) ----------------- */

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return; // ignore DMs

    // Check if this guild has a configured channel
    const setting = store[message.guild.id];
    const allowedChannelId = setting?.channelId || "";

    if (allowedChannelId && message.channel.id !== allowedChannelId) {
      return; // restricted to a specific channel; this isn't it
    }

    const code = findFriendCodeIn(message.content);
    if (!code) return;

    // generate + send
    const png = await generateQRBuffer(code);
    const file = new AttachmentBuilder(png, { name: `pg-friend-${code}.png` });
    await message.channel.send({
      content: `**${message.member?.displayName ?? message.author.username}**’s friend code: \`${code}\``,
      files: [file]
    });
  } catch (err) {
    console.error(err);
  }
});

/* ----------------- slash commands ----------------- */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /qr
  if (interaction.commandName === "qr") {
    const raw = interaction.options.getString("code") ?? "";
    const code = raw.replace(/\D/g, "");
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
    return;
  }

  // /setchannel
  if (interaction.commandName === "setchannel") {
    // Admins or Manage Guild only
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "You need **Manage Server** permission to use this.", ephemeral: true });
      return;
    }

    const ch = interaction.options.getChannel("channel", true);
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) {
      await interaction.reply({ content: "Please choose a text or announcement channel.", ephemeral: true });
      return;
    }

    store[interaction.guild.id] = { channelId: ch.id };
    saveStore(store);

    await interaction.reply({ content: `✅ Friend-code auto-detection set to <#${ch.id}> for this server.`, ephemeral: true });
    return;
  }

  // /clearchannel
  if (interaction.commandName === "clearchannel") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "You need **Manage Server** permission to use this.", ephemeral: true });
      return;
    }

    delete store[interaction.guild.id];
    saveStore(store);

    await interaction.reply({ content: "✅ Cleared. The bot will detect friend codes **in any channel**.", ephemeral: true });
    return;
  }
});

client.login(process.env.BOT_TOKEN);