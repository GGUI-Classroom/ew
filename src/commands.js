import { ChannelType, PermissionsBitField, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is alive.'),
  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show what this bot can do.'),
  new SlashCommandBuilder()
    .setName('dmconnect')
    .setDescription('Create a DM connection with a user in a private channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to connect with.')
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
    .setName('dmend')
    .setDescription('End a DM connection and delete the channel.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose DM connection should be ended.')
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
