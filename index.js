const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1494222775814983810";

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const TOP_CHANNEL_ID = process.env.TOP_CHANNEL_ID;
const TOP_HOUR = parseInt(process.env.TOP_HOUR);
const TOP_MINUTE = parseInt(process.env.TOP_MINUTE);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== Výpočet progresivní =====
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
      if (!todayStats[z.user_id]) {
        todayStats[z.user_id] = { name: z.user_name, money: 0 };
      }
      todayStats[z.user_id].money += z.castka;
      todayStats[z.user_id].name = z.user_name;
    }

    if (d >= weekStart) {
      if (!weekStats[z.user_id]) {
        weekStats[z.user_id] = { name: z.user_name, money: 0 };
      }
      weekStats[z.user_id].money += z.castka;
      weekStats[z.user_id].name = z.user_name;
    }
  });

  const topToday = Object.values(todayStats).sort((a,b)=>b.money-a.money).slice(0,5);
  const topWeek = Object.values(weekStats).sort((a,b)=>b.money-a.money).slice(0,5);

  let msg = "🏆 TOP Dealers\n\n";

  msg += "📅 Dnes:\n";
  topToday.forEach((u,i)=> msg += `${i+1}. ${u.name} — ${u.money}$\n`);

  msg += "\n📆 Týden:\n";
  topWeek.forEach((u,i)=> msg += `${i+1}. ${u.name} — ${u.money}$\n`);

  channel.send(msg);
}

// ===== Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(option =>
      option.setName('pocet').setDescription('Počet sáčků').setRequired(true)
    ),

  new SlashCommandBuilder().setName('stav').setDescription('Stav skladu'),
  new SlashCommandBuilder().setName('moje').setDescription('Moje statistiky')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const user_id = interaction.user.id;
  const user_name = interaction.member.displayName;

  // ===== PRODEJ (OPRAVENÝ) =====
  if (interaction.commandName === 'prodej') {
    const pocet = interaction.options.getInteger('pocet');

    const today = new Date();
    today.setHours(0,0,0,0);

    const { data } = await supabase
      .from('prodeje')
      .select('*')
      .eq('user_id', user_id);

    let dnes = 0;
    data.forEach(z => {
      if (new Date(z.datum) >= today) dnes += z.pocet;
    });

    if (pocet > (60 - dnes)) {
      return interaction.reply({ content: `❌ Zbývá ${60 - dnes}`, ephemeral: true });
    }

    // 🔥 KLÍČOVÁ LOGIKA
    const totalBefore = vypocet(dnes);
    const totalAfter = vypocet(dnes + pocet);
    const castka = totalAfter - totalBefore;

    const spotreba = pocet * 5;

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id',1)
      .single();

    if (sklad.trava < spotreba) {
      return interaction.reply({ content: "❌ Málo trávy", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - spotreba,
      penize: sklad.penize + castka
    }).eq('id',1);

    await supabase.from('prodeje').insert({
      user_id,
      user_name,
      pocet,
      castka,
      datum: new Date()
    });

    await interaction.reply({
      content: `💰 ${castka}$ | ${dnes + pocet}/60`,
      ephemeral: true
    });
  }
});

// ===== TIMER =====
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
