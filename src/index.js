import 'dotenv/config';
import http from 'node:http';
import {
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionsBitField,
  Partials,
} from 'discord.js';
import { commandData } from './commands.js';
import { loadState, saveState } from './storage.js';

const token = process.env.DISCORD_TOKEN;
const port = Number(process.env.PORT || 0);
const RELAY_ROLE_ID = '1492370989399543808';
const PRESENCE_ROTATION_MS = 30000;

const presenceStates = [
  { name: 'G.GUI', type: ActivityType.Playing },
  { name: 'Chilling in G.GUI', type: ActivityType.Playing },
  { name: 'DM connections', type: ActivityType.Watching },
  { name: 'your messages', type: ActivityType.Listening },
];

const state = await loadState();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

function truncate(text, limit) {
  if (!text) {
    return '';
  }

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 3)}...`;
}

function findRelaySessionByChannelId(channelId) {
  return Object.entries(state.activeRelays).find(([, session]) => session.channelId === channelId) ?? null;
}

function startPresenceLoop() {
  let index = 0;

  const applyPresence = () => {
    const activity = presenceStates[index % presenceStates.length];
    client.user?.setPresence({
      activities: [activity],
      status: 'online',
    });
    console.log(`[Presence] Updated status to ${ActivityType[activity.type]} ${activity.name}`);
    index += 1;
  };

  applyPresence();
  setInterval(applyPresence, PRESENCE_ROTATION_MS);
}

async function createRelayChannel(guild, targetUser, invoker) {
  const channelName = `relay-${targetUser.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Private relay for ${targetUser.tag} (invited by ${invoker.tag})`,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: RELAY_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
      {
        id: targetUser.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
    ],
  });

  return channel;
}

function buildRelayInviteEmbed(targetUser, invoker, note) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Relay request')
    .setDescription(
      [
        `**${invoker.tag}** invited you to a private relay channel in their server.`,
        'If you accept, a temporary channel will be created where you can chat with the server moderators.',
        'You can leave or decline anytime.',
      ].join('\n\n'),
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: `Requested by ${invoker.tag}` });

  if (note) {
    embed.addFields({ name: 'Note', value: truncate(note, 1024) });
  }

  return embed;
}

async function startRelay(guild, targetUser, invoker, note) {
  if (state.activeRelays[targetUser.id]) {
    return null;
  }

  const channel = await createRelayChannel(guild, targetUser, invoker);

  state.activeRelays[targetUser.id] = {
    channelId: channel.id,
    guildId: guild.id,
    startedBy: invoker.id,
    startedAt: new Date().toISOString(),
  };
  await saveState(state);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Relay started')
    .setDescription(`Relay channel created for **${targetUser.tag}**.`)
    .addFields(
      { name: 'User', value: targetUser.tag, inline: true },
      { name: 'Started by', value: invoker.tag, inline: true },
    )
    .setTimestamp(new Date());

  if (note) {
    embed.addFields({ name: 'Note', value: truncate(note, 1024) });
  }

  await channel.send({ embeds: [embed] });

  return channel;
}

async function stopRelay(userId) {
  const session = state.activeRelays[userId];
  if (!session) {
    return null;
  }

  const guild = await client.guilds.fetch(session.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(session.channelId).catch(() => null) : null;

  if (channel) {
    const endEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('Relay ended')
      .setDescription('This relay has been closed.')
      .setTimestamp(new Date());

    await channel.send({ embeds: [endEmbed] }).catch(() => null);
    await channel.delete().catch(() => null);
  }

  delete state.activeRelays[userId];
  await saveState(state);
  return session;
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') {
        await interaction.reply({ content: `Pong. API latency is ${Math.round(client.ws.ping)}ms.`, ephemeral: true });
        return;
      }

      if (interaction.commandName === 'about') {
        await interaction.reply({
          content: 'Relay bot: create private channels to chat with users. Use `/relayrequest user:<member>` to start.',
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'dmconnect') {
        const targetUser = interaction.options.getUser('user', true);
        const note = interaction.options.getString('note');

        if (targetUser.bot) {
          await interaction.reply({ content: 'Bots cannot join a relay.', ephemeral: true });
          return;
        }

        if (state.activeRelays[targetUser.id]) {
          await interaction.reply({ content: `A relay is already active for ${targetUser.tag}.`, ephemeral: true });
          return;
        }

        const dm = await targetUser.send({
          embeds: [buildRelayInviteEmbed(targetUser, interaction.user, note)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`dmconnect_accept:${interaction.user.id}:${interaction.guildId}:${Date.now()}`)
                .setLabel('Accept DM connection')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`dmconnect_decline`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        });

        await interaction.reply({
          content: `Sent a DM connection invitation to ${targetUser.tag}.`,
          ephemeral: true,
        });

        await dm.react('📩').catch(() => null);
        return;
      }

      if (interaction.commandName === 'dmend') {
        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        const session = await stopRelay(targetUser.id);

        if (!session) {
          await interaction.reply({ content: `No active DM connection exists for ${targetUser.tag}.`, ephemeral: true });
          return;
        }

        await interaction.reply({ content: `DM connection ended for ${targetUser.tag}. Channel deleted.`, ephemeral: true });
        return;
      }

      if (interaction.commandName === 'ban') {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') ?? 'No reason provided';

        if (!interaction.guild) {
          await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
          return;
        }

        try {
          await interaction.guild.members.ban(targetUser, { reason });
          state.bannedUsers.push({ id: targetUser.id, tag: targetUser.tag, bannedAt: new Date().toISOString(), reason });
          await saveState(state);

          await interaction.reply({
            content: `**${targetUser.tag}** has been banned. Reason: ${reason}`,
            ephemeral: false,
          });

          await stopRelay(targetUser.id);
        } catch (error) {
          await interaction.reply({ content: `Failed to ban ${targetUser.tag}: ${error.message}`, ephemeral: true });
        }
        return;
      }
    }

    if (interaction.isButton()) {
      const [action, requesterId, guildId, timestamp] = interaction.customId.split(':');

      if (action !== 'dmconnect_accept' && action !== 'dmconnect_decline') {
        return;
      }

      if (action === 'dmconnect_decline') {
        await interaction.update({
          content: 'You declined the relay request.',
          components: [],
        });
        return;
      }

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        await interaction.reply({ content: 'Guild not found.', ephemeral: true });
        return;
      }

      const invoker = await client.users.fetch(requesterId).catch(() => null);
      const channel = await startRelay(guild, interaction.user, invoker ?? { tag: 'Unknown' }, null);

      if (!channel) {
        await interaction.update({
          content: 'A relay session is already active for you.',
          components: [],
        });
        return;
      }

      await interaction.update({
        content: `DM connection accepted. Channel created in **${guild.name}**.`,
        components: [],
      });
    }
  } catch (error) {
    console.error('Interaction handling failed:', error);

    if (interaction.isRepliable()) {
      const payload = { content: 'Something went wrong while handling that action.' };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    console.log(`[DM Connection] Message from ${message.author.tag}. Guild: ${message.guild?.name ?? 'DM'}, Channel: ${message.channelId}`);

    if (message.guild) {
      const relaySessionEntry = findRelaySessionByChannelId(message.channelId);

      if (!relaySessionEntry) {
        return;
      }

      const [targetUserId, relaySession] = relaySessionEntry;

      console.log(`[DM Connection] Relay channel message detected. Sending to DM for user ${targetUserId}.`);

      const dmUser = await client.users.fetch(targetUserId).catch((err) => {
        console.log(`[DM Connection] Could not fetch target user ${targetUserId}:`, err.message);
        return null;
      });

      if (!dmUser) {
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: `Message from ${message.author.tag} in relay`, iconURL: message.author.displayAvatarURL() })
        .setDescription(truncate(message.content?.trim() || '*No text content*', 4096))
        .setTimestamp(new Date());

      await dmUser.send({ embeds: [embed] }).catch((err) => console.log(`[DM Connection] Failed to send DM:`, err.message));
      return;
    }

    const userRelaySession = state.activeRelays[message.author.id];

    if (!message.guild && userRelaySession) {
      console.log(`[DM Connection] DM message detected. Sending to relay channel.`);
      console.log(`[DM Connection] Session data:`, userRelaySession);
      const guild = await client.guilds.fetch(userRelaySession.guildId).catch((err) => {
        console.log(`[DM Connection] Failed to fetch guild:`, err.message);
        return null;
      });
      if (!guild) {
        console.log(`[DM Connection] Guild is null after fetch`);
        return;
      }
      const channel = await guild.channels.fetch(userRelaySession.channelId).catch((err) => {
        console.log(`[DM Connection] Failed to fetch channel:`, err.message);
        return null;
      });

      if (!channel) {
        console.log(`[DM Connection] Channel is null after fetch`);
        return;
      }
      if (!channel.isTextBased()) {
        console.log(`[DM Connection] Channel is not text-based`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({ name: `${message.author.tag} (DM)`, iconURL: message.author.displayAvatarURL() })
        .setDescription(truncate(message.content?.trim() || '*No text content*', 4096))
        .setTimestamp(new Date());

      console.log(`[DM Connection] Attempting to send embed to channel ${userRelaySession.channelId}`);
      await channel.send({ embeds: [embed] }).catch((err) => {
        console.log(`[DM Connection] Failed to send to channel:`, err.message);
      });
      console.log(`[DM Connection] Message sent successfully`);
      return;
    }
  } catch (error) {
    console.error('Message relay failed:', error);
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${commandData.length} slash commands.`);
  console.log(`Active relay sessions: ${Object.keys(state.activeRelays).length}`);
  startPresenceLoop();
});

client.on('error', (error) => {
  console.error('Discord client error:', error.message);
});

client.on('warn', (warn) => {
  console.warn('Discord client warning:', warn);
});

if (port > 0) {
  const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('discord-relay-bot running');
  });

  healthServer.listen(port, () => {
    console.log(`Health server listening on port ${port}`);
  });
}

async function startBot() {
  console.log('Starting Discord bot process...');

  if (!token) {
    console.error('Startup error: DISCORD_TOKEN is missing. Set it in Render environment variables.');
    console.error('Health server is still running on port ' + port);
    return;
  }

  try {
    console.log('Attempting to login with Discord token...');
    await Promise.race([
      client.login(token),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Discord login timed out after 45s')), 45000);
      }),
    ]);
    console.log('Discord client login call completed.');
  } catch (error) {
    console.error('Discord login threw an exception:', error.message);
    console.error('Full error:', error);
    console.error('Health server is still running on port ' + port + '. Please check your environment variables and Discord Developer Portal intents.');
  }
}

await startBot();
