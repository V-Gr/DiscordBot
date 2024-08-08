module.exports = {
  name: 'ping',
  description: 'Ping command',
  async execute(message, args) {
    message.channel.send('Pong!');
  },
};
