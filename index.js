const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1494222775814983810";
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const LOG_CHANNEL_ADMIN = process.env.LOG_CHANNEL_ADMIN;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== CENY =====
const CENY = {
  seminko: 50,
  voda: 40,
  hnojivo_k: 50,
  konev: 20,
  hnojivo: 25
};

// ===== PENDING =====
const pendingOrders = {};

// ===== VÝPOČET =====
function vypocet(pocet) {
  return Math.min(pocet, 20) * 180 +
    Math.max(Math.min(pocet - 20, 10), 0) * 170 +
    Math.max(Math.min(pocet - 30, 10), 0) * 160 +
    Math.max(pocet - 40, 0) * 150;
}

function num(v) {
  const n = parseInt(v);
  return isNaN(n) ? 0 : n;
}

// ===== TIME (UTC) =====
function getTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function getTodayProdeje(user_id) {
  const today = getTodayUTC();

  const { data } = await supabase
    .from('prodeje')
    .select('pocet')
    .eq('user_id', user_id)
    .gte('datum', today.toISOString());

  return data.reduce((sum, z) => sum + z.pocet, 0);
}

async function getTodayZtraty(user_id) {
  const today = getTodayUTC();

  const { data } = await supabase
    .from('ztraty')
    .select('gramy')
    .eq('user_id', user_id)
    .gte('datum', today.toISOString());

  return data.reduce((sum, z) => sum + z.gramy, 0);
}

// ===== ADMIN LOG FORMAT =====
function formatCommand(interaction) {
  const name = interaction.commandName;

  const options = interaction.options.data
    .map(opt => `${opt.name}:${opt.value}`)
    .join(" ");

  return `/${name}${options ? " " + options : ""}`;
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet sáčků').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pd')
    .setDescription('Zabavené sáčky (policie)')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet zabavených sáčků').setRequired(true)),

  new SlashCommandBuilder()
    .setName('stav')
    .setDescription('Zobrazí stav skladu'),

  new SlashCommandBuilder()
    .setName('moje')
    .setDescription('Moje statistiky'),

  new SlashCommandBuilder()
    .setName('ztraty')
    .setDescription('Moje ztráty'),

  new SlashCommandBuilder()
    .setName('sber')
    .setDescription('Přidá trávu na sklad')
    .addIntegerOption(o => o.setName('gramy').setDescription('Kolik gramů').setRequired(true)),

  new SlashCommandBuilder()
    .setName('nakup')
    .setDescription('Odečte peníze ze skladu')
    .addIntegerOption(o => o.setName('castka').setDescription('Kolik peněz').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kalkulace')
    .setDescription('Kalkulace nákupu surovin')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet kytek').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  try {
    const user_id = interaction.user.id;
    const user_name = interaction.member?.displayName || interaction.user.username;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const adminLogChannel = await client.channels.fetch(LOG_CHANNEL_ADMIN).catch(() => null);

    if (interaction.isChatInputCommand()) {

      // ===== ADMIN LOG INPUT =====
      const commandText = formatCommand(interaction);

      if (adminLogChannel) {
        adminLogChannel.send(
`🧾 COMMAND
👤 ${user_name}
🆔 ${user_id}
💬 ${commandText}`
        );
      }

      // ===== PRODEJ =====
      if (interaction.commandName === 'prodej') {
        const pocet = interaction.options.getInteger('pocet');

        const dnes = await getTodayProdeje(user_id);

        if (pocet > (60 - dnes)) {
          const msg = `❌ Zbývá ${60-dnes}`;
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.reply({ content: msg, ephemeral:true });
        }

        const castka = vypocet(dnes+pocet) - vypocet(dnes);
        const spotreba = pocet * 5;

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.trava < spotreba) {
          const msg = "❌ Málo trávy";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.reply({ content: msg, ephemeral:true });
        }

        await supabase.from('sklad').update({
          trava: sklad.trava - spotreba,
          penize: sklad.penize + castka
        }).eq('id',1);

        await supabase.from('prodeje').insert({
          user_id, user_name, pocet, castka, datum:new Date()
        });

        const msg = `💰 ${castka}$ | ${dnes+pocet}/60`;

        if (adminLogChannel) {
          adminLogChannel.send(
`↩️ RESPONSE
👤 ${user_name}
💬 ${msg}`
          );
        }

        await interaction.reply({ content: msg, ephemeral:true });

        if (logChannel) {
          logChannel.send(`📥 ${user_name} prodal ${pocet} sáčků → ${castka}$ | -${spotreba}g`);
        }
      }

      // ===== SBER =====
      if (interaction.commandName === 'sber') {
        const g = interaction.options.getInteger('gramy');

        if (g <= 0) {
          const msg = "❌ Musíš zadat kladné číslo";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.reply({ content: msg, ephemeral:true });
        }

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        await supabase.from('sklad').update({
          trava: sklad.trava + g
        }).eq('id',1);

        const msg = `🌿 +${g}g`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.reply({ content: msg, ephemeral:true });

        if (logChannel) {
          logChannel.send(`🌿 ${user_name} nasbíral +${g}g`);
        }
      }

      // ===== OSTATNÍ (zkráceno – stejný pattern) =====
      if (interaction.commandName === 'stav') {
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
        const msg = `💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)} sáčků)`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.reply({ content: msg, ephemeral:true });
      }

    }

  } catch (err) {
    console.error(err);

    if (process.env.LOG_CHANNEL_ADMIN) {
      const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ADMIN).catch(()=>null);
      if (ch) {
        ch.send(`❌ ERROR\n📛 ${err.message}`);
      }
    }

    if (!interaction.replied) {
      interaction.reply({ content:"❌ Chyba aplikace", ephemeral:true });
    }
  }
});

client.login(TOKEN);
