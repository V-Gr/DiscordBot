const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');

const EXPIRATION_TIME = 60000;
const GAME_COOLDOWN = 41400;
const MINI_GAMES_COOLDOWN = 3000;
const generalChannelID = '';
const migamesChannelID = '';
const players = new Map();
const cooldowns = new Map();
const userCooldownMessages = new Map();

module.exports = { players, cooldowns, userCooldownMessages };

let expirationTimeoutId;

module.exports = {
  name: 'rps',
  description: 'Rock Paper Scissors',
  async execute(message) {
    if (!isChannelAllowed(message.channel.id)) return;

    const now = Date.now();
    const cooldown = getCooldown(message.channel.id);
    if (isOnCooldown(message.author.id, now, message, cooldown)) return;

    if (players.has(message.author.id)) return;

    addPlayer(message.author.id);

    if (players.size === 1) {
      await waitForSecondPlayer();
    } else if (players.size === 2) {
      await startGame(message);
    }
  },
  interactionCreate: {
    async execute(interaction) {
      if (interaction.isButton()) {
        try {
          if (!interaction.replied && !interaction.deferred) await interaction.deferUpdate();
        } catch (error) {
          handleError(error, interaction);
          return;
        }
        await handleGameInteraction(interaction);
      }
    }
  }
};

function isChannelAllowed(channelId) {
  return channelId === generalChannelID || channelId === migamesChannelID;
}

function getCooldown(channelId) {
  return channelId === migamesChannelID ? MINI_GAMES_COOLDOWN : GAME_COOLDOWN;
}

function isOnCooldown(userId, now, message, cooldownAmount) {
  const expiration = cooldowns.get(userId) + cooldownAmount;
  if (cooldowns.has(userId) && now < expiration) {
    const timeLeft = ((expiration - now) / 1000).toFixed(1);
    if (!userCooldownMessages.has(userId)) {
      userCooldownMessages.set(userId, true);
      message.reply(`please wait ${timeLeft} more second(s) before reusing the command.`).then(() => {
        setTimeout(() => userCooldownMessages.delete(userId), expiration - now);
      });
    }
    return true;
  }
  cooldowns.set(userId, now);
  setTimeout(() => cooldowns.delete(userId), cooldownAmount);
  return false;
}

function addPlayer(userId) {
  players.set(userId, { id: userId, choice: null });
}

async function waitForSecondPlayer() {
  clearTimeout(expirationTimeoutId);
  expirationTimeoutId = setTimeout(() => {
    if (players.size === 1) players.clear();
  }, EXPIRATION_TIME);
}

async function startGame(message) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_rock').setLabel('✊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rps_paper').setLabel('✋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rps_scissors').setLabel('✌️').setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('Make your move')
    .setDescription('After 1 minute, the game will expire. So please pick!')
    .setColor(0xFFA500);

  const messageWithEmbed = await message.channel.send({ embeds: [embed], components: [row] });

  clearTimeout(expirationTimeoutId);
  expirationTimeoutId = setTimeout(() => {
    if ([...players.values()].every(p => p.choice === null)) {
      players.clear();
      messageWithEmbed.edit({ content: 'The game has expired due to inactivity.', components: [] });
    }
  }, EXPIRATION_TIME);

  players.forEach(player => {
    player.messageWithEmbed = messageWithEmbed;
  });
}

async function handleGameInteraction(interaction) {
  const player = players.get(interaction.user.id);
  if (!player || player.choice) return;

  player.choice = interaction.customId.replace('rps_', '');
  await retryInteractionUpdate(interaction);

  if ([...players.values()].every(p => p.choice)) {
    clearTimeout(expirationTimeoutId);
    await endGame();
  } else {
    const embed = new EmbedBuilder()
      .setTitle('Input received')
      .setDescription('Waiting...')
      .setColor(0xFFA500);

    await player.messageWithEmbed.edit({ embeds: [embed] });
  }
}


async function retryInteractionUpdate(interaction, attempts = 3) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rps_rock').setLabel('✊').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('rps_paper').setLabel('✋').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('rps_scissors').setLabel('✌️').setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  for (let i = 0; i < attempts; i++) {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({ components: [row] });
      }
      break;
    } catch (error) {
      if (i === attempts - 1) {
        handleError(error, interaction);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

function handleError(error, interaction) {
  if (error.code !== 10062) console.error('An error occurred:', error);
  try {
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: 'Anteraction, error occurred, please try again.', ephemeral: true });
    } else if (interaction.deferred) {
      interaction.followUp({ content: 'Interaction, error occurred, please try again.', ephemeral: true });
    }
  } catch (err) {
    console.error('Error while trying to handle user input', err);
  }
}

async function endGame() {
  const [player1, player2] = [...players.values()];
  const result = getResult(player1.choice, player2.choice);

  let resultMessage, resultEmbed;
  if (result === 'draw') {
    resultMessage = 'It\'s a tie! ♢';
    resultEmbed = new EmbedBuilder()
      .setTitle('Result:')
      .setDescription('Well, Well, Well...!')
      .setColor(0xFFA500);
  } else {
    const winner = result === 'player1' ? player1.id : player2.id;
    const loser = result === 'player1' ? player2.id : player1.id;

    const { exists: winnerExists, consent: winnerConsent } = await playerHasConsent(winner);
    if (winnerExists && winnerConsent) {
      await updatePlayerStats(winner, 'win');
      await updatePlayerStats(loser, 'loss');
      const winnerStats = await getTrackedStatsMessage(winner);

      resultMessage = `<@${winner}> wins! 🎉 🎉`;
      resultEmbed = new EmbedBuilder()
        .setTitle('Result:')
        .setDescription(winnerStats)
        .setColor(0x00FF00);
    } else {
      resultMessage = `<@${winner}> wins! 🎉 🎉`;
      resultEmbed = new EmbedBuilder()
        .setTitle('Result:')
        .setDescription('Wins not tracked : `!consent`')
        .setColor(0xFFA500);
    }
  }

  await Promise.all([...players.values()].map(player =>
    player.messageWithEmbed.edit({ content: resultMessage, embeds: [resultEmbed], components: [] })
  ));

  players.clear();
}

function getResult(choice1, choice2) {
  if (choice1 === choice2) return 'draw';

  const winMap = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper'
  };

  return winMap[choice1] === choice2 ? 'player1' : 'player2';
}

async function playerHasConsent(userId) {
  const userFilePath = path.join(__dirname, `../utils/userdb/${userId}.json`);
  try {
    const data = await fs.readFile(userFilePath, 'utf8');
    const user = JSON.parse(decrypt(data));
    return { exists: true, consent: user.userPreferences && user.userPreferences.consent };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, consent: false };
    } else {
      throw error;
    }
  }
}

async function updatePlayerStats(userId, result) {
  const userFilePath = path.join(__dirname, `../utils/userdb/${userId}.json`);
  try {
    const data = await fs.readFile(userFilePath, 'utf8');
    const user = JSON.parse(decrypt(data));

    if (!user.games) {
      user.games = [];
    }

    const gameStats = user.games.find(game => game.name === 'RPS');
    if (gameStats) {
      if (result === 'win') {
        gameStats.wins = (gameStats.wins || 0) + 1;
      } else if (result === 'loss') {
        gameStats.losses = (gameStats.losses || 0) + 1;
      }
    } else {
      user.games.push({
        name: 'RPS',
        wins: result === 'win' ? 1 : 0,
        losses: result === 'loss' ? 0 : 1
      });
    }

    const encryptedData = encrypt(JSON.stringify(user));
    await fs.writeFile(userFilePath, encryptedData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function getTrackedStatsMessage(userId) {
  const userFilePath = path.join(__dirname, `../utils/userdb/${userId}.json`);
  try {
    const data = await fs.readFile(userFilePath, 'utf8');
    const user = JSON.parse(decrypt(data));
    const gameStats = user.games.find(game => game.name === 'RPS');
    if (gameStats) {
      return `<@${userId}>\n Total Wins: ${gameStats.wins}`;
    } else {
      return `<@${userId}>\n No games played.`;
    }
  } catch (error) {
    return 'Error retrieving stats.';
  }
}
