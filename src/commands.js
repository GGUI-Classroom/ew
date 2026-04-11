import { ChannelType, PermissionsBitField, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is alive.'),
  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show what this bot can do.'),
  new SlashCommandBuilder()
    .setName('relayrequest')
    .setDescription('Send a consent-based DM relay invitation to create a temporary channel.')
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
    .setDescription('End an active relay session and delete the channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose relay should be ended.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to ban.')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Reason for the ban.')
        .setRequired(false)
        .setMaxLength(512),
    ),
];

export const commandData = commandDefinitions.map((command) => command.toJSON());
