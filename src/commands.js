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
  new SlashCommandBuilder()
    .setName('moderationrule')
    .setDescription('Manage server moderation rules.')
    .addSubcommandGroup((group) =>
      group
        .setName('noticket')
        .setDescription('Invite link moderation rule.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('enable')
            .setDescription('Enable invite-link warnings and 1 minute timeouts.'),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('disable')
            .setDescription('Disable invite-link warnings and 1 minute timeouts.'),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('bypass')
            .setDescription('Add a channel bypass for invite-link moderation.')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Channel to bypass')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('unbypass')
            .setDescription('Remove a channel bypass for invite-link moderation.')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Channel to remove from bypass list')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum),
            ),
        )
        .addSubcommand((subcommand) => subcommand.setName('bypasslist').setDescription('List bypassed channels.'))
        .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show invite-link moderation rule status.')),
    ),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Manage bot-wide admin access by role or user id.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('addrole')
        .setDescription('Grant bot admin access to a role.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to grant').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('removerole')
        .setDescription('Remove bot admin access from a role.')
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName('listroles').setDescription('List role-based bot admins.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('adduser')
        .setDescription('Grant bot admin access to a user id.')
        .addUserOption((option) => option.setName('user').setDescription('User to grant').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('removeuser')
        .setDescription('Remove bot admin access from a user id.')
        .addUserOption((option) => option.setName('user').setDescription('User to remove').setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName('listusers').setDescription('List user-id bot admins.')),
  new SlashCommandBuilder()
    .setName('dispenser')
    .setDescription('Manage and use the link dispenser system.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('addlink')
        .setDescription('Add a link for a filter and type.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('url').setDescription('The URL to dispense').setRequired(true).setMaxLength(500))
        .addStringOption((option) => option.setName('filter').setDescription('Filter category (comma-separate for multiple)').setRequired(true).setMaxLength(200))
        .addStringOption((option) => option.setName('type').setDescription('Type category').setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bulkadd')
        .setDescription('Add multiple links at once (one URL per line).')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('filter').setDescription('Filter categories (comma-separated)').setRequired(true).setMaxLength(200))
        .addStringOption((option) => option.setName('type').setDescription('Type category').setRequired(true).setMaxLength(50))
        .addStringOption((option) =>
          option
            .setName('urls')
            .setDescription('URLs, one per line (optional if file is provided)')
            .setRequired(false)
            .setMaxLength(4000),
        )
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('Optional .txt file with one URL per line')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('removelink')
        .setDescription('Remove a saved dispenser link by id or url.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('id').setDescription('Link id from /dispenser listlinks').setRequired(false).setMaxLength(32))
        .addStringOption((option) => option.setName('url').setDescription('Exact URL to remove').setRequired(false).setMaxLength(500)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('listlinks')
        .setDescription('List saved dispenser links.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('filter').setDescription('Optional filter to narrow list').setRequired(false).setMaxLength(50))
        .addStringOption((option) => option.setName('type').setDescription('Optional type to narrow list').setRequired(false).setMaxLength(50)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post a named dispenser panel with filter/type selectors.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) => option.setName('title').setDescription('Panel title').setRequired(false).setMaxLength(100))
        .addStringOption((option) => option.setName('description').setDescription('Panel description').setRequired(false).setMaxLength(300)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setlimit')
        .setDescription('Set dispense limits per day/week/month for everyone or a role.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Quota period')
            .setRequired(true)
            .addChoices(
              { name: 'day', value: 'day' },
              { name: 'week', value: 'week' },
              { name: 'month', value: 'month' },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Max links per user for this period')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(5000),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Target role (leave empty to target @everyone)')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('removelimit')
        .setDescription('Remove a dispense limit for everyone or a role.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50))
        .addStringOption((option) =>
          option
            .setName('period')
            .setDescription('Quota period')
            .setRequired(true)
            .addChoices(
              { name: 'day', value: 'day' },
              { name: 'week', value: 'week' },
              { name: 'month', value: 'month' },
            ),
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Target role (leave empty to target @everyone)')
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('listlimits')
        .setDescription('List configured dispenser limits for a panel.')
        .addStringOption((option) => option.setName('panel').setDescription('Panel name').setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('howto')
        .setDescription('Show a quick step-by-step dispenser setup guide.'),
    ),
];

export const commandData = commandDefinitions.map((command) => command.toJSON());
