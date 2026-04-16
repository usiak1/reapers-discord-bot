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

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName('prodej').setDescription('Prodej').addIntegerOption(o=>o.setName('pocet').setRequired(true)),
  new SlashCommandBuilder().setName('stav').setDescription('Stav'),
  new SlashCommandBuilder().setName('moje').setDescription('Moje'),
  new SlashCommandBuilder().setName('ztraty').setDescription('Ztraty'),
  new SlashCommandBuilder().setName('sber').setDescription('Sber').addIntegerOption(o=>o.setName('gramy').setRequired(true)),
  new SlashCommandBuilder().setName('nakup').setDescription('Nakup').addIntegerOption(o=>o.setName('castka').setRequired(true)),
  new SlashCommandBuilder().setName('kalkulace').setDescription('Kalkulace').addIntegerOption(o=>o.setName('pocet').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {

  const logChannel = interaction.guild?.channels.cache.get(LOG_CHANNEL_ID);
  const user_id = interaction.user?.id;
  const user_name = interaction.member?.displayName;

  // ===== COMMANDY =====
  if (interaction.isChatInputCommand()) {

    // ===== PRODEJ =====
    if (interaction.commandName === 'prodej') {
      const pocet = interaction.options.getInteger('pocet');

      const today = new Date(); today.setHours(0,0,0,0);

      const { data } = await supabase.from('prodeje').select('*').eq('user_id', user_id);

      let dnes = 0;
      data.forEach(z=>{
        if(new Date(z.datum)>=today) dnes+=z.pocet;
      });

      if(pocet>(60-dnes)){
        return interaction.reply({content:`❌ Zbývá ${60-dnes}`,ephemeral:true});
      }

      const castka = vypocet(dnes+pocet)-vypocet(dnes);
      const spotreba = pocet*5;

      const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

      if(sklad.trava<spotreba){
        return interaction.reply({content:"❌ Málo trávy",ephemeral:true});
      }

      await supabase.from('sklad').update({
        trava: sklad.trava-spotreba,
        penize: sklad.penize+castka
      }).eq('id',1);

      await supabase.from('prodeje').insert({
        user_id,user_name,pocet,castka,datum:new Date()
      });

      await interaction.reply({content:`💰 ${castka}$ | ${dnes+pocet}/60`,ephemeral:true});
      if(logChannel) logChannel.send(`📥 ${user_name} ${pocet} ks (${castka}$)`);
    }

    // ===== STAV =====
    if (interaction.commandName === 'stav') {
      const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
      return interaction.reply({content:`💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g`,ephemeral:true});
    }

    // ===== SBER =====
    if (interaction.commandName === 'sber') {
      const gramy = interaction.options.getInteger('gramy');
      const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

      await supabase.from('sklad').update({
        trava: sklad.trava + gramy
      }).eq('id',1);

      return interaction.reply({content:`🌿 +${gramy}g`,ephemeral:true});
    }

    // ===== NAKUP =====
    if (interaction.commandName === 'nakup') {
      const castka = interaction.options.getInteger('castka');
      const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

      if(sklad.penize<castka){
        return interaction.reply({content:"❌ Málo peněz",ephemeral:true});
      }

      await supabase.from('sklad').update({
        penize: sklad.penize - castka
      }).eq('id',1);

      return interaction.reply({content:`💸 -${castka}$`,ephemeral:true});
    }

    // ===== MOJE =====
    if (interaction.commandName === 'moje') {
      const { data } = await supabase.from('prodeje').select('*').eq('user_id', user_id);
      let total=0;
      data.forEach(z=> total+=z.castka);
      return interaction.reply({content:`💰 Celkem: ${total}$`,ephemeral:true});
    }

    // ===== ZTRATY =====
    if (interaction.commandName === 'ztraty') {
      const { data } = await supabase.from('ztraty').select('*').eq('user_id', user_id);
      let total=0;
      data.forEach(z=> total+=z.gramy);
      return interaction.reply({content:`📉 ${total}g`,ephemeral:true});
    }

    // ===== KALKULACE (MODAL) =====
    if (interaction.commandName === 'kalkulace') {
      const pocet = interaction.options.getInteger('pocet');

      const modal = new ModalBuilder()
        .setCustomId('nakup_modal')
        .setTitle('Nákup');

      const input = (id,label,val)=> new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setValue(String(val))
      );

      modal.addComponents(
        input('seminko','Semínka',pocet),
        input('voda','Voda',pocet*4),
        input('hnojivo_k','Kvalitní hnojivo',pocet*4),
        input('konev','Konev',pocet),
        input('hnojivo','Hnojivo',pocet)
      );

      return interaction.showModal(modal);
    }
  }

  // ===== MODAL =====
  if (interaction.isModalSubmit()) {
    const data = {
      seminko:+interaction.fields.getTextInputValue('seminko'),
      voda:+interaction.fields.getTextInputValue('voda'),
      hnojivo_k:+interaction.fields.getTextInputValue('hnojivo_k'),
      konev:+interaction.fields.getTextInputValue('konev'),
      hnojivo:+interaction.fields.getTextInputValue('hnojivo')
    };

    const total =
      data.seminko*CENY.seminko +
      data.voda*CENY.voda +
      data.hnojivo_k*CENY.hnojivo_k +
      data.konev*CENY.konev +
      data.hnojivo*CENY.hnojivo;

    pendingOrders[user_id]={data,total,createdAt:Date.now()};

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('edit').setLabel('✏️').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      content:`🛒 Náhled\n💰 ${total}$\n⏰ 2 min`,
      components:[row],
      ephemeral:true
    });
  }

  // ===== BUTTON =====
  if (interaction.isButton()) {

    const order = pendingOrders[user_id];
    if(!order) return interaction.reply({content:"❌ Expired",ephemeral:true});

    if(Date.now()-order.createdAt>120000){
      delete pendingOrders[user_id];
      return interaction.reply({content:"⏰ Expired",ephemeral:true});
    }

    if(interaction.customId==='confirm'){
      const { data, total } = order;

      const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

      if(sklad.penize<total){
        return interaction.reply({content:"❌ Málo peněz",ephemeral:true});
      }

      await supabase.from('sklad').update({
        penize: sklad.penize-total
      }).eq('id',1);

      delete pendingOrders[user_id];

      interaction.update({content:`✅ -${total}$`,components:[]});

      if(logChannel){
        logChannel.send(`🛒 ${user_name}\n💰 ${total}$`);
      }
    }

    if(interaction.customId==='edit'){
      return interaction.reply({content:"Použij znovu /kalkulace",ephemeral:true});
    }
  }

});

client.login(TOKEN);
