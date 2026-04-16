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

const pendingOrders = {};

// ===== SAFE PARSE =====
function num(val) {
  const n = parseInt(val);
  return isNaN(n) ? 0 : n;
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

client.on('interactionCreate', async interaction => {

  try {

    const user_id = interaction.user.id;
    const user_name = interaction.member?.displayName || interaction.user.username;
    const logChannel = interaction.guild?.channels.cache.get(LOG_CHANNEL_ID);

    // ===== SLASH =====
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'kalkulace') {
        const pocet = interaction.options.getInteger('pocet');

        const modal = new ModalBuilder()
          .setCustomId('nakup_modal')
          .setTitle('Nákup');

        const input = (id, label, val) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(label)
              .setStyle(TextInputStyle.Short)
              .setValue(String(val))
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

      // ostatní commandy nechám jednoduché (aby nic nepadalo)
      return interaction.reply({ content: "OK", ephemeral: true });
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit() && interaction.customId === 'nakup_modal') {

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

      pendingOrders[user_id] = {
        data,
        total,
        createdAt: Date.now()
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_buy').setLabel('✅ Potvrdit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('edit_buy').setLabel('✏️ Upravit').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: `🛒 Náhled\n💰 ${total}$\n⏰ 2 min`,
        components: [row],
        ephemeral: true
      });
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {

      const order = pendingOrders[user_id];

      if (!order) {
        return interaction.reply({ content: "❌ Expirace", ephemeral: true });
      }

      if (Date.now() - order.createdAt > 120000) {
        delete pendingOrders[user_id];
        return interaction.reply({ content: "⏰ Vypršelo", ephemeral: true });
      }

      if (interaction.customId === 'confirm_buy') {

        const { data, total } = order;

        const { data: sklad } = await supabase
          .from('sklad')
          .select('*')
          .eq('id', 1)
          .single();

        if (sklad.penize < total) {
          return interaction.reply({ content: "❌ Málo peněz", ephemeral: true });
        }

        await supabase.from('sklad').update({
          penize: sklad.penize - total
        }).eq('id', 1);

        delete pendingOrders[user_id];

        await interaction.update({
          content: `✅ Nákup: -${total}$`,
          components: []
        });

        if (logChannel) {
          logChannel.send(`🛒 ${user_name}\n💰 ${total}$`);
        }
      }

      if (interaction.customId === 'edit_buy') {
        delete pendingOrders[user_id];
        return interaction.reply({ content: "🔁 Použij znovu /kalkulace", ephemeral: true });
      }
    }

  } catch (err) {
    console.error("ERROR:", err);

    if (!interaction.replied) {
      interaction.reply({ content: "❌ Chyba", ephemeral: true });
    }
  }
});

client.login(TOKEN);
