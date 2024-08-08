const fs = require('fs');
const path = require('path');

module.exports = (client) => {

  const { countingChannelId } = require('../config.json');
  const countFilePath = path.join(__dirname, './filesdb/lastCount.json');
  const lastMentionTime = new Map();
  let lastCount = 0;

  if (fs.existsSync(countFilePath)) {
    const countData = fs.readFileSync(countFilePath);
    lastCount = JSON.parse(countData).lastCount;
  }
d

  client.on('messageCreate', async (message) => {
    if (message.channel.id !== countingChannelId || message.author.bot) return;
    
    const messageNumber = parseInt(message.content, 10);

    const sendEphemeralMention = async (content) => {
      const sentMessage = await message.channel.send(content);
      setTimeout(() => sentMessage.delete(), 3000);
    };

    if (isNaN(messageNumber)) {
      await message.delete();
      const now = Date.now();
      if (!lastMentionTime.has(message.author.id) || now - lastMentionTime.get(message.author.id) > 60000) {
        await sendEphemeralMention(`${message.author}, Only numbers are allowed.`);
        lastMentionTime.set(message.author.id, now);
      }
      return;
    }

    if (messageNumber !== lastCount + 1) {
      await message.delete();
      const now = Date.now();
      if (!lastMentionTime.has(message.author.id) || now - lastMentionTime.get(message.author.id) > 60000) {
        await sendEphemeralMention(`${message.author} This is not the next number.`);
        lastMentionTime.set(message.author.id, now);
      }
      return;
    }

    lastCount = messageNumber;
    fs.writeFileSync(countFilePath, JSON.stringify({ lastCount }), 'utf8');
  });
};
