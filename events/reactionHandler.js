const fs = require('fs');
const path = require('path');
const ensureDirectoryExistence = require('../utils/ensureDirectory');
const { encrypt, decrypt } = require('../utils/encryption');

const spotifyChannelId = ''; 

module.exports = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.channel.id !== spotifyChannelId || user.bot) return;

    const urlRegex = /(https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+)/;
    const match = reaction.message.content.match(urlRegex);

    if (!match) return;

    const trackUrl = match[1];
    const trackId = trackUrl.split('/').pop().split('?')[0];

    const userDataPath = path.join(__dirname, '../utils/userdb', `${user.id}.json`);
    ensureDirectoryExistence(userDataPath);

    let userData;

    if (fs.existsSync(userDataPath)) {
      const encryptedData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
      try {
        userData = JSON.parse(decrypt(encryptedData));
      } catch (error) {
        console.error('Error decrypting user data:', error);
        return;
      }
    } else {
      userData = { userPreferences: { consent: false }, reactedTracks: [] };
    }

    if (!userData.userPreferences.consent) return;

    if (!userData.reactedTracks) {
      userData.reactedTracks = [];
    }

    if (!userData.reactedTracks.includes(trackId)) {
      userData.reactedTracks.push(trackId);
      const encryptedData = encrypt(JSON.stringify(userData));
      fs.writeFileSync(userDataPath, JSON.stringify(encryptedData, null, 2));
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.message.channel.id !== spotifyChannelId || user.bot) return;

    const urlRegex = /(https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+)/;
    const match = reaction.message.content.match(urlRegex);

    if (!match) return;

    const trackUrl = match[1];
    const trackId = trackUrl.split('/').pop().split('?')[0];

    const userDataPath = path.join(__dirname, '../utils/userdb', `${user.id}.json`);
    ensureDirectoryExistence(userDataPath);

    if (fs.existsSync(userDataPath)) {
      let userData;
      try {
        userData = JSON.parse(decrypt(JSON.parse(fs.readFileSync(userDataPath, 'utf8'))));
      } catch (error) {
        console.error('Error decrypting user data:', error);
        return;
      }

      if (userData.userPreferences.consent && userData.reactedTracks.includes(trackId)) {
        userData.reactedTracks = userData.reactedTracks.filter(id => id !== trackId);
        const encryptedData = encrypt(JSON.stringify(userData));
        fs.writeFileSync(userDataPath, JSON.stringify(encryptedData, null, 2));
      }
    }
  });
};
