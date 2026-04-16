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
  if (day !== 1) now.setHours(-24 * (day - 1));
  now.setHours(0, 0, 0, 0);
  return now;
}

// ===== TOP =====
async function postTopDaily(client) {
  const channel = client.channels.cache.get(TOP_CHANNEL_ID);
  if (!channel) return;

  const now = new Date();
  const cz = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));

  const today = new Date(cz);
  today.setHours(0, 0, 0, 0);

  const weekStart = getWeekStart();

  const { data } = await supabase.from('prodeje').select('*');

  let todayStats = {};
  let weekStats = {};

  data.forEach(z => {
    const d = new Date(z.datum);

    if (d >= today) {
      todayStats[z.user] = (todayStats[z.user] || 0) + z.castka;
    }

    if (d >= weekStart) {
      weekStats[z.user] = (weekStats[z.user] || 0) + z.castka;
    }
  });

  const topToday = Object.entries(todayStats).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topWeek = Object.entries(weekStats).sort((a,b)=>b[1]-a[1]).slice(0,5);

  let msg = "🏆 TOP Dealers\n\n";

  msg += "📅 Dnes:\n";
  topToday.forEach((u,i)=> msg += `${i+1}. ${u[0]} — ${u[1]}$\n`);

  msg += "\n📆 Týden:\n";
  topWeek.forEach((u,i)=> msg += `${i+1}. ${u[0]} — ${u[1]}$\n`);

  channel.send(msg);
}

// ===== Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet sáčků')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('stav')
    .setDescription('Stav skladu'),

  new SlashCommandBuilder()
    .setName('sber')
    .setDescription('Přidá trávu')
    .addIntegerOption(option =>
      option.setName('gramy')
        .setDescription('Počet gramů')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('nakup')
    .setDescription('Odečte peníze')
    .addIntegerOption(option =>
      option.setName('castka')
        .setDescription('Částka')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('moje')
    .setDescription('Moje statistiky'),

  new SlashCommandBuilder()
    .setName('pd')
    .setDescription('Zabavené sáčky')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet sáčků')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ztraty')
    .setDescription('Moje ztráty')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const user = interaction.member.displayName;
  const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

  // ===== PRODEJ =====
  if (interaction.commandName === 'prodej') {
    const pocet = interaction.options.getInteger('pocet');

    const today = new Date();
    today.setHours(0,0,0,0);

    const { data } = await supabase.from('prodeje').select('*').eq('user', user);

    let dnes = 0;
    data.forEach(z => {
      if (new Date(z.datum) >= today) dnes += z.pocet;
    });

    if (pocet > (60 - dnes)) {
      return interaction.reply({ content: `❌ Zbývá ${60 - dnes}`, ephemeral: true });
    }

    const castka = vypocet(pocet);
    const spotreba = pocet * 5;

    const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

    if (sklad.trava < spotreba) {
      return interaction.reply({ content: "❌ Málo trávy", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - spotreba,
      penize: sklad.penize + castka
    }).eq('id',1);

    await supabase.from('prodeje').insert({
      user, pocet, castka, datum: new Date()
    });

    await interaction.reply({
      content: `💰 ${castka}$ | ${dnes + pocet}/60`,
      ephemeral: true
    });

    if (logChannel) logChannel.send(`📥 ${user} ${pocet} ks (${castka}$)`);
  }

  // ===== PD =====
  if (interaction.commandName === 'pd') {
    const pocet = interaction.options.getInteger('pocet');
    const gramy = pocet * 5;

    const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

    if (sklad.trava < gramy) {
      return interaction.reply({ content: "❌ Málo trávy", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - gramy
    }).eq('id',1);

    await supabase.from('ztraty').insert({
      user, pocet, gramy, datum: new Date()
    });

    await interaction.reply({
      content: `🚔 ${pocet} ks (${gramy}g)`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(`🚔 ${user} přišel o ${pocet} ks (${gramy}g)`);
    }
  }

  // ===== MOJE =====
  if (interaction.commandName === 'moje') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = getWeekStart();

    const { data } = await supabase
      .from('prodeje')
      .select('*')
      .eq('user', user);

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
`📊 Moje statistiky

📅 Dnes:
💰 ${todayMoney}$
📦 ${todayPocet} ks

📆 Tento týden:
💰 ${weekMoney}$
📦 ${weekPocet} ks`,
      ephemeral: true
    });
  }

  // ===== ZTRATY =====
  if (interaction.commandName === 'ztraty') {
    const weekStart = getWeekStart();

    const { data } = await supabase.from('ztraty').select('*').eq('user', user);

    let week = 0, total = 0;

    data.forEach(z => {
      total += z.gramy;
      if (new Date(z.datum) >= weekStart) week += z.gramy;
    });

    await interaction.reply({
      content: `📉 Týden: ${week}g (~${Math.floor(week/5)})\n📊 Celkem: ${total}g (~${Math.floor(total/5)})`,
      ephemeral: true
    });
  }

  // ===== STAV =====
  if (interaction.commandName === 'stav') {
    const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

    await interaction.reply({
      content: `💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)})`,
      ephemeral: true
    });
  }
});

// ===== TIMER =====
let lastRun = null;

client.once('ready', () => {
  console.log("Bot ready");

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
