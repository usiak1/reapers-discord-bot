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

// ===== TIME =====
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

  return (data || []).reduce((sum, z) => sum + z.pocet, 0);
}

async function getTodayZtraty(user_id) {
  const today = getTodayUTC();

  const { data } = await supabase
    .from('ztraty')
    .select('gramy')
    .eq('user_id', user_id)
    .gte('datum', today.toISOString());

  return (data || []).reduce((sum, z) => sum + z.gramy, 0);
}

// ===== ADMIN FORMAT =====
function formatCommand(interaction) {
  const name = interaction.commandName;

  const options = interaction.options.data
    .map(opt => `${opt.name}:${opt.value}`)
    .join(" ");

  return `/${name}${options ? " " + options : ""}`;
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('prodej').setDescription('Prodej sáčků')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet').setRequired(true)),

  new SlashCommandBuilder().setName('pd').setDescription('Zabavené sáčky')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet').setRequired(true)),

  new SlashCommandBuilder().setName('stav').setDescription('Stav skladu'),
  new SlashCommandBuilder().setName('moje').setDescription('Statistiky'),
  new SlashCommandBuilder().setName('ztraty').setDescription('Ztráty'),

  new SlashCommandBuilder().setName('sber').setDescription('Sběr')
    .addIntegerOption(o => o.setName('gramy').setRequired(true)),

  new SlashCommandBuilder().setName('nakup').setDescription('Nákup')
    .addIntegerOption(o => o.setName('castka').setRequired(true)),

  new SlashCommandBuilder().setName('kalkulace').setDescription('Kalkulace')
    .addIntegerOption(o => o.setName('pocet').setRequired(true))
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

      await interaction.deferReply({ ephemeral: true });

      const commandText = formatCommand(interaction);

      if (adminLogChannel) {
        adminLogChannel.send(`🧾 COMMAND\n👤 ${user_name}\n💬 ${commandText}`);
      }

      // ===== PRODEJ =====
      if (interaction.commandName === 'prodej') {
        const pocet = interaction.options.getInteger('pocet');
        const dnes = await getTodayProdeje(user_id);

        if (pocet > (60 - dnes)) {
          return interaction.editReply(`❌ Zbývá ${60-dnes}`);
        }

        const castka = vypocet(dnes+pocet) - vypocet(dnes);
        const spotreba = pocet * 5;

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.trava < spotreba) {
          return interaction.editReply("❌ Málo trávy");
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
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply(msg);

        if (logChannel) {
          logChannel.send(`📥 ${user_name} prodal ${pocet} → ${castka}$`);
        }
      }

      // ===== SBER =====
      if (interaction.commandName === 'sber') {
        const g = interaction.options.getInteger('gramy');

        if (g <= 0) return interaction.editReply("❌ Neplatné číslo");

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        await supabase.from('sklad').update({
          trava: sklad.trava + g
        }).eq('id',1);

        await interaction.editReply(`🌿 +${g}g`);
      }

      // ===== STAV =====
      if (interaction.commandName === 'stav') {
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
        return interaction.editReply(`💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g`);
      }

      // ===== MOJE =====
      if (interaction.commandName === 'moje') {
        const { data } = await supabase.from('prodeje').select('castka').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.castka,0);
        return interaction.editReply(`💰 ${total}$`);
      }

      // ===== ZTRATY =====
      if (interaction.commandName === 'ztraty') {
        const { data } = await supabase.from('ztraty').select('gramy').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.gramy,0);
        return interaction.editReply(`📉 ${total}g`);
      }

    }

  } catch (err) {
    console.error(err);

    if (!interaction.replied) {
      interaction.reply({ content:"❌ Chyba", ephemeral:true });
    }
  }
});

client.login(TOKEN);
