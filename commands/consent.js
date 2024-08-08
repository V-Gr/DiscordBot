const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { handleConsentYes, handleConsentNo } = require('../events/consentHandler');

const SPECIFIC_CHANNEL_IDS = ['', ''];

module.exports = {
  name: 'consent',
  description: 'Give or withdraw consent to store and process your data for music recommendations',
  async execute(message, args) {
    if (message.guild && SPECIFIC_CHANNEL_IDS.includes(message.channel.id)) {
      try {
        if (!message.guild.me.permissions.has('SEND_MESSAGES') || !message.guild.me.permissions.has('MANAGE_MESSAGES')) {
          return message.reply('I do not have the required permissions to execute this command.');
        }

        await message.delete();
        await sendConsentMessage(message.author, message);
      } catch (error) {
        console.error('Error executing consent command:', error);
        await message.author.send('There was an error executing the consent command.').catch(err => {
          console.error('Error sending error message:', err);
        });
      }
    } else if (!message.guild) {
      try {
        await sendConsentMessage(message.author, message);
      } catch (error) {
        console.error('Error executing consent command:', error);
        await message.reply('There was an error executing the consent command.').catch(err => {
          console.error('Error sending error message:', err);
        });
      }
    }
  },
};

async function sendConsentMessage(user, contextMessage) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('consent_yes')
        .setLabel('YES')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('consent_no')
        .setLabel('NO')
        .setStyle(ButtonStyle.Danger)
    );

  const consentMessage = await user.send({
    content: 'To enable all features of this bot, your consent to store and process your data is needed. Type `!consent` to provide or revoke your consent. Without consent, some features may be disabled.',
    components: [row]
  });

  const filter = interaction => interaction.customId.startsWith('consent_') && interaction.user.id === user.id;

  const interaction = await consentMessage.awaitMessageComponent({ filter, time: 40000 }).catch(() => null);

  if (interaction) {
    await handleConsentInteraction(interaction, user.id, contextMessage);
  }

  const disabledRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('consent_yes')
        .setLabel('YES')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('consent_no')
        .setLabel('NO')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

  await consentMessage.edit({ components: [disabledRow] }).catch(error => {
    console.error('Error disabling buttons:', error);
  });
}

async function handleConsentInteraction(interaction, userId, contextMessage) {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (interaction.customId === 'consent_yes') {
      await handleConsentYes(interaction, userId);
    } else if (interaction.customId === 'consent_no') {
      await handleConsentNo(interaction, userId);
    }

    await interaction.editReply({ content: 'Your response has been recorded.', components: [] });
  } catch (error) {
    console.error('Error handling interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'There was an error processing your interaction.', ephemeral: true });
      } catch (replyError) {
        console.error('Error replying to interaction:', replyError);
      }
    }
  }
}
