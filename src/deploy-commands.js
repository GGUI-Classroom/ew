import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandData } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.log('Skipping slash command deploy because DISCORD_TOKEN or CLIENT_ID is missing.');
  process.exit(0);
}

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandData,
    });
    console.log(`Deployed ${commandData.length} guild commands to ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), {
    body: commandData,
  });
  console.log(`Deployed ${commandData.length} global commands.`);
}

deployCommands().catch((error) => {
  console.error('Failed to deploy commands:', error);
  process.exitCode = 1;
});
