const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getSpotifyRecommendations } = require('../utils/spotify.js');
const ensureDirectoryExistence = require('../utils/ensureDirectory');
const { encrypt, decrypt } = require('../utils/encryption');

const cooldowns = new Map();
const COOLDOWN_TIME = 10 * 60 * 1000;
const spotifyChannelId = '';

module.exports = {
  name: 'musicrcs',
  description: 'Get song recommendations based on your Spotify reactions',
  async execute(message, args) {
    if (message.channel.id !== spotifyChannelId) return;

    const userId = message.author.id;

    if (cooldowns.has(userId)) {
      const lastUsed = cooldowns.get(userId);
      const now = Date.now();
      if (now - lastUsed < COOLDOWN_TIME) {
        const timeLeft = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000 / 60);
        await message.author.send(`Wait ${timeLeft} minute(s) before using this command again.`);
        return;
      }
    }

    cooldowns.set(userId, Date.now());

    const userDataPath = path.join(__dirname, '../utils/userdb', `${userId}.json`);
    ensureDirectoryExistence(userDataPath);

    let userData;

    if (fs.existsSync(userDataPath)) {
      const encryptedData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      try {
        userData = JSON.parse(decrypt(encryptedData));
      } catch (error) {
        console.error('Error decrypting user data:', error.message);
        await message.author.send('There was an error updating your request. Please try again.');
        return;
      }
    } else {
      userData = { consent: false, reactedTracks: [] };
    }

    if (!userData.consent) {
      await message.author.send({
        content: "To use this command type `!consent`."
      });
      return;
    }

    let trackIds = userData.reactedTracks;

    if (trackIds.length === 0) {
      return message.reply("You haven't reacted to any Spotify links yet.");
    }

    if (trackIds.length > 5) {
      trackIds = trackIds.sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    try {
      const recommendations = await getSpotifyRecommendations(trackIds);
      const embed = new EmbedBuilder()
        .setTitle('Spotify Recommendations')
        .setDescription(
          recommendations.map(track => 
            `[${track.name}](${track.external_urls.spotify}) by ${track.artists.map(artist => artist.name).join(', ')}`)
          .join('\n')
        )
        .setColor(0x1DB954);

      await message.author.send({
        content: "Some recommendations based on your reactions:",
        embeds: [embed]
      });
    } catch (error) {
      console.error('Error getting Spotify recommendations:', error.message);
      await message.author.send('There was an error fetching recommendations. Please try again.');
    }
  },
};
