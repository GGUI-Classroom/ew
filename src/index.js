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
  MessageFlags,
  Partials,
  PermissionsBitField,
  StringSelectMenuBuilder,
} from 'discord.js';
import { commandData } from './commands.js';
import { loadState, saveState } from './storage.js';

const token = process.env.DISCORD_TOKEN;
const port = Number(process.env.PORT || 0);
const RELAY_ROLE_ID = '1492370989399543808';
const PRESENCE_ROTATION_MS = 10000;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const NOINVITE_TIMEOUT_DEFAULT_MS = 60_000;
const PERIOD_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const presenceStates = [
  { name: 'on G.GUI', type: ActivityType.Playing },
  { name: 'Chilling in G.GUI', type: ActivityType.Playing },
];

const state = await loadState();
state.warnings ??= {};
state.adminRoleIds ??= [RELAY_ROLE_ID];
state.adminUserIds ??= [];
state.dispenserLinks ??= [];
state.dispenserLimits ??= [];
state.dispenserUsage ??= [];
state.dispenserPanelMessages ??= {};
state.moderationRules ??= {};

state.dispenserLinks = state.dispenserLinks.map((entry) => ({
  ...entry,
  panel: entry.panel ? normalizeCategory(String(entry.panel)) : 'default',
  filters: Array.isArray(entry.filters)
    ? entry.filters.map((value) => normalizeCategory(String(value))).filter(Boolean)
    : entry.filter
      ? [normalizeCategory(String(entry.filter))]
      : [],
}));

state.dispenserLimits = state.dispenserLimits.map((entry) => ({
  ...entry,
  panel: entry.panel ? normalizeCategory(String(entry.panel)) : 'default',
}));

state.dispenserUsage = state.dispenserUsage.map((entry) => ({
  ...entry,
  panel: entry.panel ? normalizeCategory(String(entry.panel)) : 'default',
}));

const dispenserSelections = new Map();
const dispenserRandomState = new Map();

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

function parseDurationToMs(raw) {
  const match = /^([1-9]\d*)([smhd])$/i.exec(raw.trim());
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const ms = value * multiplier;

  if (ms > MAX_TIMEOUT_MS) {
    return null;
  }

  return ms;
}

function normalizeCategory(value) {
  return value.trim().toLowerCase();
}

function parseFilterList(raw) {
  const filters = raw
    .split(',')
    .map((value) => normalizeCategory(value))
    .filter(Boolean);

  return [...new Set(filters)];
}

function normalizePanelName(raw) {
  return normalizeCategory(raw).slice(0, 50);
}

function formatDurationMinutes(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function getGuildModerationRule(guildId) {
  state.moderationRules[guildId] ??= {};

  if (state.moderationRules[guildId].noticket && !state.moderationRules[guildId].noinvite) {
    state.moderationRules[guildId].noinvite = state.moderationRules[guildId].noticket;
    delete state.moderationRules[guildId].noticket;
  }

  state.moderationRules[guildId].noinvite ??= {
    enabled: false,
    bypassChannelIds: [],
    warningMessage: 'Do not send invite links here.',
    timeout: {
      enabled: true,
      durationMs: NOINVITE_TIMEOUT_DEFAULT_MS,
    },
    reports: {
      enabled: false,
      channelId: null,
    },
  };

  state.moderationRules[guildId].noinvite.bypassChannelIds ??= [];
  state.moderationRules[guildId].noinvite.warningMessage ??= 'Do not send invite links here.';
  state.moderationRules[guildId].noinvite.timeout ??= {
    enabled: true,
    durationMs: NOINVITE_TIMEOUT_DEFAULT_MS,
  };
  state.moderationRules[guildId].noinvite.timeout.enabled ??= true;

  const timeoutDuration = Number(state.moderationRules[guildId].noinvite.timeout.durationMs);
  if (!Number.isFinite(timeoutDuration) || timeoutDuration < 60_000 || timeoutDuration > MAX_TIMEOUT_MS) {
    state.moderationRules[guildId].noinvite.timeout.durationMs = NOINVITE_TIMEOUT_DEFAULT_MS;
  }

  state.moderationRules[guildId].noinvite.reports ??= {
    enabled: false,
    channelId: null,
  };
  state.moderationRules[guildId].noinvite.reports.enabled ??= false;
  state.moderationRules[guildId].noinvite.reports.channelId ??= null;

  return state.moderationRules[guildId];
}

function isInviteLinkMessage(content) {
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/[\w-]+|discord(?:app)?\.com\/invite\/[\w-]+)/i.test(content);
}

function getHostnameSafe(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

function shuffleArray(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseDispenserLink(panelName, selected, matches) {
  const key = `${panelName}|${selected.filter}|${selected.type}`;
  const priorState = dispenserRandomState.get(key) ?? { remainingIds: [], lastHostname: null };
  const linksById = new Map(matches.map((entry) => [entry.id, entry]));

  let remainingIds = priorState.remainingIds.filter((id) => linksById.has(id));
  if (remainingIds.length === 0) {
    remainingIds = shuffleArray(matches.map((entry) => entry.id));
  }

  let candidateIds = [...remainingIds];

  if (priorState.lastHostname) {
    const differentHostIds = candidateIds.filter((id) => getHostnameSafe(linksById.get(id).url) !== priorState.lastHostname);
    if (differentHostIds.length > 0) {
      candidateIds = differentHostIds;
    }
  }

  const chosenId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
  const chosen = linksById.get(chosenId);

  const nextState = {
    remainingIds: remainingIds.filter((id) => id !== chosenId),
    lastHostname: getHostnameSafe(chosen.url),
  };

  dispenserRandomState.set(key, nextState);
  return chosen;
}

function buildLinkId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildLimitId() {
  return `limit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isServerAdministrator(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
}

function hasConfiguredAdminRole(interaction) {
  if (!interaction.inGuild()) {
    return false;
  }

  const roleIds = interaction.member?.roles?.cache?.keys?.();
  if (!roleIds) {
    return false;
  }

  for (const roleId of roleIds) {
    if (state.adminRoleIds.includes(roleId)) {
      return true;
    }
  }

  return false;
}

function isBotAdmin(interaction) {
  return isServerAdministrator(interaction) || state.adminUserIds.includes(interaction.user.id) || hasConfiguredAdminRole(interaction);
}

function getDispenserCategoryOptions(panelName, key) {
  const panelLinks = state.dispenserLinks.filter((entry) => entry.panel === panelName);
  const values =
    key === 'filter'
      ? [...new Set(panelLinks.flatMap((entry) => entry.filters ?? []))].sort()
      : [...new Set(panelLinks.map((entry) => entry[key]))].sort();
  return ['any', ...values].slice(0, 25);
}

function getUsageCountForPeriod(userId, panelName, period, nowMs = Date.now()) {
  const windowMs = PERIOD_MS[period];
  if (!windowMs) {
    return 0;
  }

  return state.dispenserUsage.filter((entry) => entry.userId === userId && entry.panel === panelName && nowMs - entry.timestamp <= windowMs).length;
}

function trimUsageHistory(nowMs = Date.now()) {
  const keepWindow = PERIOD_MS.month;
  state.dispenserUsage = state.dispenserUsage.filter((entry) => nowMs - entry.timestamp <= keepWindow);
}

function buildDispenserPanelComponents(panelName) {
  const filterOptions = getDispenserCategoryOptions(panelName, 'filter').map((value) => ({
    label: value === 'any' ? 'Any filter' : value,
    value,
  }));
  const typeOptions = getDispenserCategoryOptions(panelName, 'type').map((value) => ({
    label: value === 'any' ? 'Any type' : value,
    value,
  }));

  const filterMenu = new StringSelectMenuBuilder()
    .setCustomId('dispenser_filter')
    .setPlaceholder('Choose a filter')
    .addOptions(filterOptions);

  const typeMenu = new StringSelectMenuBuilder()
    .setCustomId('dispenser_type')
    .setPlaceholder('Choose a type')
    .addOptions(typeOptions);

  const dispenseButton = new ButtonBuilder().setCustomId('dispenser_dispense').setLabel('Dispense Link').setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder().addComponents(filterMenu),
    new ActionRowBuilder().addComponents(typeMenu),
    new ActionRowBuilder().addComponents(dispenseButton),
  ];
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

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

async function createRelayChannel(guild, targetUser, invoker) {
  const channelName = `relay-${targetUser.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Private relay for ${targetUser.tag} (invited by ${invoker.tag})`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: RELAY_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: targetUser.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });
}

function buildRelayInviteEmbed(targetUser, invoker, note) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('DM connection request')
    .setDescription(
      [
        `**${invoker.tag}** invited you to a private DM connection channel.`,
        'If accepted, a temporary channel is created where moderators and your DMs are linked both ways.',
        'You can decline any time.',
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
    console.log(`[DM Relay] Relay already active for ${targetUser.tag} (${targetUser.id})`);
    return null;
  }

  const channel = await createRelayChannel(guild, targetUser, invoker);
  console.log(`[DM Relay] Created relay channel ${channel.id} for ${targetUser.tag} (${targetUser.id})`);

  state.activeRelays[targetUser.id] = {
    channelId: channel.id,
    guildId: guild.id,
    startedBy: invoker.id,
    startedAt: new Date().toISOString(),
  };
  await saveState(state);
  console.log(`[DM Relay] Relay session started for ${targetUser.tag}. Active sessions: ${Object.keys(state.activeRelays).length}`);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('DM connection started')
    .setDescription(`Temporary channel created for **${targetUser.tag}**.`)
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
    console.log(`[DM Relay] No session found for user ${userId}`);
    return null;
  }

  console.log(`[DM Relay] Stopping relay for user ${userId}`);
  const guild = await client.guilds.fetch(session.guildId).catch(() => null);
  const channel = guild ? await guild.channels.fetch(session.channelId).catch(() => null) : null;

  if (channel) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('DM connection ended')] }).catch(() => null);
    await channel.delete().catch(() => null);
  }

  delete state.activeRelays[userId];
  await saveState(state);
  console.log(`[DM Relay] Relay stopped. Active sessions: ${Object.keys(state.activeRelays).length}`);
  return session;
}

async function handleReactionRoleButton(interaction) {
  if (!interaction.inGuild()) {
    await replyEphemeral(interaction, 'This button only works in a server.');
    return;
  }

  const [, roleId] = interaction.customId.split(':');
  const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));

  if (!role) {
    await replyEphemeral(interaction, 'That role no longer exists.');
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await replyEphemeral(interaction, 'Could not load your member profile.');
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role.id).catch(() => null);
    await replyEphemeral(interaction, `Removed role **${role.name}**.`);
    return;
  }

  await member.roles.add(role.id).catch(() => null);
  await replyEphemeral(interaction, `Added role **${role.name}**.`);
}

async function handleChatCommand(interaction) {
  const adminOnlyCommands = new Set([
    'admin',
    'moderationrule',
    'sendmessage',
    'say',
    'poll',
    'dmconnect',
    'dmend',
    'ban',
    'kick',
    'timeout',
    'untimeout',
    'purge',
    'warn',
    'warnings',
    'reactionrole',
    'dispenser',
  ]);

  if (adminOnlyCommands.has(interaction.commandName) && !isBotAdmin(interaction)) {
    await replyEphemeral(interaction, 'You do not have bot admin access for this command.');
    return;
  }

  if (interaction.commandName === 'ping') {
    await replyEphemeral(interaction, `Pong. API latency is ${Math.round(client.ws.ping)}ms.`);
    return;
  }

  if (interaction.commandName === 'about') {
    await replyEphemeral(interaction, 'G.GUI bot provides moderation tools, reaction roles, DM connections, and a configurable link dispenser panel.');
    return;
  }

  if (interaction.commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Command Categories')
      .setDescription('General, moderation, utility, reaction roles, and DM connection tools are available.')
      .addFields(
        { name: 'General', value: '`/ping` `/about` `/help` `/serverinfo` `/userinfo` `/avatar`' },
        { name: 'Utility', value: '`/say` `/poll`' },
        { name: 'Moderation', value: '`/ban` `/kick` `/timeout` `/untimeout` `/purge` `/warn` `/warnings` `/moderationrule`' },
        { name: 'DM Link', value: '`/dmconnect` `/dmend` `/dmstatus`' },
        { name: 'Reaction Roles', value: '`/reactionrole`' },
        { name: 'Global Admin', value: '`/admin addrole|removerole|listroles|adduser|removeuser|listusers`' },
        { name: 'Dispenser', value: '`/dispenser addlink|removelink|listlinks|panel`' },
      );

    await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'admin') {
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'addrole') {
      const role = interaction.options.getRole('role', true);

      if (!state.adminRoleIds.includes(role.id)) {
        state.adminRoleIds.push(role.id);
        await saveState(state);
      }

      await replyEphemeral(interaction, `Added ${role} to bot admin roles.`);
      return;
    }

    if (subcommand === 'removerole') {
      const role = interaction.options.getRole('role', true);
      state.adminRoleIds = state.adminRoleIds.filter((id) => id !== role.id);
      await saveState(state);
      await replyEphemeral(interaction, `Removed ${role} from bot admin roles.`);
      return;
    }

    if (subcommand === 'listroles') {
      if (state.adminRoleIds.length === 0) {
        await replyEphemeral(interaction, 'No bot admin roles configured.');
        return;
      }

      await replyEphemeral(interaction, `Bot admin roles:\n${state.adminRoleIds.map((id) => `- <@&${id}>`).join('\n')}`);
      return;
    }

    if (subcommand === 'adduser') {
      const user = interaction.options.getUser('user', true);

      if (!state.adminUserIds.includes(user.id)) {
        state.adminUserIds.push(user.id);
        await saveState(state);
      }

      await replyEphemeral(interaction, `Added ${user.tag} to bot admin users.`);
      return;
    }

    if (subcommand === 'removeuser') {
      const user = interaction.options.getUser('user', true);
      state.adminUserIds = state.adminUserIds.filter((id) => id !== user.id);
      await saveState(state);
      await replyEphemeral(interaction, `Removed ${user.tag} from bot admin users.`);
      return;
    }

    if (subcommand === 'listusers') {
      if (state.adminUserIds.length === 0) {
        await replyEphemeral(interaction, 'No bot admin users configured.');
        return;
      }

      await replyEphemeral(interaction, `Bot admin users:\n${state.adminUserIds.map((id) => `- <@${id}>`).join('\n')}`);
      return;
    }
  }

  if (interaction.commandName === 'moderationrule') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const group = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    if (group !== 'noinvite') {
      await replyEphemeral(interaction, 'Unknown moderation rule group.');
      return;
    }

    const guildRule = getGuildModerationRule(interaction.guildId);
    const noinviteRule = guildRule.noinvite;

    if (subcommand === 'enable') {
      noinviteRule.enabled = true;
      await saveState(state);
      await replyEphemeral(interaction, 'Invite-link moderation is now enabled.');
      return;
    }

    if (subcommand === 'disable') {
      noinviteRule.enabled = false;
      await saveState(state);
      await replyEphemeral(interaction, 'Invite-link moderation is now disabled.');
      return;
    }

    if (subcommand === 'timeout') {
      const action = interaction.options.getString('action', true);

      if (action === 'enable') {
        noinviteRule.timeout.enabled = true;
        await saveState(state);
        await replyEphemeral(interaction, `Noinvite timeout is now enabled (${formatDurationMinutes(noinviteRule.timeout.durationMs)}).`);
        return;
      }

      if (action === 'disable') {
        noinviteRule.timeout.enabled = false;
        await saveState(state);
        await replyEphemeral(interaction, 'Noinvite timeout is now disabled.');
        return;
      }

      if (action === 'edittime') {
        const minutes = interaction.options.getInteger('minutes');

        if (!minutes) {
          await replyEphemeral(interaction, 'You must provide `minutes` when using timeout action `edittime`.');
          return;
        }

        noinviteRule.timeout.durationMs = Math.min(minutes * 60_000, MAX_TIMEOUT_MS);
        await saveState(state);
        await replyEphemeral(interaction, `Noinvite timeout duration set to ${formatDurationMinutes(noinviteRule.timeout.durationMs)}.`);
        return;
      }
    }

    if (subcommand === 'reports') {
      const action = interaction.options.getString('action', true);
      const channel = interaction.options.getChannel('channel');

      if (action === 'enable') {
        if (!channel || !channel.isTextBased()) {
          await replyEphemeral(interaction, 'Provide a valid text channel when enabling reports.');
          return;
        }

        noinviteRule.reports.enabled = true;
        noinviteRule.reports.channelId = channel.id;
        await saveState(state);
        await replyEphemeral(interaction, `Noinvite reports enabled in ${channel}.`);
        return;
      }

      if (action === 'disable') {
        noinviteRule.reports.enabled = false;
        await saveState(state);
        await replyEphemeral(interaction, 'Noinvite reports are now disabled.');
        return;
      }
    }

    if (subcommand === 'message') {
      const warningMessage = interaction.options.getString('message', true).trim();

      if (!warningMessage) {
        await replyEphemeral(interaction, 'Warning message cannot be empty.');
        return;
      }

      noinviteRule.warningMessage = warningMessage;
      await saveState(state);
      await replyEphemeral(interaction, `Noinvite warning message updated to:\n${warningMessage}`);
      return;
    }

    if (subcommand === 'bypass') {
      const channel = interaction.options.getChannel('channel', true);

      if (!noinviteRule.bypassChannelIds.includes(channel.id)) {
        noinviteRule.bypassChannelIds.push(channel.id);
        await saveState(state);
      }

      await replyEphemeral(interaction, `${channel} is now bypassed for invite-link moderation.`);
      return;
    }

    if (subcommand === 'unbypass') {
      const channel = interaction.options.getChannel('channel', true);
      noinviteRule.bypassChannelIds = noinviteRule.bypassChannelIds.filter((id) => id !== channel.id);
      await saveState(state);
      await replyEphemeral(interaction, `${channel} is no longer bypassed for invite-link moderation.`);
      return;
    }

    if (subcommand === 'bypasslist') {
      if (noinviteRule.bypassChannelIds.length === 0) {
        await replyEphemeral(interaction, 'No bypass channels are configured for invite-link moderation.');
        return;
      }

      const lines = noinviteRule.bypassChannelIds.map((id) => `<#${id}>`).join('\n');
      await replyEphemeral(interaction, `Bypass channels for invite-link moderation:\n${lines}`);
      return;
    }

    if (subcommand === 'status') {
      const status = noinviteRule.enabled ? 'enabled' : 'disabled';
      const bypasses = noinviteRule.bypassChannelIds.length === 0 ? 'none' : noinviteRule.bypassChannelIds.map((id) => `<#${id}>`).join(', ');
      const timeoutStatus = noinviteRule.timeout.enabled ? `enabled (${formatDurationMinutes(noinviteRule.timeout.durationMs)})` : 'disabled';
      const reportsStatus = noinviteRule.reports.enabled
        ? `enabled in <#${noinviteRule.reports.channelId}>`
        : 'disabled';
      await replyEphemeral(interaction, `Invite-link moderation is **${status}**. Timeout: **${timeoutStatus}**. Reports: **${reportsStatus}**. Bypasses: ${bypasses}. Message: "${noinviteRule.warningMessage}".`);
      return;
    }
  }

  if (interaction.commandName === 'serverinfo') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(interaction.guild.name)
      .addFields(
        { name: 'Members', value: String(interaction.guild.memberCount), inline: true },
        { name: 'Channels', value: String(interaction.guild.channels.cache.size), inline: true },
        { name: 'Roles', value: String(interaction.guild.roles.cache.size), inline: true },
      )
      .setThumbnail(interaction.guild.iconURL() || null);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'userinfo') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`User: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: user.id, inline: false },
        { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
        { name: 'Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'N/A', inline: false },
      );

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'avatar') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`${user.tag} avatar`).setImage(user.displayAvatarURL({ size: 1024 }));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'say') {
    const channel = interaction.options.getChannel('channel', true);
    const message = interaction.options.getString('message', true);

    if (!channel.isTextBased()) {
      await replyEphemeral(interaction, 'That channel is not text-based.');
      return;
    }

    await channel.send({ content: message, allowedMentions: { parse: [] } });
    await replyEphemeral(interaction, `Sent message to ${channel}.`);
    return;
  }

  if (interaction.commandName === 'poll') {
    const question = interaction.options.getString('question', true);
    const options = [
      interaction.options.getString('option1', true),
      interaction.options.getString('option2', true),
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
    ].filter(Boolean);

    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const body = options.map((opt, idx) => `${emojis[idx]} ${opt}`).join('\n');

    const pollMessage = await interaction.channel.send({
      embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle(question).setDescription(body).setFooter({ text: `Poll by ${interaction.user.tag}` })],
    });

    for (let i = 0; i < options.length; i += 1) {
      await pollMessage.react(emojis[i]).catch(() => null);
    }

    await replyEphemeral(interaction, 'Poll created.');
    return;
  }

  if (interaction.commandName === 'sendmessage') {
    const targetUser = interaction.options.getUser('user', true);
    const message = interaction.options.getString('message', true);

    if (targetUser.bot) {
      await replyEphemeral(interaction, 'Cannot send messages to bots.');
      return;
    }

    await targetUser.send({ content: message }).catch((err) => null);
    await replyEphemeral(interaction, `Message sent to ${targetUser.tag}.`);
    return;
  }

  if (interaction.commandName === 'dmconnect') {
    const targetUser = interaction.options.getUser('user', true);
    const note = interaction.options.getString('note');

    if (targetUser.bot) {
      await replyEphemeral(interaction, 'Bots cannot join a DM connection.');
      return;
    }

    if (state.activeRelays[targetUser.id]) {
      await replyEphemeral(interaction, `A DM connection is already active for ${targetUser.tag}.`);
      return;
    }

    const dm = await targetUser.send({
      embeds: [buildRelayInviteEmbed(targetUser, interaction.user, note)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`dmconnect_accept:${interaction.user.id}:${interaction.guildId}`).setLabel('Accept DM connection').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('dmconnect_decline').setLabel('Decline').setStyle(ButtonStyle.Danger),
        ),
      ],
    });

    await replyEphemeral(interaction, `Sent a DM connection invitation to ${targetUser.tag}.`);
    await dm.react('📩').catch(() => null);
    return;
  }

  if (interaction.commandName === 'dmend') {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const session = await stopRelay(targetUser.id);

    if (!session) {
      await replyEphemeral(interaction, `No active DM connection exists for ${targetUser.tag}.`);
      return;
    }

    await replyEphemeral(interaction, `DM connection ended for ${targetUser.tag}.`);
    return;
  }

  if (interaction.commandName === 'dmstatus') {
    const activeCount = Object.keys(state.activeRelays).length;
    await replyEphemeral(interaction, `Active DM connections: ${activeCount}`);
    return;
  }

  if (interaction.commandName === 'dispenser') {
    if (!interaction.inGuild()) {
      await replyEphemeral(interaction, 'The dispenser command can only be used in a server.');
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === 'howto') {
      const guideEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Dispenser Setup Guide')
        .setDescription('Quick setup flow for a named dispenser panel.')
        .addFields(
          {
            name: '1. Pick a panel name',
            value: 'Use one name consistently, e.g. `games` or `tools`.',
          },
          {
            name: '2. Add links',
            value: 'Use `/dispenser addlink panel:<name> url:<url> filter:<f1,f2> type:<type>`.',
          },
          {
            name: '3. Bulk add links (optional)',
            value: 'Use `/dispenser bulkadd panel:<name> filter:<...> type:<...> urls:<one per line>` or upload a `.txt` file.',
          },
          {
            name: '4. Set limits (optional)',
            value: 'Use `/dispenser setlimit panel:<name> period:<day|week|month> limit:<number> [role]`.',
          },
          {
            name: '5. Post panel',
            value: 'Use `/dispenser panel panel:<name> title:<optional> description:<optional>`.',
          },
          {
            name: '6. Add or remove links later',
            value: 'Use `/dispenser addlink`, `/dispenser bulkadd`, `/dispenser removelink`, and `/dispenser listlinks` with the same panel name.',
          },
          {
            name: 'Important',
            value: 'Every time you update links/filters/types for a panel, repost it with `/dispenser panel panel:<name> ...` so the live panel options are refreshed.',
          },
        );

      await interaction.reply({ embeds: [guideEmbed], flags: MessageFlags.Ephemeral });
      return;
    }

    const panelName = normalizePanelName(interaction.options.getString('panel', true));

    if (!panelName) {
      await replyEphemeral(interaction, 'Panel name cannot be empty.');
      return;
    }

    if (subcommand === 'addlink') {
      const url = interaction.options.getString('url', true).trim();
      const filters = parseFilterList(interaction.options.getString('filter', true));
      const type = normalizeCategory(interaction.options.getString('type', true));

      if (filters.length === 0) {
        await replyEphemeral(interaction, 'Provide at least one filter. You can comma-separate multiple filters.');
        return;
      }

      try {
        new URL(url);
      } catch {
        await replyEphemeral(interaction, 'Invalid URL. Please provide a full URL including protocol (https://...).');
        return;
      }

      const entry = {
        id: buildLinkId(),
        panel: panelName,
        url,
        filters,
        type,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      };

      state.dispenserLinks.push(entry);
      await saveState(state);

      await replyEphemeral(interaction, `Saved link \`${entry.id}\` in panel \`${panelName}\` for filters \`${filters.join(', ')}\` and type \`${type}\`.`);
      return;
    }

    if (subcommand === 'bulkadd') {
      const urlsRaw = interaction.options.getString('urls');
      const file = interaction.options.getAttachment('file');
      const filters = parseFilterList(interaction.options.getString('filter', true));
      const type = normalizeCategory(interaction.options.getString('type', true));

      if (filters.length === 0) {
        await replyEphemeral(interaction, 'Provide at least one filter. You can comma-separate multiple filters.');
        return;
      }

      if (!urlsRaw && !file) {
        await replyEphemeral(interaction, 'Provide URLs text or upload a .txt file with one URL per line.');
        return;
      }

      let combinedRaw = urlsRaw ?? '';

      if (file) {
        const isTextLike = (file.contentType ?? '').includes('text') || file.name.toLowerCase().endsWith('.txt');
        if (!isTextLike) {
          await replyEphemeral(interaction, 'Attachment must be a text file (.txt).');
          return;
        }

        const response = await fetch(file.url).catch(() => null);
        if (!response || !response.ok) {
          await replyEphemeral(interaction, 'Could not download the attachment. Try uploading again.');
          return;
        }

        const fileText = await response.text();
        combinedRaw = combinedRaw ? `${combinedRaw}\n${fileText}` : fileText;
      }

      const urls = [...new Set(combinedRaw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];

      if (urls.length === 0) {
        await replyEphemeral(interaction, 'No URLs detected. Provide one URL per line.');
        return;
      }

      if (urls.length > 175) {
        await replyEphemeral(interaction, `You can bulk add at most 175 links at once. You provided ${urls.length}.`);
        return;
      }

      let added = 0;
      let invalid = 0;
      let skipped = 0;

      for (const url of urls) {
        try {
          new URL(url);
        } catch {
          invalid += 1;
          continue;
        }

        const duplicate = state.dispenserLinks.some((entry) => {
          const samePanel = entry.panel === panelName;
          const sameUrl = entry.url === url;
          const sameType = entry.type === type;
          const sameFilters = JSON.stringify([...(entry.filters ?? [])].sort()) === JSON.stringify([...filters].sort());
          return samePanel && sameUrl && sameType && sameFilters;
        });

        if (duplicate) {
          skipped += 1;
          continue;
        }

        state.dispenserLinks.push({
          id: buildLinkId(),
          panel: panelName,
          url,
          filters,
          type,
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
        });
        added += 1;
      }

      if (added > 0) {
        await saveState(state);
      }

      await replyEphemeral(interaction, `Bulk add complete for panel \`${panelName}\`. Added: ${added}, Skipped duplicates: ${skipped}, Invalid URLs: ${invalid}.`);
      return;
    }

    if (subcommand === 'removelink') {
      const id = interaction.options.getString('id')?.trim();
      const url = interaction.options.getString('url')?.trim();

      if (!id && !url) {
        await replyEphemeral(interaction, 'Provide either an id or a url to remove.');
        return;
      }

      const previousLength = state.dispenserLinks.length;
      state.dispenserLinks = state.dispenserLinks.filter((entry) => {
        if (entry.panel !== panelName) {
          return true;
        }

        if (id && entry.id === id) {
          return false;
        }

        if (url && entry.url === url) {
          return false;
        }

        return true;
      });

      if (state.dispenserLinks.length === previousLength) {
        await replyEphemeral(interaction, 'No matching link found for the provided id/url.');
        return;
      }

      await saveState(state);
      await replyEphemeral(interaction, `Matching link(s) removed from panel \`${panelName}\`.`);
      return;
    }

    if (subcommand === 'listlinks') {
      const filterOption = interaction.options.getString('filter');
      const typeOption = interaction.options.getString('type');
      const filter = filterOption ? normalizeCategory(filterOption) : null;
      const type = typeOption ? normalizeCategory(typeOption) : null;

      const filtered = state.dispenserLinks.filter((entry) => {
        if (entry.panel !== panelName) {
          return false;
        }

        const filterMatch = !filter || (entry.filters ?? []).includes(filter);
        const typeMatch = !type || entry.type === type;
        return filterMatch && typeMatch;
      });

      if (filtered.length === 0) {
        await replyEphemeral(interaction, 'No links found for that filter/type selection.');
        return;
      }

      const preview = filtered.slice(0, 20).map((entry) => `• \`${entry.id}\` | ${(entry.filters ?? []).join(', ')}/${entry.type} | ${entry.url}`);
      const suffix = filtered.length > 20 ? `\n...and ${filtered.length - 20} more.` : '';
      await replyEphemeral(interaction, `Stored links in \`${panelName}\` (${filtered.length}):\n${preview.join('\n')}${suffix}`);
      return;
    }

    if (subcommand === 'panel') {
      const panelLinks = state.dispenserLinks.filter((entry) => entry.panel === panelName);

      if (panelLinks.length === 0) {
        await replyEphemeral(interaction, 'No links exist yet. Add links first with `/dispenser addlink`.');
        return;
      }

      const title = interaction.options.getString('title') ?? 'Link Dispenser';
      const description = interaction.options.getString('description') ?? 'Choose a filter and type, then click Dispense Link.';
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .setDescription(description)
        .addFields(
          { name: 'Available filters', value: String(getDispenserCategoryOptions(panelName, 'filter').filter((v) => v !== 'any').length), inline: true },
          { name: 'Available types', value: String(getDispenserCategoryOptions(panelName, 'type').filter((v) => v !== 'any').length), inline: true },
        );

      embed.addFields({ name: 'Panel', value: panelName, inline: false });

      const panelMessage = await interaction.channel.send({ embeds: [embed], components: buildDispenserPanelComponents(panelName) });
      state.dispenserPanelMessages[panelMessage.id] = panelName;
      await saveState(state);
      await replyEphemeral(interaction, 'Dispenser panel posted.');
      return;
    }

    if (subcommand === 'setlimit') {
      const period = interaction.options.getString('period', true);
      const limit = interaction.options.getInteger('limit', true);
      const role = interaction.options.getRole('role');
      const targetType = role ? 'role' : 'everyone';
      const targetId = role ? role.id : null;

      const existing = state.dispenserLimits.find(
        (entry) => entry.panel === panelName && entry.period === period && entry.targetType === targetType && entry.targetId === targetId,
      );

      if (existing) {
        existing.limit = limit;
      } else {
        state.dispenserLimits.push({
          id: buildLimitId(),
          panel: panelName,
          period,
          limit,
          targetType,
          targetId,
          createdBy: interaction.user.id,
        });
      }

      await saveState(state);
      await replyEphemeral(interaction, `Set ${period} limit to ${limit} for ${role ? role.toString() : '@everyone'} in panel \`${panelName}\`.`);
      return;
    }

    if (subcommand === 'removelimit') {
      const period = interaction.options.getString('period', true);
      const role = interaction.options.getRole('role');
      const targetType = role ? 'role' : 'everyone';
      const targetId = role ? role.id : null;
      const previousLength = state.dispenserLimits.length;

      state.dispenserLimits = state.dispenserLimits.filter(
        (entry) => !(entry.panel === panelName && entry.period === period && entry.targetType === targetType && entry.targetId === targetId),
      );

      if (state.dispenserLimits.length === previousLength) {
        await replyEphemeral(interaction, `No ${period} limit found for ${role ? role.toString() : '@everyone'} in panel \`${panelName}\`.`);
        return;
      }

      await saveState(state);
      await replyEphemeral(interaction, `Removed ${period} limit for ${role ? role.toString() : '@everyone'} in panel \`${panelName}\`.`);
      return;
    }

    if (subcommand === 'listlimits') {
      const panelLimits = state.dispenserLimits.filter((entry) => entry.panel === panelName);

      if (panelLimits.length === 0) {
        await replyEphemeral(interaction, 'No dispenser limits configured.');
        return;
      }

      const lines = panelLimits
        .map((entry) => `• ${entry.period}: ${entry.limit} for ${entry.targetType === 'everyone' ? '@everyone' : `<@&${entry.targetId}>`}`)
        .join('\n');

      await replyEphemeral(interaction, `Configured limits for \`${panelName}\`:\n${lines}`);
      return;
    }
  }

  if (interaction.commandName === 'ban') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.guild.members.ban(targetUser, { reason });
    state.bannedUsers.push({ id: targetUser.id, tag: targetUser.tag, reason, bannedAt: new Date().toISOString() });
    await saveState(state);
    await stopRelay(targetUser.id);

    await interaction.reply({ content: `Banned **${targetUser.tag}**. Reason: ${reason}` });
    return;
  }

  if (interaction.commandName === 'kick') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await replyEphemeral(interaction, 'User is not in this server.');
      return;
    }

    await member.kick(reason);
    await interaction.reply({ content: `Kicked **${targetUser.tag}**. Reason: ${reason}` });
    return;
  }

  if (interaction.commandName === 'timeout') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const durationRaw = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const durationMs = parseDurationToMs(durationRaw);

    if (!durationMs) {
      await replyEphemeral(interaction, 'Invalid duration. Use format like 10m, 2h, 1d (max 28d).');
      return;
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await replyEphemeral(interaction, 'User is not in this server.');
      return;
    }

    await member.timeout(durationMs, reason);
    await interaction.reply({ content: `Timed out **${targetUser.tag}** for ${durationRaw}. Reason: ${reason}` });
    return;
  }

  if (interaction.commandName === 'untimeout') {
    if (!interaction.guild) {
      await replyEphemeral(interaction, 'This command only works in a server.');
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await replyEphemeral(interaction, 'User is not in this server.');
      return;
    }

    await member.timeout(null);
    await interaction.reply({ content: `Removed timeout for **${targetUser.tag}**.` });
    return;
  }

  if (interaction.commandName === 'purge') {
    const amount = interaction.options.getInteger('amount', true);

    if (!interaction.channel || !interaction.channel.isTextBased()) {
      await replyEphemeral(interaction, 'This command can only run in a text channel.');
      return;
    }

    await interaction.channel.bulkDelete(amount, true);
    await replyEphemeral(interaction, `Deleted up to ${amount} messages.`);
    return;
  }

  if (interaction.commandName === 'warn') {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    state.warnings[targetUser.id] ??= [];
    state.warnings[targetUser.id].push({ reason, moderatorId: interaction.user.id, at: new Date().toISOString() });
    await saveState(state);

    await interaction.reply({ content: `Warned **${targetUser.tag}**. Reason: ${reason}` });
    return;
  }

  if (interaction.commandName === 'warnings') {
    const targetUser = interaction.options.getUser('user', true);
    const warnings = state.warnings[targetUser.id] ?? [];

    if (warnings.length === 0) {
      await replyEphemeral(interaction, `${targetUser.tag} has no warnings.`);
      return;
    }

    const lines = warnings.slice(-10).map((entry, idx) => `${idx + 1}. ${entry.reason} - <@${entry.moderatorId}> (<t:${Math.floor(new Date(entry.at).getTime() / 1000)}:R>)`);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle(`Warnings for ${targetUser.tag}`).setDescription(lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'reactionrole') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role', true);
    const label = interaction.options.getString('label') ?? `Get ${role.name}`;
    const emoji = interaction.options.getString('emoji');

    if (!channel.isTextBased()) {
      await replyEphemeral(interaction, 'Target channel must be text-based.');
      return;
    }

    const button = new ButtonBuilder()
      .setCustomId(`rr_toggle:${role.id}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);

    if (emoji) {
      button.setEmoji(emoji);
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('Reaction Roles').setDescription('Click the button below to toggle your role.')],
      components: [new ActionRowBuilder().addComponents(button)],
    });

    await replyEphemeral(interaction, `Reaction role panel created in ${channel}.`);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== 'dispenser_filter' && interaction.customId !== 'dispenser_type') {
        return;
      }

      const panelName = state.dispenserPanelMessages[interaction.message.id];
      if (!panelName) {
        await interaction.reply({ content: 'This dispenser panel is no longer configured.', flags: MessageFlags.Ephemeral });
        return;
      }

      const selectionKey = `${interaction.message.id}:${interaction.user.id}`;
      const current = dispenserSelections.get(selectionKey) ?? { filter: 'any', type: 'any' };

      if (interaction.customId === 'dispenser_filter') {
        current.filter = interaction.values[0];
      } else {
        current.type = interaction.values[0];
      }

      dispenserSelections.set(selectionKey, current);
      await interaction.reply({
        content: `Selection updated. Filter: **${current.filter}** | Type: **${current.type}**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('rr_toggle:')) {
        await handleReactionRoleButton(interaction);
        return;
      }

      if (interaction.customId === 'dispenser_dispense') {
        if (!interaction.inGuild()) {
          await interaction.reply({ content: 'This dispenser panel can only be used in a server.', flags: MessageFlags.Ephemeral });
          return;
        }

        const panelName = state.dispenserPanelMessages[interaction.message.id];
        if (!panelName) {
          await interaction.reply({ content: 'This dispenser panel is no longer configured.', flags: MessageFlags.Ephemeral });
          return;
        }

        const selectionKey = `${interaction.message.id}:${interaction.user.id}`;
        const selected = dispenserSelections.get(selectionKey) ?? { filter: 'any', type: 'any' };

        trimUsageHistory();

        const roleLimits = state.dispenserLimits.filter((entry) => {
          if (entry.panel !== panelName || entry.targetType !== 'role') {
            return false;
          }

          return interaction.member?.roles?.cache?.has?.(entry.targetId) ?? false;
        });

        const everyoneLimit = state.dispenserLimits.find(
          (entry) => entry.panel === panelName && entry.targetType === 'everyone',
        );

        const applicableLimits = roleLimits.length > 0 ? roleLimits : everyoneLimit ? [everyoneLimit] : [];

        for (const limitEntry of applicableLimits) {
          const usage = getUsageCountForPeriod(interaction.user.id, panelName, limitEntry.period);

          if (usage >= limitEntry.limit) {
            await interaction.reply({
              content: `You reached your ${limitEntry.period} dispenser limit (${limitEntry.limit}) for ${limitEntry.targetType === 'everyone' ? '@everyone' : `<@&${limitEntry.targetId}>`}.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
        }

        const matches = state.dispenserLinks.filter((entry) => {
          if (entry.panel !== panelName) {
            return false;
          }

          const filterMatch = selected.filter === 'any' || (entry.filters ?? []).includes(selected.filter);
          const typeMatch = selected.type === 'any' || entry.type === selected.type;
          return filterMatch && typeMatch;
        });

        if (matches.length === 0) {
          await interaction.reply({
            content: 'No links available for this specification',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const chosen = chooseDispenserLink(panelName, selected, matches);
        state.dispenserUsage.push({ userId: interaction.user.id, panel: panelName, timestamp: Date.now() });
        trimUsageHistory();
        await saveState(state);

        await interaction.reply({
          content: `Here is your link (${(chosen.filters ?? []).join(', ')}/${chosen.type}): ${chosen.url}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const [action, requesterId, guildId] = interaction.customId.split(':');

      if (action !== 'dmconnect_accept' && action !== 'dmconnect_decline') {
        return;
      }

      if (action === 'dmconnect_decline') {
        await interaction.update({ content: 'You declined the DM connection request.', components: [] });
        return;
      }

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        await interaction.update({ content: 'Guild not found.', components: [] }).catch(() => null);
        return;
      }

      const invoker = await client.users.fetch(requesterId).catch(() => null);
      const channel = await startRelay(guild, interaction.user, invoker ?? { id: requesterId, tag: 'Unknown' }, null);

      if (!channel) {
        await interaction.update({ content: 'A DM connection is already active for you.', components: [] }).catch(() => null);
        return;
      }

      await interaction.update({ content: `DM connection accepted. Channel created in **${guild.name}**.`, components: [] }).catch(() => null);
      return;
    }

    if (interaction.isChatInputCommand()) {
      await handleChatCommand(interaction);
    }
  } catch (error) {
    console.error('Interaction handling failed:', error);
    await replyEphemeral(interaction, 'Something went wrong while handling that action.');
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) {
      return;
    }

    if (message.guild) {
      const guildRuleWrapper = getGuildModerationRule(message.guild.id);
      const guildRule = guildRuleWrapper.noinvite;
      if (guildRule.enabled && !guildRule.bypassChannelIds.includes(message.channelId) && isInviteLinkMessage(message.content ?? '')) {
        const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));

        await message.reply({
          content: guildRule.warningMessage,
          allowedMentions: { repliedUser: false },
        }).catch(() => null);

        if (member && guildRule.timeout.enabled) {
          await member.timeout(guildRule.timeout.durationMs, 'Sent a Discord invite link').catch(() => null);
        }

        if (guildRule.reports.enabled && guildRule.reports.channelId) {
          const reportChannel = message.guild.channels.cache.get(guildRule.reports.channelId)
            ?? (await message.guild.channels.fetch(guildRule.reports.channelId).catch(() => null));

          if (reportChannel?.isTextBased()) {
            const reportEmbed = new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('Noinvite Rule Triggered')
              .addFields(
                { name: 'User', value: `${message.author} (${message.author.tag})`, inline: false },
                { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
                { name: 'Timeout Applied', value: guildRule.timeout.enabled ? formatDurationMinutes(guildRule.timeout.durationMs) : 'No', inline: true },
              )
              .setDescription(truncate(message.content?.trim() || '*No text content*', 1000))
              .setTimestamp(new Date());

            await reportChannel.send({ embeds: [reportEmbed] }).catch(() => null);
          }
        }

        return;
      }

      const relaySessionEntry = findRelaySessionByChannelId(message.channelId);

      if (!relaySessionEntry) {
        console.log(`[DM Relay] Message in channel ${message.channelId}, but not a relay channel. Checking active relays: ${Object.keys(state.activeRelays).map((id) => `${id}=${state.activeRelays[id].channelId}`).join(', ')}`);
        return;
      }

      const [targetUserId] = relaySessionEntry;
      console.log(`[DM Relay] Forwarding guild message from ${message.author.tag} to DM user ${targetUserId}`);
      const dmUser = await client.users.fetch(targetUserId).catch((err) => {
        console.error(`[DM Relay] Failed to fetch DM user ${targetUserId}: ${err.message}`);
        return null;
      });

      if (!dmUser) {
        console.error(`[DM Relay] Could not fetch user ${targetUserId}`);
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: `Message from ${message.author.tag} in relay`, iconURL: message.author.displayAvatarURL() })
        .setDescription(truncate(message.content?.trim() || '*No text content*', 4096))
        .setTimestamp(new Date());

      await dmUser.send({ embeds: [embed] }).catch((err) => {
        console.error(`[DM Relay] Failed to send DM to ${dmUser.tag}: ${err.message}`);
      });
      return;
    }

    const userRelaySession = state.activeRelays[message.author.id];

    if (!userRelaySession) {
      console.log(`[DM Relay] No relay session for DM user ${message.author.tag} (${message.author.id}). Active sessions: ${Object.keys(state.activeRelays).join(', ')}`);
      return;
    }

    console.log(`[DM Relay] Forwarding DM from ${message.author.tag} to relay channel ${userRelaySession.channelId}`);
    const guild = await client.guilds.fetch(userRelaySession.guildId).catch((err) => {
      console.error(`[DM Relay] Failed to fetch guild ${userRelaySession.guildId}: ${err.message}`);
      return null;
    });
    const channel = guild ? await guild.channels.fetch(userRelaySession.channelId).catch((err) => {
      console.error(`[DM Relay] Failed to fetch channel ${userRelaySession.channelId}: ${err.message}`);
      return null;
    }) : null;

    if (!channel || !channel.isTextBased()) {
      console.error(`[DM Relay] Channel ${userRelaySession.channelId} not found or not text-based`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: `${message.author.tag} (DM)`, iconURL: message.author.displayAvatarURL() })
      .setDescription(truncate(message.content?.trim() || '*No text content*', 4096))
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] }).catch((err) => {
      console.error(`[DM Relay] Failed to send message to relay channel: ${err.message}`);
    });
    console.log(`[DM Relay] Successfully forwarded DM to relay channel`);
  } catch (error) {
    console.error('Message relay failed:', error);
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${commandData.length} slash commands.`);
  console.log(`Active DM connections: ${Object.keys(state.activeRelays).length}`);
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
    return;
  }

  try {
    console.log('Attempting to login with Discord token...');
    await client.login(token);
    console.log('Discord client login call completed.');
  } catch (error) {
    console.error('Discord login threw an exception:', error.message);
    console.error('Full error:', error);
  }
}

await startBot();
