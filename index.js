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

  const now = new Date();
  const czTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));

  const today = new Date(czTime);
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase.from('prodeje').select('*');

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
    .setName('prodej')
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
    .setDescription('Zobrazí tvoje statistiky'),

  new SlashCommandBuilder()
    .setName('pd')
    .setDescription('Zabavené sáčky policií')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet sáčků')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ztraty')
    .setDescription('Zobrazí tvoje ztráty')
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
  const user = interaction.member.displayName;

  if (interaction.commandName === 'prodej') {
    const pocet = interaction.options.getInteger('pocet');

    if (pocet > 60) {
      return interaction.reply({ content: "Max je 60 sáčků.", ephemeral: true });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: prodeje } = await supabase
      .from('prodeje')
      .select('*')
      .eq('user', user);

    let dnesProdano = 0;

    prodeje.forEach(z => {
      const d = new Date(z.datum);
      if (d >= today) dnesProdano += z.pocet;
    });

    const zbyva = 60 - dnesProdano;

    if (pocet > zbyva) {
      return interaction.reply({
        content: `❌ Dnes můžeš prodat ještě ${zbyva} sáčků.`,
        ephemeral: true
      });
    }

    const castka = vypocet(pocet);
    const spotreba = pocet * 5;

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (sklad.trava < spotreba) {
      return interaction.reply({ content: "❌ Není dost trávy!", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - spotreba,
      penize: sklad.penize + castka
    }).eq('id', 1);

    await supabase.from('prodeje').insert({
      user,
      pocet,
      castka,
      datum: new Date()
    });

    await interaction.reply({
      content: `💰 ${castka}$ | 📦 ${dnesProdano + pocet}/60`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(`📥 ${user} → ${pocet} ks (${castka}$)`);
    }
  }

  if (interaction.commandName === 'pd') {
    const pocet = interaction.options.getInteger('pocet');
    const gramy = pocet * 5;

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (sklad.trava < gramy) {
      return interaction.reply({ content: "❌ Není dost trávy.", ephemeral: true });
    }

    await supabase.from('sklad').update({
      trava: sklad.trava - gramy
    }).eq('id', 1);

    await supabase.from('ztraty').insert({
      user,
      pocet,
      gramy,
      datum: new Date()
    });

    await interaction.reply({
      content: `🚔 ${pocet} sáčků (${gramy}g)`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'ztraty') {
    const weekStart = getWeekStart();

    const { data } = await supabase
      .from('ztraty')
      .select('*')
      .eq('user', user);

    let week = 0;
    let total = 0;

    data.forEach(z => {
      const d = new Date(z.datum);
      total += z.gramy;
      if (d >= weekStart) week += z.gramy;
    });

    await interaction.reply({
      content: `📉 Týden: ${week}g (~${Math.floor(week/5)} sáčků)\n📊 Celkem: ${total}g (~${Math.floor(total/5)} sáčků)`,
      ephemeral: true
    });
  }
});

// ===== TIMER (CZ čas) =====
let lastRun = null;

client.once('ready', () => {
  console.log('Bot ready');

  setInterval(() => {
    const now = new Date();
    const czTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));

    const key = czTime.toDateString() + czTime.getHours() + czTime.getMinutes();

    if (
      czTime.getHours() === TOP_HOUR &&
      czTime.getMinutes() === TOP_MINUTE &&
      lastRun !== key
    ) {
      lastRun = key;
      postTopDaily(client);
    }
  }, 60000);
});

client.login(TOKEN);
