const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1494222775814983810";

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const TOP_CHANNEL_ID = process.env.TOP_CHANNEL_ID;
const TOP_HOUR = parseInt(process.env.TOP_HOUR);
const TOP_MINUTE = parseInt(process.env.TOP_MINUTE);

// ===== Supabase =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

// ===== Týden =====
function getWeekStart() {
  const now = new Date();
  const day = now.getDay() || 7;
  if (day !== 1) {
    now.setHours(-24 * (day - 1));
  }
  now.setHours(0, 0, 0, 0);
  return now;
}

// ===== DAILY TOP =====
async function postTopDaily(client) {
  const channel = client.channels.cache.get(TOP_CHANNEL_ID);
  if (!channel) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('prodeje')
    .select('*');

  if (error) return;

  let stats = {};

  data.forEach(z => {
    const d = new Date(z.datum);
    if (d >= today) {
      if (!stats[z.user]) stats[z.user] = 0;
      stats[z.user] += z.castka;
    }
  });

  const sorted = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    return channel.send("📭 Dnes zatím žádné prodeje.");
  }

  let msg = "🏆 TOP Dealers (dnes)\n\n";
  const medals = ["🥇", "🥈", "🥉"];

  sorted.forEach((u, i) => {
    const icon = medals[i] || `${i + 1}.`;
    msg += `${icon} ${u[0]} — ${u[1]}$\n`;
  });

  channel.send(msg);
}

// ===== Slash commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('odevzdat')
    .setDescription('Zadej počet prodaných sáčků')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet sáčků (max 60)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('stav')
    .setDescription('Zobrazí stav skladu'),

  new SlashCommandBuilder()
    .setName('sber')
    .setDescription('Přidá trávu na sklad')
    .addIntegerOption(option =>
      option.setName('gramy')
        .setDescription('Kolik gramů')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('nakup')
    .setDescription('Odečte peníze ze skladu')
    .addIntegerOption(option =>
      option.setName('castka')
        .setDescription('Kolik $')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('moje')
    .setDescription('Zobrazí tvoje statistiky')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

  // ===== ODEVZDAT =====
  if (interaction.commandName === 'odevzdat') {
    const pocet = interaction.options.getInteger('pocet');

    if (pocet > 60) {
      return interaction.reply({ content: "Max je 60 sáčků.", ephemeral: true });
    }

    const castka = vypocet(pocet);
    const user = interaction.user.username;
    const spotreba = pocet * 5;

    const { data: sklad, error } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      return interaction.reply({ content: "❌ Chyba při načítání skladu.", ephemeral: true });
    }

    if (sklad.trava < spotreba) {
      return interaction.reply({ content: "❌ Není dost trávy na skladě!", ephemeral: true });
    }

    await supabase
      .from('sklad')
      .update({
        trava: sklad.trava - spotreba,
        penize: sklad.penize + castka
      })
      .eq('id', 1);

    await supabase.from('prodeje').insert({
      user,
      pocet,
      castka,
      datum: new Date()
    });

    await interaction.reply({
      content: `💰 Odevzdal jsi: **${castka}$**\n🌿 Spotřebováno: ${spotreba}g`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(`📥 ${user} odevzdal ${pocet} sáčků → ${castka}$ | -${spotreba}g`);
    }
  }

  // ===== STAV =====
  if (interaction.commandName === 'stav') {
    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    await interaction.reply({
      content: `📦 Stav skladu:\n💰 ${sklad.penize}$\n🌿 ${sklad.trava}g`,
      ephemeral: true
    });
  }

  // ===== SBER =====
  if (interaction.commandName === 'sber') {
    const gramy = interaction.options.getInteger('gramy');

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    await supabase
      .from('sklad')
      .update({
        trava: sklad.trava + gramy
      })
      .eq('id', 1);

    await interaction.reply({
      content: `🌿 Přidáno ${gramy}g na sklad.`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(`🌿 +${gramy}g přidáno na sklad (${interaction.user.username})`);
    }
  }

  // ===== NAKUP =====
  if (interaction.commandName === 'nakup') {
    const castka = interaction.options.getInteger('castka');

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (sklad.penize < castka) {
      return interaction.reply({ content: "❌ Není dost peněz!", ephemeral: true });
    }

    await supabase
      .from('sklad')
      .update({
        penize: sklad.penize - castka
      })
      .eq('id', 1);

    await interaction.reply({
      content: `💸 Odečteno ${castka}$ ze skladu.`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(`💸 -${castka}$ ze skladu (${interaction.user.username})`);
    }
  }

  // ===== MOJE =====
  if (interaction.commandName === 'moje') {
    const user = interaction.user.username;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = getWeekStart();

    const { data, error } = await supabase
      .from('prodeje')
      .select('*')
      .eq('user', user);

    if (error) {
      return interaction.reply({ content: "❌ Chyba při načítání dat.", ephemeral: true });
    }

    let todayMoney = 0;
    let todayPocet = 0;
    let weekMoney = 0;
    let weekPocet = 0;

    data.forEach(z => {
      const d = new Date(z.datum);

      if (d >= today) {
        todayMoney += z.castka;
        todayPocet += z.pocet;
      }

      if (d >= weekStart) {
        weekMoney += z.castka;
        weekPocet += z.pocet;
      }
    });

    await interaction.reply({
      content:
`📊 Tvoje statistiky

📅 Dnes:
💰 ${todayMoney}$
📦 ${todayPocet} sáčků

📆 Tento týden:
💰 ${weekMoney}$
📦 ${weekPocet} sáčků`,
      ephemeral: true
    });
  }
});

// ===== TIMER =====
let lastRun = null;

client.once('ready', () => {
  console.log('Bot ready');

  setInterval(() => {
    const now = new Date();
    const key = now.toDateString() + now.getHours() + now.getMinutes();

    if (now.getHours() === TOP_HOUR && now.getMinutes() === TOP_MINUTE && lastRun !== key) {
      lastRun = key;
      postTopDaily(client);
    }
  }, 60000);
});

client.login(TOKEN);
