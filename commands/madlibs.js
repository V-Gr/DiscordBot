const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const currentGames = new Map();
const unknownSubcommandCooldowns = new Map();

const CONFIG = {
  ALLOWED_CHANNEL_IDS: ['','',''], 
  MINIGAMES_CHANNEL_ID: '', 
  START_TIMER_DURATION: 9000,
  VOTING_TIME: 12000,
  FILL_TIMER_DURATION: 26000,
  DEFAULT_MAX_ROUNDS: 3,
  DEFAULT_MIN_PLAYERS: 2,
  DEFAULT_MAX_PLAYERS: 6,
  COOLDOWN_PERIOD: 60000, 
};

module.exports = {
  name: 'madlibs',
  description: 'MadLibs game',
  async execute(message, args, client) {
    if (!CONFIG.ALLOWED_CHANNEL_IDS.includes(message.channel.id)) {
      return;
    }

    if (!args.length) {
      return message.reply('You need to specify an action: join, fill, or vote.');
    }

    const subcommand = args.shift().toLowerCase();
    const userId = message.author.id;
    const now = Date.now();

    // Checks
    if (!['join', 'fill', 'vote'].includes(subcommand)) {
      if (unknownSubcommandCooldowns.has(userId) && now - unknownSubcommandCooldowns.get(userId) < CONFIG.COOLDOWN_PERIOD) {
        return;  
      }

      unknownSubcommandCooldowns.set(userId, now);
      return message.reply('Unknown subcommand. Use !madlibs join, !madlibs fill, or !madlibs vote.');
    }

    try {
      switch (subcommand) {
        case 'join':
          await joinOrStartGame(message);
          break;
        case 'fill':
          await fillBlanks(message, args);
          break;
        case 'vote':
          await voteResults(message);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error executing command:', error);
      await message.reply('An error occurred while executing the command.');
    }
  },
};

async function joinOrStartGame(message) {
  const guildId = message.guild.id;
  let currentGame = currentGames.get(guildId);

  if (!currentGame) {
    currentGame = await startGame(message);
  }

  const authorId = message.author.id;
  if (currentGame.joinedPlayers.has(authorId)) {
    return message.reply('You have already joined the game.');
  }

  if (currentGame.joinedPlayers.size >= currentGame.maxPlayers) {
    return message.reply('The game already has the maximum number of players.');
  }

  currentGame.joinedPlayers.add(authorId);

  if (message.channel.id === CONFIG.MINIGAMES_CHANNEL_ID) {
    await updateJoinEmbed(message.channel, currentGame);
  }

  if (currentGame.joinedPlayers.size >= currentGame.minPlayers) {
    resetStartTimer(message.channel, currentGame);
  }
}

async function startGame(message) {
  try {
    const sentences = JSON.parse(await fs.readFile(path.join(__dirname, '../utils/games/sentences.json'), 'utf8'));
    shuffleArray(sentences);

    const currentGame = {
      players: new Map(),
      sentences,
      currentSentence: null,
      round: 0,
      maxRounds: CONFIG.DEFAULT_MAX_ROUNDS,
      minPlayers: CONFIG.DEFAULT_MIN_PLAYERS,
      maxPlayers: CONFIG.DEFAULT_MAX_PLAYERS,
      joinedPlayers: new Set(),
      votingMessages: [],
      channelId: message.channel.id,
      startTimer: null,
      fillTimer: null,
      blanksCount: 0,
      votingCompleted: false,
      scores: new Map(),
      embedMessage: null,
    };

    currentGames.set(message.guild.id, currentGame);

    // Special Minigames channel start message

    if (message.channel.id === CONFIG.MINIGAMES_CHANNEL_ID) {
      const embed = new EmbedBuilder()
        .setTitle('Madlibs')
        .setDescription('Waiting for players... join : !madlibs join')
        .addFields({ name: 'Started by', value: `<@${message.author.id}>` })
        .setColor(0x0099ff)
        .setTimestamp();
      currentGame.embedMessage = await message.channel.send({ embeds: [embed] });
    } else {
      console.log('Madlib game started');
    }

    return currentGame;
  } catch (error) {
    console.error('Error starting game:', error);
    await message.reply('An error occurred while starting the game.');
  }
}

async function updateJoinEmbed(channel, game) {
  if (!game.embedMessage) return;

  const playersList = Array.from(game.joinedPlayers).map(playerId => `<@${playerId}>`).join(', ');
  const embed = new EmbedBuilder()
    .setTitle('Madlibs')
    .setDescription(`Waiting for players... join : !madlibs join\nPlayers: ${playersList}`)
    .setColor(0x0099ff)
    .setTimestamp();

  await game.embedMessage.edit({ embeds: [embed] });
}

function resetStartTimer(channel, game) {
  if (game.startTimer) {
    clearTimeout(game.startTimer);
  }

  game.startTimer = setTimeout(async () => {
    try {
      adjustMaxRounds(game);
      await startRound(channel, game);
    } catch (error) {
      console.error('Error starting round:', error);
      await channel.send('An error occurred while starting the round.');
    }
  }, CONFIG.START_TIMER_DURATION);
}

function adjustMaxRounds(game) {
  const playerCount = game.joinedPlayers.size;
  game.maxRounds = Math.min(playerCount + 1, CONFIG.DEFAULT_MAX_ROUNDS);
}

async function startRound(channel, game) {
  game.currentSentence = game.sentences.pop();
  game.round += 1;
  game.votingMessages = [];
  game.blanksCount = (game.currentSentence.match(/_____/g) || []).length;

  const roundMessage = await channel.send(`**Round ${game.round}**, complete this sentence using \`!madlibs fill\` : \n ${escapeUnderscores(game.currentSentence)}`);
  game.roundMessage = roundMessage;

  setFillTimer(channel, game);
}

async function fillBlanks(message, args) {
  const currentGame = currentGames.get(message.guild.id);

  if (!currentGame) {
    return message.reply('No game is currently running.');
  }
  if (!CONFIG.ALLOWED_CHANNEL_IDS.includes(message.channel.id)) {
    return;
  }
  if (!currentGame.currentSentence) {
    return;
  }
  if (!currentGame.joinedPlayers.has(message.author.id)) {
    return message.reply('You are not part of this game.');
  }
  if (currentGame.players.has(message.author.id)) {
    return message.reply('You have already submitted your answer.');
  }

  const userInput = args.join(' ');
  const userWords = userInput.split(',');

  if (userWords.length !== currentGame.blanksCount) {
    return message.reply(`You need to provide exactly ${currentGame.blanksCount} inputs separated by commas.`);
  }

  if (userWords.some(words => words.trim().split(' ').length > 4)) {
    return message.reply('Each input should contain a maximum of 4 words.');
  }

  try {
    await message.delete();
  } catch (error) {
    console.error('Error deleting message:', error);
  }

  currentGame.players.set(message.author.id, userWords.map(words => words.trim()));

  if (currentGame.players.size === currentGame.joinedPlayers.size) {
    clearTimeout(currentGame.fillTimer);
    await triggerVoting(message.channel, currentGame);
  }
}

async function voteResults(message) {
  const currentGame = currentGames.get(message.guild.id);

  if (!currentGame) {
    return;
  }
  if (!CONFIG.ALLOWED_CHANNEL_IDS.includes(message.channel.id)) {
    return;
  }
  if (currentGame.players.size < currentGame.joinedPlayers.size) {
    return message.reply('Not all players have submitted their answers yet.');
  }
  await triggerVoting(message.channel, currentGame);
}

async function triggerVoting(channel, game) {
  if (game.votingCompleted) {
    return;
  }
  game.votingCompleted = true;

  const completedSentences = Array.from(game.players.entries()).map(([userId, userWords]) => ({
    userId,
    sentence: integrateUserInputIntoSentence(game.currentSentence, userWords)
  }));

  game.votingMessages = [];

  await channel.send('Players sentence, vote for the best one.');

  for (const { userId, sentence } of completedSentences) {
    const sentMessage = await channel.send(escapeUnderscores(sentence));
    game.votingMessages.push({ message: sentMessage, userId });
    await sentMessage.react('👍');

    const filter = (reaction, user) => reaction.emoji.name === '👍' && !user.bot;
    const collector = sentMessage.createReactionCollector({ filter, time: CONFIG.VOTING_TIME });

    collector.on('collect', async (reaction, user) => {
      const totalReactions = game.votingMessages.reduce((acc, msg) => acc + (msg.message.reactions.cache.get('👍')?.count - 1 || 0), 0);
      if (totalReactions >= game.joinedPlayers.size) {
        collector.stop();
      }
    });

    collector.on('end', async () => {
      if (!game.votingCompleted) return;

      game.votingCompleted = false;

      let maxReactions = 0;
      let winningMessage = null;

      for (const msg of game.votingMessages) {
        const reactionCount = (msg.message.reactions.cache.get('👍')?.count || 0) - 1;
        if (reactionCount > maxReactions) {
          maxReactions = reactionCount;
          winningMessage = msg;
        }
      }

      if (winningMessage) {
        const winningUserId = winningMessage.userId;
        const winningInput = game.players.get(winningUserId);

        if (!winningInput) {
          await channel.send('An error occurred while processing the winning sentence.');
          return;
        }

        const currentScore = game.scores.get(winningUserId) || 0;
        game.scores.set(winningUserId, currentScore + 1);

        const updatedSentence = integrateUserInputIntoSentence(game.currentSentence, winningInput);
        await channel.send(`Winning sentence from <@${winningUserId}> with ${maxReactions} votes: \n "${updatedSentence}"`);
        game.currentSentence = updatedSentence;
      } else {
        await channel.send('No votes were cast.');
      }

      game.players.clear();

      if (game.roundMessage) {
        await game.roundMessage.delete().catch(console.error);
      }
      for (const votingMsg of game.votingMessages) {
        await votingMsg.message.delete().catch(console.error);
      }

      if (game.round < game.maxRounds) {
        game.currentSentence = game.sentences.pop();
        if (game.currentSentence) {
          game.round += 1;
          const roundMessage = await channel.send(`Round ${game.round}: ${escapeUnderscores(game.currentSentence)}`);
          game.roundMessage = roundMessage;
          setFillTimer(channel, game);
        } else {
          await announceOverallWinner(channel, game);
          currentGames.delete(channel.guild.id);
        }
      } else {
        await announceOverallWinner(channel, game);
        currentGames.delete(channel.guild.id);
      }
    });
  }
}

async function announceOverallWinner(channel, game) {
  let maxScore = 0;
  let winnerId = null;

  for (const [userId, score] of game.scores.entries()) {
    if (score > maxScore) {
      maxScore = score;
      winnerId = userId;
    }
  }

  if (winnerId) {
    await channel.send(`The game has ended. The overall winner is <@${winnerId}> with ${maxScore} points!`);

    if (game.channelId === CONFIG.MINIGAMES_CHANNEL_ID && game.embedMessage) {
      const embed = new EmbedBuilder()
        .setTitle('Madlibs')
        .setDescription(`<@${winnerId}> won the game with ${maxScore} points!`)
        .setColor(0x00ff00)
        .setTimestamp();
      await game.embedMessage.edit({ embeds: [embed] });
    }
  } else {
    await channel.send('The game has ended. No overall winner could be determined.');
  }
}

function integrateUserInputIntoSentence(sentence, userWords) {
  if (!userWords) {
    return sentence;
  }

  let wordIndex = 0;
  return sentence.replace(/_____/g, () => userWords[wordIndex++] || '_____');
}

function escapeUnderscores(text) {
  return text.replace(/_/g, '\\_');
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function setFillTimer(channel, game) {
  if (game.fillTimer) {
    clearTimeout(game.fillTimer);
  }

  game.fillTimer = setTimeout(async () => {
    if (game.players.size < game.joinedPlayers.size) {
      if (game.players.size === 0) {
        await channel.send('No answers were given this round. Moving to the next round.');
        if (game.round < game.maxRounds) {
          game.currentSentence = game.sentences.pop();
          if (game.currentSentence) {
            game.round += 1;
            const roundMessage = await channel.send(`Round ${game.round}: ${escapeUnderscores(game.currentSentence)}`);
            game.roundMessage = roundMessage;
            setFillTimer(channel, game); 
          } else {
            await announceOverallWinner(channel, game);
            currentGames.delete(channel.guild.id);
          }
        } else {
          await announceOverallWinner(channel, game);
          currentGames.delete(channel.guild.id);
        }
      } else {
        await triggerVoting(channel, game);
      }
    }
  }, CONFIG.FILL_TIMER_DURATION);
}
