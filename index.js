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

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(o => o.setName('pocet').setDescription('Počet sáčků').setRequired(true)),

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

    // ===== SLASH =====
    if (interaction.isChatInputCommand()) {

      // ===== PRODEJ =====
      if (interaction.commandName === 'prodej') {

        const pocet = interaction.options.getInteger('pocet');

        const today = new Date();
        today.setHours(0,0,0,0);

        const { data } = await supabase.from('prodeje').select('*').eq('user_id', user_id);

        let dnes = 0;
        data.forEach(z=>{
          if(new Date(z.datum)>=today) dnes+=z.pocet;
        });

        if (pocet > (60 - dnes)) {
          return interaction.reply({ content:`❌ Zbývá ${60-dnes}`, ephemeral:true });
        }

        const castka = vypocet(dnes+pocet) - vypocet(dnes);
        const spotreba = pocet * 5;

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.trava < spotreba) {
          return interaction.reply({ content:"❌ Málo trávy", ephemeral:true });
        }

        await supabase.from('sklad').update({
          trava: sklad.trava - spotreba,
          penize: sklad.penize + castka
        }).eq('id',1);

        await supabase.from('prodeje').insert({
          user_id, user_name, pocet, castka, datum:new Date()
        });

        await interaction.reply({ content:`💰 ${castka}$ | ${dnes+pocet}/60`, ephemeral:true });

        if (logChannel) {
          logChannel.send(`📥 ${user_name} prodal ${pocet} sáčků → ${castka}$ | -${spotreba}g`);
        }
      }

      // ===== STAV =====
      if (interaction.commandName === 'stav') {
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
        return interaction.reply({
          content:`💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)} sáčků)`,
          ephemeral:true
        });
      }

      // ===== SBER =====
      if (interaction.commandName === 'sber') {
        const g = interaction.options.getInteger('gramy');
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        await supabase.from('sklad').update({
          trava: sklad.trava + g
        }).eq('id',1);

        await interaction.reply({ content:`🌿 +${g}g`, ephemeral:true });

        if (logChannel) {
          logChannel.send(`🌿 ${user_name} nasbíral +${g}g`);
        }
      }

      // ===== NAKUP =====
      if (interaction.commandName === 'nakup') {
        const c = interaction.options.getInteger('castka');
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        if (sklad.penize < c) {
          return interaction.reply({ content:"❌ Málo peněz", ephemeral:true });
        }

        await supabase.from('sklad').update({
          penize: sklad.penize - c
        }).eq('id',1);

        await interaction.reply({ content:`💸 -${c}$`, ephemeral:true });

        if (logChannel) {
          logChannel.send(`💸 ${user_name} utratil -${c}$`);
        }
      }

      // ===== MOJE =====
      if (interaction.commandName === 'moje') {
        const { data } = await supabase.from('prodeje').select('*').eq('user_id', user_id);
        const total = data.reduce((a,b)=>a+b.castka,0);
        return interaction.reply({ content:`💰 ${total}$`, ephemeral:true });
      }

      // ===== ZTRATY =====
      if (interaction.commandName === 'ztraty') {
        const { data } = await supabase.from('ztraty').select('*').eq('user_id', user_id);
        const total = data.reduce((a,b)=>a+b.gramy,0);
        return interaction.reply({ content:`📉 ${total}g (~${Math.floor(total/5)} sáčků)`, ephemeral:true });
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

      return interaction.reply({
        content:
`🛒 **NÁHLED NÁKUPU**

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
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {

      const order = pendingOrders[user_id];

      if (!order) {
        return interaction.reply({ content:"❌ Expirace", ephemeral:true });
      }

      if (Date.now() - order.createdAt > 120000) {
        delete pendingOrders[user_id];
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

        delete pendingOrders[user_id];

        await interaction.update({
          content:`✅ Nákup proveden (-${total}$)`,
          components:[]
        });

        if (logChannel) {
logChannel.send(
`🛒 ${user_name} nakoupil suroviny → ${total}$

🌱 Semínka: ${data.seminko}
💧 Voda: ${data.voda}
🧪 Kvalitní hnojivo: ${data.hnojivo_k}
🪣 Konev: ${data.konev}
🧴 Hnojivo: ${data.hnojivo}`
);
        }
      }

      if (interaction.customId === 'edit_buy') {
        delete pendingOrders[user_id];
        return interaction.reply({ content:"🔁 Použij znovu /kalkulace", ephemeral:true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content:"❌ Chyba aplikace", ephemeral:true });
    }
  }
});

client.login(TOKEN);
