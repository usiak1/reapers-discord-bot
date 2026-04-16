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

// ===== DOČASNÉ OBJEDNÁVKY =====
const pendingOrders = {};

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('kalkulace')
    .setDescription('Kalkulace nákupu')
    .addIntegerOption(option =>
      option.setName('pocet')
        .setDescription('Počet kytek')
        .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {

  // ===== /kalkulace =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'kalkulace') {
    const pocet = interaction.options.getInteger('pocet');

    const modal = new ModalBuilder()
      .setCustomId('nakup_modal')
      .setTitle(`Nákup (${pocet} kytek)`);

    const input = (id, label, val) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(String(val))
      );

    modal.addComponents(
      input('seminko', 'Semínka', pocet),
      input('voda', 'Voda', pocet * 4),
      input('hnojivo_k', 'Kvalitní hnojivo', pocet * 4),
      input('konev', 'Konev', pocet),
      input('hnojivo', 'Hnojivo', pocet)
    );

    return interaction.showModal(modal);
  }

  // ===== MODAL SUBMIT =====
  if (interaction.isModalSubmit() && interaction.customId === 'nakup_modal') {

    const user_id = interaction.user.id;

    const data = {
      seminko: parseInt(interaction.fields.getTextInputValue('seminko')),
      voda: parseInt(interaction.fields.getTextInputValue('voda')),
      hnojivo_k: parseInt(interaction.fields.getTextInputValue('hnojivo_k')),
      konev: parseInt(interaction.fields.getTextInputValue('konev')),
      hnojivo: parseInt(interaction.fields.getTextInputValue('hnojivo'))
    };

    const total =
      data.seminko * CENY.seminko +
      data.voda * CENY.voda +
      data.hnojivo_k * CENY.hnojivo_k +
      data.konev * CENY.konev +
      data.hnojivo * CENY.hnojivo;

    // uložíme pending
    pendingOrders[user_id] = { data, total };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_buy')
        .setLabel('✅ Potvrdit')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('edit_buy')
        .setLabel('✏️ Upravit')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      content:
`🛒 **NÁHLED NÁKUPU**

🌱 Semínka: ${data.seminko}
💧 Voda: ${data.voda}
🧪 Kvalitní hnojivo: ${data.hnojivo_k}
🪣 Konev: ${data.konev}
🧴 Hnojivo: ${data.hnojivo}

💰 Cena: ${total}$`,
      components: [row],
      ephemeral: true
    });
  }

  // ===== BUTTONY =====
  if (interaction.isButton()) {

    const user_id = interaction.user.id;
    const user_name = interaction.member.displayName;
    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

    const order = pendingOrders[user_id];
    if (!order) {
      return interaction.reply({ content: "❌ Expirace dat", ephemeral: true });
    }

    // ===== POTVRDIT =====
    if (interaction.customId === 'confirm_buy') {

      const { data, total } = order;

      const { data: sklad } = await supabase
        .from('sklad')
        .select('*')
        .eq('id', 1)
        .single();

      if (sklad.penize < total) {
        return interaction.reply({
          content: "❌ Nedostatek peněz",
          ephemeral: true
        });
      }

      await supabase.from('sklad').update({
        penize: sklad.penize - total
      }).eq('id', 1);

      delete pendingOrders[user_id];

      await interaction.update({
        content: `✅ Nákup proveden (-${total}$)`,
        components: []
      });

      // 🔥 LOG (PŘEHLEDNÝ)
      if (logChannel) {
        logChannel.send(
`🛒 **NÁKUP SUROVIN**

👤 ${user_name}

🌱 Semínka: ${data.seminko}
💧 Voda: ${data.voda}
🧪 Kvalitní hnojivo: ${data.hnojivo_k}
🪣 Konev: ${data.konev}
🧴 Hnojivo: ${data.hnojivo}

💰 Celkem: ${total}$`
        );
      }
    }

    // ===== UPRAVIT =====
    if (interaction.customId === 'edit_buy') {

      const d = order.data;

      const modal = new ModalBuilder()
        .setCustomId('nakup_modal')
        .setTitle('Upravit nákup');

      const input = (id, label, val) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setValue(String(val))
        );

      modal.addComponents(
        input('seminko', 'Semínka', d.seminko),
        input('voda', 'Voda', d.voda),
        input('hnojivo_k', 'Kvalitní hnojivo', d.hnojivo_k),
        input('konev', 'Konev', d.konev),
        input('hnojivo', 'Hnojivo', d.hnojivo)
      );

      return interaction.showModal(modal);
    }
  }
});

client.login(TOKEN);
