import 'dotenv/config';
import http from 'node:http';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { commandData } from './commands.js';
import { loadState, saveState } from './storage.js';

const token = process.env.DISCORD_TOKEN;
const port = Number(process.env.PORT || 0);

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

function getConfiguredRelayChannelId() {
  return state.relayChannelId ?? process.env.RELAY_CHANNEL_ID ?? null;
}

async function getRelayChannel() {
  const channelId = getConfiguredRelayChannelId();
  if (!channelId) {
    return null;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel && channel.isTextBased() ? channel : null;
}

function buildRelayInviteEmbed(targetUser, invoker, note, relayChannel) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Relay request')
    .setDescription(
      [
        `**${invoker.tag}** asked to start a consent-based relay into **${relayChannel}**.`,
        'If you accept, your future DM messages in this conversation will be forwarded into that channel.',
        'You can decline or stop the relay later with the button or the `/relayend` command.',
      ].join('\n\n'),
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: `Requested by ${invoker.tag}` });

  if (note) {
    embed.addFields({ name: 'Note', value: truncate(note, 1024) });
  }

  return embed;
}

async function notifyRelayChannelAboutStart(relayChannel, targetUser, startedBy, note) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Relay started')
    .setDescription(`**${targetUser.tag}** accepted the relay and their DM replies will now appear here.`)
    .addFields(
      { name: 'User ID', value: targetUser.id, inline: true },
      { name: 'Started by', value: startedBy.tag, inline: true },
    )
    .setTimestamp(new Date());

  if (note) {
    embed.addFields({ name: 'Note', value: truncate(note, 1024) });
  }

  await relayChannel.send({ embeds: [embed] });
}

async function notifyRelayChannelAboutEnd(relayChannel, targetUser, endedBy) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Relay ended')
    .setDescription(`The relay for **${targetUser.tag}** has been stopped.`)
    .addFields({ name: 'Ended by', value: endedBy.tag, inline: true })
    .setTimestamp(new Date());

  await relayChannel.send({ embeds: [embed] });
}

async function stopRelay(userId) {
  const session = state.activeRelays[userId];
  if (!session) {
    return null;
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
          content: [
            'This bot handles moderation-friendly utilities and a consent-based DM relay.',
            'Use `/setrelaychannel` to choose the destination channel, then `/relayrequest` to invite a user.',
          ].join(' '),
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'setrelaychannel') {
        const channel = interaction.options.getChannel('channel', true);
        state.relayChannelId = channel.id;
        await saveState(state);

        await interaction.reply({
          content: `Relay channel set to ${channel}.`,
          ephemeral: true,
        });
        return;
      }

      if (interaction.commandName === 'relayrequest') {
        const targetUser = interaction.options.getUser('user', true);
        const note = interaction.options.getString('note');
        const relayChannel = await getRelayChannel();

        if (!relayChannel) {
          await interaction.reply({
            content: 'Set a relay channel first with `/setrelaychannel` or the `RELAY_CHANNEL_ID` environment variable.',
            ephemeral: true,
          });
          return;
        }

        if (targetUser.bot) {
          await interaction.reply({ content: 'Bots cannot join a relay.', ephemeral: true });
          return;
        }

        const dm = await targetUser.send({
          embeds: [buildRelayInviteEmbed(targetUser, interaction.user, note, relayChannel.toString())],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`relay_accept:${interaction.user.id}:${Date.now()}`)
                .setLabel('Accept relay')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`relay_decline:${interaction.user.id}:${Date.now()}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger),
            ),
          ],
        });

        await interaction.reply({
          content: `Sent a relay invitation to ${targetUser.tag}.`,
          ephemeral: true,
        });

        await dm.react('📩').catch(() => null);
        return;
      }

      if (interaction.commandName === 'relayend') {
        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        const relayChannel = await getRelayChannel();
        const session = await stopRelay(targetUser.id);

        if (!session) {
          await interaction.reply({ content: `No active relay exists for ${targetUser.tag}.`, ephemeral: true });
          return;
        }

        await interaction.reply({ content: `Relay ended for ${targetUser.tag}.`, ephemeral: true });

        if (relayChannel) {
          await notifyRelayChannelAboutEnd(relayChannel, targetUser, interaction.user);
        }
      }
    }

    if (interaction.isButton()) {
      const [action, requesterId] = interaction.customId.split(':');

      if (action !== 'relay_accept' && action !== 'relay_decline') {
        return;
      }

      const relayChannel = await getRelayChannel();
      if (!relayChannel) {
        await interaction.reply({ content: 'Relay channel is not configured yet.', ephemeral: true });
        return;
      }

      if (action === 'relay_decline') {
        await interaction.update({
          content: 'You declined the relay request.',
          components: [],
        });
        return;
      }

      const existingSession = state.activeRelays[interaction.user.id];
      if (existingSession) {
        await interaction.update({
          content: 'A relay session is already active for you.',
          components: [],
        });
        return;
      }

      const startedBy = await client.users.fetch(requesterId).catch(() => null);
      state.activeRelays[interaction.user.id] = {
        relayChannelId: relayChannel.id,
        startedBy: startedBy?.id ?? requesterId,
        startedAt: new Date().toISOString(),
        note: null,
      };
      await saveState(state);

      await interaction.update({
        content: 'You accepted the relay. Your DM replies will now be forwarded.',
        components: [],
      });

      await notifyRelayChannelAboutStart(relayChannel, interaction.user, startedBy ?? interaction.user, null);
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
    if (message.author.bot || message.guild) {
      return;
    }

    const session = state.activeRelays[message.author.id];
    if (!session) {
      return;
    }

    const relayChannel = await client.channels.fetch(session.relayChannelId).catch(() => null);
    if (!relayChannel || !relayChannel.isTextBased()) {
      return;
    }

    const attachmentList = [...message.attachments.values()]
      .map((attachment) => `• [${attachment.name ?? 'attachment'}](${attachment.url})`)
      .slice(0, 10);

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: `${message.author.tag} in DM relay`, iconURL: message.author.displayAvatarURL() })
      .setDescription(truncate(message.content?.trim() || '*No text content*', 4096))
      .addFields(
        { name: 'User ID', value: message.author.id, inline: true },
        { name: 'Relay started', value: session.startedAt ? `<t:${Math.floor(new Date(session.startedAt).getTime() / 1000)}:F>` : 'Unknown', inline: true },
      )
      .setTimestamp(new Date());

    if (attachmentList.length > 0) {
      embed.addFields({ name: 'Attachments', value: truncate(attachmentList.join('\n'), 1024) });
    }

    await relayChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('Message relay failed:', error);
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${commandData.length} slash commands.`);
  console.log(`Active relay sessions: ${Object.keys(state.activeRelays).length}`);
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
    await client.login(token);
    console.log('Discord client login call completed.');
  } catch (error) {
    console.error('Discord login threw an exception:', error.message);
    console.error('Full error:', error);
    console.error('Health server is still running on port ' + port + '. Please check your environment variables and Discord Developer Portal intents.');
  }
}

await startBot();
