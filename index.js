const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

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

// ===== CENY =====
const CENY = {
  seminko: 50,
  voda: 40,
  hnojivo_k: 50,
  konev: 20,
  hnojivo: 25
};

// ===== Výpočet =====
function vypocet(pocet) {
  return Math.min(pocet, 20) * 180 +
    Math.max(Math.min(pocet - 20, 10), 0) * 170 +
    Math.max(Math.min(pocet - 30, 10), 0) * 160 +
    Math.max(pocet - 40, 0) * 150;
}

// ===== Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('prodej')
    .setDescription('Prodej sáčků')
    .addIntegerOption(option =>
      option.setName('pocet').setDescription('Počet').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('kalkulace')
    .setDescription('Kalkulace nákupu')
    .addIntegerOption(option =>
      option.setName('pocet').setDescription('Počet kytek').setRequired(true)
    ),

  new SlashCommandBuilder().setName('stav').setDescription('Stav skladu'),
  new SlashCommandBuilder().setName('moje').setDescription('Moje statistiky'),
  new SlashCommandBuilder().setName('ztraty').setDescription('Moje ztráty')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {

    const user_id = interaction.user.id;
    const user_name = interaction.member.displayName;
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    // ===== PRODEJ =====
    if (interaction.commandName === 'prodej') {
      const pocet = interaction.options.getInteger('pocet');

      const today = new Date();
      today.setHours(0,0,0,0);

      const { data } = await supabase.from('prodeje').select('*').eq('user_id', user_id);

      let dnes = 0;
      data.forEach(z => {
        if (new Date(z.datum) >= today) dnes += z.pocet;
      });

      if (pocet > (60 - dnes)) {
        return interaction.reply({ content: `❌ Zbývá ${60 - dnes}`, ephemeral: true });
      }

      const totalBefore = vypocet(dnes);
      const totalAfter = vypocet(dnes + pocet);
      const castka = totalAfter - totalBefore;

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
        user_id, user_name, pocet, castka, datum: new Date()
      });

      await interaction.reply({
        content: `💰 ${castka}$ | ${dnes + pocet}/60`,
        ephemeral: true
      });

      if (logChannel) logChannel.send(`📥 ${user_name} ${pocet} ks (${castka}$)`);
    }

    // ===== KALKULACE → MODAL =====
    if (interaction.commandName === 'kalkulace') {
      const pocet = interaction.options.getInteger('pocet');

      const modal = new ModalBuilder()
        .setCustomId('nakup_modal')
        .setTitle(`Nákup (${pocet} kytek)`);

      const createInput = (id, label, value) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setValue(String(value))
        );

      modal.addComponents(
        createInput('seminko', 'Semínka', pocet),
        createInput('voda', 'Voda', pocet * 4),
        createInput('hnojivo_k', 'Kvalitní hnojivo', pocet * 4),
        createInput('konev', 'Konev', pocet),
        createInput('hnojivo', 'Hnojivo', pocet)
      );

      await interaction.showModal(modal);
    }
  }

  // ===== MODAL SUBMIT =====
  if (interaction.isModalSubmit()) {

    const user_name = interaction.member.displayName;
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    const seminko = parseInt(interaction.fields.getTextInputValue('seminko'));
    const voda = parseInt(interaction.fields.getTextInputValue('voda'));
    const hnojivo_k = parseInt(interaction.fields.getTextInputValue('hnojivo_k'));
    const konev = parseInt(interaction.fields.getTextInputValue('konev'));
    const hnojivo = parseInt(interaction.fields.getTextInputValue('hnojivo'));

    const total =
      seminko * CENY.seminko +
      voda * CENY.voda +
      hnojivo_k * CENY.hnojivo_k +
      konev * CENY.konev +
      hnojivo * CENY.hnojivo;

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (sklad.penize < total) {
      return interaction.reply({
        content: `❌ Nedostatek peněz (${total}$)`,
        ephemeral: true
      });
    }

    await supabase.from('sklad').update({
      penize: sklad.penize - total
    }).eq('id', 1);

    await interaction.reply({
      content: `🛒 Nákup proveden\n💰 -${total}$`,
      ephemeral: true
    });

    if (logChannel) {
      logChannel.send(
        `🛒 ${user_name} nákup\n🌱 ${seminko} | 💧 ${voda} | 🧪 ${hnojivo_k} | 🪣 ${konev} | 🧴 ${hnojivo}\n💰 ${total}$`
      );
    }
  }
});

// ===== START =====
client.login(TOKEN);
