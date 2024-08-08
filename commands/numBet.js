const { startGame, guessNumber, getUserBalance, generateRandomNumber, updateUserBalance, activeGames } = require('../utils/games/casinoNumBetLogic');
const waitlist = new Map();

const generalChannelId = ['',''];

module.exports = {
    name: 'numbet',
    description: 'Bet money on guessing a number or make a guess.',
    async execute(message, args) {

        if (!generalChannelId.includes(message.channel.id)) return;

        const playerID = message.author.id;

        if (activeGames.has(playerID)) {
            return; 
        } else {
            const moneyBet = parseFloat(args[0]);
            const maxNumber = parseInt(args[1]);
            const userMentionned = args[2];
            const secondPlayer = userMentionned ? userMentionned.replace('<@', '').replace('>', '') : null;

            if (isNaN(moneyBet) || isNaN(maxNumber) || moneyBet <= 0 || maxNumber <= 0) return;

            const userBalance = await getUserBalance(playerID);

            if (userBalance < moneyBet) {
                return message.reply("You don't have the ressources to place this bet.");
            }

            if (secondPlayer) {
                if (waitlist.has(secondPlayer) && waitlist.get(secondPlayer).secondPlayer === playerID) {
                    const opponent = waitlist.get(secondPlayer);
                    waitlist.delete(secondPlayer);

                    const finalMaxNumber = Math.floor((maxNumber + opponent.maxNumber) / 2);
                    const totalMoneyBet = moneyBet + opponent.moneyBet;
                    const randomNumber = generateRandomNumber(finalMaxNumber);

                    activeGames.set(playerID, { playerID, moneyBet, randomNumber, maxNumber: finalMaxNumber, secondPlayer: opponent.playerID, hasGuessed: false });
                    activeGames.set(opponent.playerID, { playerID: opponent.playerID, moneyBet: opponent.moneyBet, randomNumber, maxNumber: finalMaxNumber, secondPlayer: playerID, hasGuessed: false });

                    message.reply(`Place your bets, number is between 0 and finalMaxNumber. Pot is ${totalMoneyBet}`);

                    collectGuesses(message, playerID, opponent.playerID);
                } else {
                    waitlist.set(playerID, { playerID, moneyBet, maxNumber, secondPlayer });
                    message.reply(`Waiting for <@${secondPlayer}> to join. Pot : ${moneyBet}`);;
                }
            } else {
                const randomNumber = generateRandomNumber(maxNumber);
                await startGame(playerID, moneyBet, randomNumber, maxNumber);
                return message.reply(`Place your bet, number is between 0 to ${maxNumber}`)
                    .then(() => {
                        const filter = response => response.author.id === playerID && !isNaN(parseInt(response.content));
                        const collector = message.channel.createMessageCollector({ filter, time: 15000 });

                        collector.on('collect', async response => {
                            const guess = parseInt(response.content);
                            const resultMessage = await response.reply('Number is...');
                            await guessNumber(playerID, guess, resultMessage);
                            collector.stop();
                        });

                        collector.on('end', collected => {
                            if (!collected.size) {
                                activeGames.delete(playerID);
                            }
                        });
                    });
            }
        }
    },
};

async function collectGuesses(message, playerID1, playerID2) {
    const filter1 = response => response.author.id === playerID1 && !isNaN(parseInt(response.content));
    const filter2 = response => response.author.id === playerID2 && !isNaN(parseInt(response.content));

    const collector1 = message.channel.createMessageCollector({ filter: filter1, time: 44000 });
    const collector2 = message.channel.createMessageCollector({ filter: filter2, time: 44000 });

    let guess1 = null;
    let guess2 = null;

    collector1.on('collect', async response => {
        guess1 = parseInt(response.content);
        response.reply('Guess recorded.');

        if (guess1 !== null && guess2 !== null) {
            collector1.stop();
            collector2.stop();
            await processGuesses(message, playerID1, guess1, playerID2, guess2);
        }
    });

    collector2.on('collect', async response => {
        guess2 = parseInt(response.content);
        response.reply('Guess recorded.');

        if (guess1 !== null && guess2 !== null) {
            collector1.stop();
            collector2.stop();
            await processGuesses(message, playerID1, guess1, playerID2, guess2);
        }
    });

    collector1.on('end', collected => {
        if (!collected.size) {
            activeGames.delete(playerID1);
        }
    });

    collector2.on('end', collected => {
        if (!collected.size) {
            activeGames.delete(playerID2);
        }
    });
}

async function processGuesses(message, playerID1, guess1, playerID2, guess2) {
    const game1 = activeGames.get(playerID1);
    const game2 = activeGames.get(playerID2);

    const randomNumber = game1.randomNumber;
    const moneyBet1 = game1.moneyBet;
    const moneyBet2 = game2.moneyBet;

    let rollingNumber = 0;
    const intervalTime = Math.floor(Math.random() * 2000) + 200;
    const totalDuration = Math.floor(Math.random() * 3000) + 1000;

    const displayRollingNumber = async (rollingMessage) => {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                rollingNumber = Math.floor(Math.random() * (game1.maxNumber + 1));
                rollingMessage.edit(`Number is ${rollingNumber}`);
            }, 500);

            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, totalDuration);
        });
    };

    const rollingMessage = await message.channel.send(`Number is rolling...`);

    await displayRollingNumber(rollingMessage);

    await rollingMessage.edit(`Number is ${randomNumber}`);

    const diff1 = Math.abs(randomNumber - guess1);
    const diff2 = Math.abs(randomNumber - guess2);

    let winnerId;
    let loserId;

    if (diff1 < diff2) {
        winnerId = playerID1;
        loserId = playerID2;
    } else if (diff2 < diff1) {
        winnerId = playerID2;
        loserId = playerID1;
    } else {
        await message.channel.send(`It's a tie! Both players guessed equally close to the number ${randomNumber}.`);
        activeGames.delete(playerID1);
        activeGames.delete(playerID2);
        return;
    }

    const totalPot = moneyBet1 + moneyBet2;
    await updateUserBalance(winnerId, totalPot);
    await updateUserBalance(loserId, -moneyBet1);

    const newBalance = await getUserBalance(winnerId);
    await message.channel.send(`<@${winnerId}> won ${totalPot}! New Balance ${newBalance}`);

    activeGames.delete(playerID1);
    activeGames.delete(playerID2);
}
