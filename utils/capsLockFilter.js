const { Collection } = require('discord.js');
const db = require('../db');

module.exports = (client) => {
  const messageQueue = new Collection();
  const configCache = new Map();
  const CACHE_CLEANUP_INTERVAL = 16 * 60 * 1000;
  const RATE_LIMIT_DELAY = 1000;

  const processQueue = async () => {
    while (messageQueue.size > 0) {
      const messagesToProcess = Array.from(messageQueue.values()).slice(0, 5);

      await Promise.all(messagesToProcess.map(async (message) => {
        const messageId = message.id;

        try {
          await message.delete();
        } catch (error) {
          console.error(`Failed to delete message: ${messageId}`, error);
        } finally {
          messageQueue.delete(messageId);
        }
      }));

      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  };

  const checkCacheExpiration = () => {
    const now = Date.now();
    for (const [serverId, { timestamp }] of configCache.entries()) {
      if (now - timestamp > CACHE_CLEANUP_INTERVAL) {
        configCache.delete(serverId);
      }
    }
  };

  setInterval(checkCacheExpiration, CACHE_CLEANUP_INTERVAL);

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const serverId = message.guild.id;

    const fetchConfig = async (serverId) => {
      const query = `
        SELECT configuration, max_caps 
        FROM server_configurations 
        WHERE server_id = $1 AND feature_name = 'default'
      `;
      const result = await db.pool.query(query, [serverId]);
      if (result.rows.length > 0) {
        const { configuration, max_caps } = result.rows[0];
        return { configuration, maxCaps: max_caps };
      } else {
        throw new Error('Configuration not found');
      }
    };
d
    if (!configCache.has(serverId)) {
      try {
        const { configuration, maxCaps } = await fetchConfig(serverId);
        configCache.set(serverId, { configuration, maxCaps, timestamp: Date.now() });
      } catch (error) {
        console.error(`Failed get config for server : ${serverId}`, error);
        return;
      }
    }

    const { configuration, maxCaps } = configCache.get(serverId);
    const enabledChannels = configuration.capslock_filter_channels;


    if (!enabledChannels.includes(message.channel.id)) {
      return;
    }

    const capsCount = [...message.content].reduce((count, char) => {
      return count + (char >= 'A' && char <= 'Z' ? 1 : 0);
    }, 0);



    if (capsCount > maxCaps) {
      messageQueue.set(message.id, message);

      if (messageQueue.size === 1) {
        processQueue().catch(console.error);
      }
    } else {
    }
  });
};
