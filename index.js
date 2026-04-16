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

// ===== DAILY + WEEKLY TOP =====
async function postTopDaily(client) {
  const channel = client.channels.cache.get(TOP_CHANNEL_ID);
  if (!channel) return;

  const now = new Date();
  const czTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));

  const today = new Date(czTime);
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date(czTime);
  const day = weekStart.getDay() || 7;
  if (day !== 1) {
    weekStart.setHours(-24 * (day - 1));
  }
  weekStart.setHours(0, 0, 0, 0);

  const { data } = await supabase.from('prodeje').select('*');

  let todayStats = {};
  let weekStats = {};

  data.forEach(z => {
    const d = new Date(z.datum);

    if (d >= today) {
      if (!todayStats[z.user]) todayStats[z.user] = 0;
      todayStats[z.user] += z.castka;
    }

    if (d >= weekStart) {
      if (!weekStats[z.user]) weekStats[z.user] = 0;
      weekStats[z.user] += z.castka;
    }
  });

  const topToday = Object.entries(todayStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topWeek = Object.entries(weekStats).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let msg = "🏆 **TOP Dealers**\n\n";
  const medals = ["🥇", "🥈", "🥉"];

  msg += "📅 **Dnes:**\n";
  if (topToday.length === 0) {
    msg += "📭 Žádné prodeje\n";
  } else {
    topToday.forEach((u, i) => {
      const icon = medals[i] || `${i + 1}.`;
      msg += `${icon} ${u[0]} — ${u[1]}$\n`;
    });
  }

  msg += "\n📆 **Tento týden:**\n";
  if (topWeek.length === 0) {
    msg += "📭 Žádné prodeje\n";
  } else {
    topWeek.forEach((u, i) => {
      const icon = medals[i] || `${i + 1}.`;
      msg += `${icon} ${u[0]} — ${u[1]}$\n`;
    });
  }

  channel.send(msg);
}

// ===== Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(option =>
      option.setName('pocet').setDescription('Počet').setRequired(true)
    ),

  new SlashCommandBuilder().setName('stav').setDescription('Stav skladu'),

  new SlashCommandBuilder()
    .setName('sber')
    .setDescription('Přidá trávu')
    .addIntegerOption(option =>
      option.setName('gramy').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('nakup')
    .setDescription('Odečte peníze')
    .addIntegerOption(option =>
      option.setName('castka').setRequired(true)
    ),

  new SlashCommandBuilder().setName('moje').setDescription('Moje stats'),

  new SlashCommandBuilder()
    .setName('pd')
    .setDescription('Zabavené sáčky')
    .addIntegerOption(option =>
      option.setName('pocet').setRequired(true)
    ),

  new SlashCommandBuilder().setName('ztraty').setDescription('Moje ztráty')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
  const user = interaction.member.displayName;

  // PRODEJ
  if (interaction.commandName === 'prodej') {
    const pocet = interaction.options.getInteger('pocet');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: prodeje } = await supabase.from('prodeje').select('*').eq('user', user);

    let dnes = 0;
    prodeje.forEach(z => {
      if (new Date(z.datum) >= today) dnes += z.pocet;
    });

    if (pocet > (60 - dnes)) {
      return interaction.reply({ content: `❌ Zbývá ${60 - dnes}`, ephemeral: true });
    }

    const castka = vypocet(pocet);
    const spotreba = pocet * 5;

    const { data: sklad } = await supabase.from('sklad').select('*').eq('id', 1).single();

    if (sklad.trava < spotreba) {
      return interaction.reply({ content: "❌ Málo trávy", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - spotreba,
      penize: sklad.penize + castka
    }).eq('id', 1);

    await supabase.from('prodeje').insert({
      user, pocet, castka, datum: new Date()
    });

    interaction.reply({
      content: `💰 ${castka}$ | 📦 ${dnes + pocet}/60`,
      ephemeral: true
    });

    if (logChannel) logChannel.send(`📥 ${user} ${pocet} ks (${castka}$)`);
  }

  // PD
  if (interaction.commandName === 'pd') {
    const pocet = interaction.options.getInteger('pocet');
    const gramy = pocet * 5;

    const { data: sklad } = await supabase.from('sklad').select('*').eq('id', 1).single();

    if (sklad.trava < gramy) {
      return interaction.reply({ content: "❌ Málo trávy", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - gramy
    }).eq('id', 1);

    await supabase.from('ztraty').insert({
      user, pocet, gramy, datum: new Date()
    });

    interaction.reply({
      content: `🚔 ${pocet} ks (${gramy}g)`,
      ephemeral: true
    });
  }

  // ZTRATY
  if (interaction.commandName === 'ztraty') {
    const weekStart = getWeekStart();

    const { data } = await supabase.from('ztraty').select('*').eq('user', user);

    let week = 0, total = 0;

    data.forEach(z => {
      total += z.gramy;
      if (new Date(z.datum) >= weekStart) week += z.gramy;
    });

    interaction.reply({
      content: `📉 Týden: ${week}g (~${Math.floor(week/5)})\n📊 Celkem: ${total}g (~${Math.floor(total/5)})`,
      ephemeral: true
    });
  }

  // STAV
  if (interaction.commandName === 'stav') {
    const { data: sklad } = await supabase.from('sklad').select('*').eq('id', 1).single();

    interaction.reply({
      content: `💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)})`,
      ephemeral: true
    });
  }
});

// ===== TIMER CZ =====
let lastRun = null;

client.once('ready', () => {
  setInterval(() => {
    const now = new Date();
    const cz = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));

    const key = cz.toDateString() + cz.getHours() + cz.getMinutes();

    if (cz.getHours() === TOP_HOUR && cz.getMinutes() === TOP_MINUTE && lastRun !== key) {
      lastRun = key;
      postTopDaily(client);
    }
  }, 60000);
});

client.login(TOKEN);
