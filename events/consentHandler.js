const fs = require('fs').promises;
const path = require('path');
const { encrypt, decrypt } = require('../utils/encryption');
const directoryCheck = require('../utils/ensureDirectory');

async function handleConsentYes(interaction, userId) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    } else {
      return;
    }

    const userDataPath = path.join(__dirname, '../utils/userdb', `${userId}.json`);
    await directoryCheck(userDataPath);

    let userData = { userPreferences: { consent: true } };

    try {
      const encryptedData = await fs.readFile(userDataPath, 'utf8');
      userData = JSON.parse(decrypt(encryptedData));
      userData.userPreferences.consent = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log("No existing user data found, creating one.");
      } else {
        console.error('Error decrypting user data:', error);
        if (!interaction.replied) {
          await interaction.editReply({
            content: 'Error consent was not updated.',
            ephemeral: true,
          });
        }
        return;
      }
    }

    const newEncryptedData = encrypt(JSON.stringify(userData));
    await fs.writeFile(userDataPath, newEncryptedData);

    if (!interaction.replied) {
      await interaction.editReply({
        content: "You can now use the `!musicrcs` command.",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error handling consent:', error);
    if (!interaction.replied) {
      await interaction.editReply({
        content: 'Error updating your consent data.',
        ephemeral: true,
      });
    }
  }
}

async function handleConsentNo(interaction, userId) {

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    } else {
      return;
    }

    const userDataPath = path.join(__dirname, '../utils/userdb', `${userId}.json`);

    try {
      await fs.access(userDataPath);
      await fs.unlink(userDataPath);
      if (!interaction.replied) {
        await interaction.editReply({
          content: "You data has been deleted.",
          ephemeral: true,
        });
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        if (!interaction.replied) {
          await interaction.editReply({
            content: "User profile deleted.",
            ephemeral: true,
          });
        }
      } else {
        if (!interaction.replied) {
          await interaction.editReply({
            content: "There was an error deleting your data. Please try again.",
            ephemeral: true,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error handling consent withdrawal:', error);
    if (!interaction.replied) {
      await interaction.editReply({
        content: 'Error withdrawing your consent data.',
        ephemeral: true,
      });
    }
  }
}

module.exports = { handleConsentYes, handleConsentNo };
