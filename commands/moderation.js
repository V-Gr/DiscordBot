const { EmbedBuilder } = require('discord.js');
const { moderationChannelID } = require('../config.json');

const jailRoleId = '';
const protectedRoles = [''];

module.exports = {
    name: 'jail',
    description: 'Assign or remove the jail role',
    execute: async (message, args) => {
        if (message.channel.id !== moderationChannelID) {
            return;
        }

        if (args.length < 1) {
            return message.reply('You need to specify an action !jail or remove @user.');
        }

        const action = args.shift().toLowerCase();

        if (action === 'remove') {
            if (!message.mentions.users.size) {
                return message.reply('You need to @mention the user to remove from jail a user.');
            }

            const targetUser = message.mentions.members.first();

            if (!targetUser) {
                return message.reply('Check if this @username exist, no user found.');
            }

            try {
                const jailRole = message.guild.roles.cache.get(jailRoleId);
                if (!jailRole) {
                    return message.reply('Role ID not found');
                }

                if (!targetUser.roles.cache.has(jailRoleId)) {
                    return message.reply(`${targetUser.user.tag} is not jailed.`);
                }

                await targetUser.roles.remove(jailRole);

                const logChannel = message.guild.channels.cache.get(moderationChannelID);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Jail Action')
                        .addFields(
                            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
                            { name: 'User', value: `<@${targetUser.user.id}>`, inline: true },
                            { name: 'Action', value: 'Released from jail', inline: false }
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                message.reply('Error trying to release the user from jail.');
            }
        } else {
            if (!message.mentions.users.size || args.length < 1) {
                return message.reply('Please provide a reason for jailing. !jail @username reason');
            }

            const targetUser = message.mentions.members.first();
            const reason = args.join(' ').replace(`<@!${targetUser.id}>`, '').trim();

            if (!targetUser) {
                return message.reply('Check if this username exist, no user found.');
            }

            const hasProtectedRole = targetUser.roles.cache.some(role => protectedRoles.includes(role.id));
            if (hasProtectedRole) {
                return message.reply(`${targetUser.user.tag} has a protected role and cannot be jailed.`);
            }

            try {
                const jailRole = message.guild.roles.cache.get(jailRoleId);
                if (!jailRole) {
                    return message.reply('Role ID not found');
                }

                if (targetUser.roles.cache.has(jailRoleId)) {
                    return message.reply(`${targetUser.user.tag} is already jailed.`);
                }

                await targetUser.roles.add(jailRole);

                const logChannel = message.guild.channels.cache.get(moderationChannelID);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Jail Action')
                        .addFields(
                            { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
                            { name: 'User', value: `<@${targetUser.user.id}>`, inline: true },
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Action', value: 'Jailed', inline: false }
                        )
                        .setTimestamp();

                    logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error('Error jailing user:', error);
                message.reply('Error trying to jail the user.');
            }
        }
    }
};
