const fs = require('fs');
const path = require('path');

const spamConfigPath = path.join(__dirname, './config/spamConfig.json');
const spamConfig = JSON.parse(fs.readFileSync(spamConfigPath, 'utf8'));

const userTracking = new Map();

const TIMEFRAME = (timestamps, currentTime, interval) => {
  const threshold = currentTime - interval * 1000;
  let start = 0;
  while (start < timestamps.length && timestamps[start] < threshold) {
    start++;
  }
  return timestamps.slice(start);
};

const checkSpam = async (message) => {

  const channelId = message.channel.id;
  const userId = message.author.id;
  const currentTime = Date.now();

  const channelSettings = spamConfig.channelSettings?.[channelId] || spamConfig.defaultSettings;
  const { maxMessages = 5, interval = 10, roleId, triggerDuration = 30 } = channelSettings || {};

  if (!userTracking.has(userId)) {
    userTracking.set(userId, {
      messages: [],
      lastWarning: 0,
      blockedUntil: 0,
      spamTrigger: 0
    });
  }

  const userData = userTracking.get(userId);
  userData.messages.push(currentTime);

  const filteredMessages = TIMEFRAME(userData.messages, currentTime, interval);
  userData.messages = filteredMessages;

  if (filteredMessages.length > maxMessages) {
    await message.delete();

    if (currentTime - userData.lastWarning > 11000) {
      userData.lastWarning = currentTime;
      const warningMessage = await message.channel.send(`${message.author}, you are sending messages too quickly. Please slow down.`);
      
      setTimeout(() => {
        warningMessage.delete().catch(console.error);
      }, 3200);
    }

    userData.blockedUntil = currentTime;

    if (!userData.spamTrigger) {
      userData.spamTrigger = currentTime;
    } else {
      const spamDuration = currentTime - userData.spamTrigger;
      if (spamDuration > triggerDuration * 1000) {
        const member = await message.guild.members.fetch(userId);
        await member.roles.add(roleId).catch(console.error);
        userData.spamTrigger = 0; 
        console.log(`Role ${roleId} added to user ${userId}`);
      }
    }
    return true;
  } else {
    if (currentTime - userData.spamTrigger > triggerDuration * 1000) {
      userData.spamTrigger = 0; 
    }
  }
  return false;
};

const isUserBlocked = (userId) => {
  if (!userTracking.has(userId)) return false;
  const userData = userTracking.get(userId);
  return Date.now() < userData.blockedUntil;
};

module.exports = { checkSpam, isUserBlocked };
