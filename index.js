const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1494222775814983810";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== Výpočet =====
function vypocet(pocet) {
  return Math.min(pocet, 20) * 180 +
    Math.max(Math.min(pocet - 20, 10), 0) * 170 +
    Math.max(Math.min(pocet - 30, 10), 0) * 160 +
    Math.max(pocet - 40, 0) * 150;
}

// ===== Uložení =====
function ulozData(user, pocet, castka) {
  let data = {};
  if (fs.existsSync('data.json')) {
    data = JSON.parse(fs.readFileSync('data.json'));
  }

  if (!data[user]) data[user] = [];

  data[user].push({
    pocet,
    castka,
    datum: new Date().toISOString()
  });

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// ===== Slash command =====
const commands = [
  new SlashCommandBuilder()
    .setName('odevzdat')
    .setDescription('Zadej počet prodaných sáčků')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet sáčků (max 60)')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'odevzdat') {
    const pocet = interaction.options.getInteger('pocet');

    if (pocet > 60) {
      return interaction.reply("Max je 60 sáčků.");
    }

    const castka = vypocet(pocet);
    const user = interaction.user.username;

    ulozData(user, pocet, castka);

    interaction.reply(`💰 Máš odevzdat: **${castka}$**`);
  }
});

client.login(TOKEN);