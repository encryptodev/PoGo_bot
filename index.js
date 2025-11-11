import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import QRCode from "qrcode";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const prefix = "!qr";
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // get digits only, allow spaces/hyphens
  const code = message.content.slice(prefix.length).trim().replace(/\D/g, "");

  if (!/^\d{12}$/.test(code)) {
    await message.reply("Please provide a **12-digit** Pokémon GO friend code, e.g. `!qr 1234 5678 9012`.");
    return;
  }

  try {
    const png = await QRCode.toBuffer(code, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" }
    });

    const file = new AttachmentBuilder(png, { name: `pg-friend-${code}.png` });
    await message.reply({ content: `Here’s the QR for \`${code}\`.`, files: [file] });
  } catch (e) {
    console.error(e);
    await message.reply("Sorry, I couldn’t generate that QR.");
  }
});

client.login(process.env.BOT_TOKEN);
