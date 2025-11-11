import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";

const commands = [
  // /qr
  new SlashCommandBuilder()
    .setName("qr")
    .setDescription("Generate a Pokémon GO friend-code QR")
    .addStringOption(opt =>
      opt.setName("code")
        .setDescription("Your 12-digit trainer code (spaces/dashes ok)")
        .setRequired(true)
    ),

  // /setchannel
  new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Set the channel where friend codes will be auto-detected")
    .addChannelOption(opt =>
      opt.setName("channel")
        .setDescription("Pick the friend-code channel")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),

  // /clearchannel
  new SlashCommandBuilder()
    .setName("clearchannel")
    .setDescription("Allow friend-code auto-detection in any channel (clears setting)")
].map(c => c.toJSON());

const CLIENT_ID = process.env.CLIENT_ID;
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

try {
  console.log("Registering GLOBAL slash commands…");
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Done.");
} catch (e) {
  console.error(e);
  process.exit(1);
}