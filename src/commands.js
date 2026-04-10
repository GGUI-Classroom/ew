import { ChannelType, PermissionsBitField, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is alive.'),
  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show what this bot can do.'),
  new SlashCommandBuilder()
    .setName('setrelaychannel')
    .setDescription('Set the text channel used for forwarded relay messages.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel that receives forwarded DM relay messages.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('relayrequest')
    .setDescription('Send a consent-based DM relay invitation to a user.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to invite into the relay.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('note')
        .setDescription('Optional context to include in the invitation.')
        .setRequired(false)
        .setMaxLength(200),
    ),
  new SlashCommandBuilder()
    .setName('relayend')
    .setDescription('End an active relay session.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose relay should be ended.')
        .setRequired(false),
    ),
];

export const commandData = commandDefinitions.map((command) => command.toJSON());
