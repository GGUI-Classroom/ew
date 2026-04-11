import { ChannelType, PermissionsBitField, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder().setName('ping').setDescription('Check whether the bot is alive.'),
  new SlashCommandBuilder().setName('about').setDescription('Show what this bot can do.'),
  new SlashCommandBuilder().setName('help').setDescription('Show command categories and usage.'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show information about this server.'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user.')
    .addUserOption((option) => option.setName('user').setDescription('Target user').setRequired(false)),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user avatar.')
    .addUserOption((option) => option.setName('user').setDescription('Target user').setRequired(false)),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a quick poll message.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addStringOption((option) => option.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(200))
    .addStringOption((option) => option.setName('option1').setDescription('Option 1').setRequired(true).setMaxLength(80))
    .addStringOption((option) => option.setName('option2').setDescription('Option 2').setRequired(true).setMaxLength(80))
    .addStringOption((option) => option.setName('option3').setDescription('Option 3').setRequired(false).setMaxLength(80))
    .addStringOption((option) => option.setName('option4').setDescription('Option 4').setRequired(false).setMaxLength(80)),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message to a channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Target channel')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder()
    .setName('dmconnect')
    .setDescription('Create a DM connection with a user in a private channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) => option.setName('user').setDescription('The user to connect with.').setRequired(true))
    .addStringOption((option) => option.setName('note').setDescription('Optional context note').setRequired(false).setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('dmend')
    .setDescription('End a DM connection and delete the channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) => option.setName('user').setDescription('The user whose connection should be ended').setRequired(false)),
  new SlashCommandBuilder().setName('dmstatus').setDescription('Show active DM connection counts.'),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
    .addUserOption((option) => option.setName('user').setDescription('The user to ban.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban').setRequired(false).setMaxLength(512)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
    .addUserOption((option) => option.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick').setRequired(false).setMaxLength(512)),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user for a duration like 10m, 2h, 1d.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption((option) => option.setName('duration').setDescription('Duration (e.g. 10m, 2h, 1d)').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(512)),
  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a user.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('User to remove timeout from').setRequired(true)),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of recent messages (1-100).')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addIntegerOption((option) => option.setName('amount').setDescription('How many messages to delete').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user and store warning history.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Warning reason').setRequired(true).setMaxLength(512)),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('List warnings for a user.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create a reaction-role button panel in a channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Where to send the reaction role panel')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addRoleOption((option) => option.setName('role').setDescription('Role to toggle').setRequired(true))
    .addStringOption((option) => option.setName('label').setDescription('Button label').setRequired(false).setMaxLength(80))
    .addStringOption((option) => option.setName('emoji').setDescription('Optional emoji').setRequired(false).setMaxLength(20)),
];

export const commandData = commandDefinitions.map((command) => command.toJSON());
