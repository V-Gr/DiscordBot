// index.js
const { Client, GatewayIntentBits, Partials, Collection, TextChannel } = require('discord.js');
const { Pool } = require('pg');
const { token, prefix } = require('./config.json');
const fs = require('fs').promises;
const path = require('path');
const db = require('./db');
const countingHandler = require('./utils/countingHandler');
const capsLockFilter = require('./utils/capsLockFilter.js');
const { checkSpam, isUserBlocked } = require('./utils/spamFilter');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
const listenerManager = new ListenerManager(client);

const loadCommands = async () => {
  try {
    const commandFiles = await fs.readdir('./commands');
    for (const file of commandFiles.filter(file => file.endsWith('.js'))) {
      const command = require(`./commands/${file}`);
      client.commands.set(command.name, command);
    }
  } catch (error) {
    console.error('Error loading commands:', error);
  }
};

const handleMessageCreate = async (message) => {
  try {
    if (message.author.bot) return;

    if (message.channel.type === 1) {
      if (!message.content.startsWith(prefix)) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      const command = client.commands.get(commandName);
      if (!command) return;

      try {
        await command.execute(message, args);
        //console.log(`Executed DM command: ${commandName}`);
      } catch (error) {
        console.error('Error :', error);
      }
      return;
    }

    if (message.guild) {
      try {
        const serverId = message.guild.id;

      } catch (error) {
        console.error('Error :', error);
      }
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args);
    } catch (error) {
      console.error('Error :', error);
      await message.reply('There was an error executing that command!');
    }
  } catch (error) {
    console.error('Error :', error);
  }
};

  const handleInteractionCreate = async (interaction) => {
    try {
      if (interaction.isButton()) {
        const [commandName] = interaction.customId.split('_');
        const command = client.commands.get(commandName);
        if (command && command.interactionCreate) {
          try {
            await command.interactionCreate.execute(interaction);
          } catch (error) {
            await interaction.reply({ content: 'There was an error, please try again!', ephemeral: true });
          }
        }
      }
    } catch (error) {
      console.error('Error :', error);
    }
  };


countingHandler(client);


client.login(token).then(() => {
  loadCommands();
}).catch(error => {
  console.error('Error :', error);
});
