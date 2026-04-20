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

// ===== TIME (UTC - stabilní) =====
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

// ===== AUTO UPDATE SKLADU =====

async function updateStavMessage(client) {
  const channel = await client.channels.fetch(process.env.STAV_CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const { data: sklad } = await supabase
    .from('sklad')
    .select('*')
    .eq('id',1)
    .single();

  const text =
`📦 STAV SKLADU

💰 Peníze: ${sklad.penize}$
🌿 Tráva: ${sklad.trava}g
📦 Sáčky: ${Math.floor(sklad.trava/5)}

🕒 ${new Date().toLocaleTimeString("cs-CZ")}`;

  try {
    const msg = await channel.messages.fetch(process.env.STAV_MESSAGE_ID);
    await msg.edit(text);
  } catch {
    const msg = await channel.send(text);
    console.log("👉 Ulož do STAV_MESSAGE_ID:", msg.id);
  }
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

      await interaction.deferReply({ ephemeral: true });

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
          return interaction.editReply(msg);
        }

        const castka = vypocet(dnes+pocet) - vypocet(dnes);
        const spotreba = pocet * 5;

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.trava < spotreba) {
          const msg = "❌ Málo trávy";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.editReply(msg);
        }

        await supabase.from('sklad').update({
          trava: sklad.trava - spotreba,
          penize: sklad.penize + castka
        }).eq('id',1);

        await supabase.from('prodeje').insert({
          user_id, user_name, pocet, castka, datum:new Date()
        });
        await updateStavMessage(client);

        const msg = `💰 ${castka}$ | ${dnes+pocet}/60`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply({ content: msg, ephemeral:true });

        if (logChannel) {
          logChannel.send(`📥 ${user_name} prodal ${pocet} sáčků → ${castka}$ | -${spotreba}g`);
        }
      }

      // ===== PD =====
      if (interaction.commandName === 'pd') {
        const pocet = interaction.options.getInteger('pocet');
        const gramy = pocet * 5;

        await supabase.from('ztraty').insert({
          user_id,
          user_name,
          gramy,
          datum: new Date()
        });
        await updateStavMessage(client);

        const msg = `🚔 Zabaveno: ${pocet} sáčků (-${gramy}g)`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply({
          content: msg,
          ephemeral: true
        });

        if (logChannel) {
          logChannel.send(`🚔 ${user_name} byl chycen → -${pocet} sáčků (-${gramy}g)`);
        }
      }

      // ===== STAV =====
      if (interaction.commandName === 'stav') {
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
        const msg = `💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)} sáčků)`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply({
          content: msg,
          ephemeral:true
        });
      }

      // ===== MOJE =====
      if (interaction.commandName === 'moje') {
        const { data } = await supabase.from('prodeje').select('castka').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.castka,0);
        const dnes = await getTodayProdeje(user_id);

        const msg = `💰 Celkem: ${total}$\n📅 Dnes: ${dnes} sáčků`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply({ content: msg, ephemeral:true });
      }

      // ===== ZTRATY =====
      if (interaction.commandName === 'ztraty') {
        const { data } = await supabase.from('ztraty').select('gramy').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.gramy,0);
        const dnes = await getTodayZtraty(user_id);

        const msg = `📉 Celkem: ${total}g (~${Math.floor(total/5)} sáčků)\n📅 Dnes: ${dnes}g (~${Math.floor(dnes/5)} sáčků)`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply({ content: msg, ephemeral:true });
      }

      // ===== SBER =====
      if (interaction.commandName === 'sber') {
        const g = interaction.options.getInteger('gramy');

        if (g <= 0) {
          const msg = "❌ Musíš zadat kladné číslo";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.editReply({ content: msg, ephemeral:true });
        }

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        await supabase.from('sklad').update({
          trava: sklad.trava + g
        }).eq('id',1);
        await updateStavMessage(client);

        const msg = `🌿 +${g}g`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply({ content: msg, ephemeral:true });

        if (logChannel) {
          logChannel.send(`🌿 ${user_name} nasbíral +${g}g`);
        }
      }

      // ===== NAKUP =====
      if (interaction.commandName === 'nakup') {
        const c = interaction.options.getInteger('castka');
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.penize < c) {
          const msg = "❌ Málo peněz";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.editReply({ content: msg, ephemeral:true });
        }

        await supabase.from('sklad').update({
          penize: sklad.penize - c
        }).eq('id',1);
        await updateStavMessage(client);

        const msg = `💸 -${c}$`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        await interaction.editReply({ content: msg, ephemeral:true });

        if (logChannel) {
          logChannel.send(`💸 ${user_name} utratil -${c}$`);
        }
      }

      // ===== KALKULACE =====
      if (interaction.commandName === 'kalkulace') {

        delete pendingOrders[user_id];

        const p = interaction.options.getInteger('pocet');

        const modal = new ModalBuilder()
          .setCustomId(`nakup_modal_${user_id}_${Date.now()}`)
          .setTitle('Nákup surovin');

        const row = (id,label,val)=>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(label)
              .setStyle(TextInputStyle.Short)
              .setValue(String(val))
          );

        modal.addComponents(
          row('seminko','Semínka',p),
          row('voda','Voda',p*4),
          row('hnojivo_k','Kvalitní hnojivo',p*4),
          row('konev','Konev',p),
          row('hnojivo','Hnojivo',p)
        );

        return interaction.showModal(modal);
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith('nakup_modal')) {

      const data = {
        seminko: num(interaction.fields.getTextInputValue('seminko')),
        voda: num(interaction.fields.getTextInputValue('voda')),
        hnojivo_k: num(interaction.fields.getTextInputValue('hnojivo_k')),
        konev: num(interaction.fields.getTextInputValue('konev')),
        hnojivo: num(interaction.fields.getTextInputValue('hnojivo'))
      };

      const total =
        data.seminko*CENY.seminko +
        data.voda*CENY.voda +
        data.hnojivo_k*CENY.hnojivo_k +
        data.konev*CENY.konev +
        data.hnojivo*CENY.hnojivo;

      pendingOrders[user_id] = { data, total, createdAt: Date.now() };

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_buy').setLabel('✅ Potvrdit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('edit_buy').setLabel('✏️ Upravit').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content:
`🛒 NÁHLED NÁKUPU

🌱 Semínka: ${data.seminko}
💧 Voda: ${data.voda}
🧪 Kvalitní hnojivo: ${data.hnojivo_k}
🪣 Konev: ${data.konev}
🧴 Hnojivo: ${data.hnojivo}

💰 Cena: ${total}$
⏰ Platnost: 2 min`,
        components:[buttons],
        ephemeral:true
      });

      const adminLogChannel = await client.channels.fetch(LOG_CHANNEL_ADMIN).catch(() => null);
      if (adminLogChannel) {
        adminLogChannel.send(`↩️ RESPONSE\n👤 ${interaction.user.username}\n💬 NÁHLED ${total}$`);
      }
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {

      const order = pendingOrders[interaction.user.id];

      if (!order) {
        return interaction.reply({ content:"❌ Expirace", ephemeral:true });
      }

      if (Date.now() - order.createdAt > 120000) {
        delete pendingOrders[interaction.user.id];
        return interaction.reply({ content:"⏰ Vypršelo", ephemeral:true });
      }

      if (interaction.customId === 'confirm_buy') {

        const { data, total } = order;

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.penize < total) {
          return interaction.reply({ content:"❌ Málo peněz", ephemeral:true });
        }

        await supabase.from('sklad').update({
          penize: sklad.penize - total
        }).eq('id',1);
        await updateStavMessage(client);

        delete pendingOrders[interaction.user.id];

        await interaction.update({
          content:`✅ Nákup proveden (-${total}$)`,
          components:[]
        });

        if (LOG_CHANNEL_ADMIN) {
          const ch = await client.channels.fetch(LOG_CHANNEL_ADMIN).catch(()=>null);
          if (ch) ch.send(`↩️ RESPONSE\n👤 ${interaction.user.username}\n💬 Nákup -${total}$`);
        }

        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (logChannel) {
          logChannel.send(
`🛒 ${interaction.user.username} nakoupil suroviny → ${total}$

🌱 Semínka: ${data.seminko}
💧 Voda: ${data.voda}
🧪 Kvalitní hnojivo: ${data.hnojivo_k}
🪣 Konev: ${data.konev}
🧴 Hnojivo: ${data.hnojivo}`
          );
        }
      }

      if (interaction.customId === 'edit_buy') {
        delete pendingOrders[interaction.user.id];
        return interaction.reply({ content:"🔁 Použij znovu /kalkulace", ephemeral:true });
      }
    }

  } catch (err) {
    console.error(err);

    if (LOG_CHANNEL_ADMIN) {
      const ch = await client.channels.fetch(LOG_CHANNEL_ADMIN).catch(()=>null);
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
