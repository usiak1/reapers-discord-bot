const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1494222775814983810";

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

// ===== Slash commands =====
const commands = [
  new SlashCommandBuilder()
    .setName('odevzdat')
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
    )
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

  // ===== ODEVZDAT =====
  if (interaction.commandName === 'odevzdat') {
    const pocet = interaction.options.getInteger('pocet');

    if (pocet > 60) {
      return interaction.reply("Max je 60 sáčků.");
    }

    const castka = vypocet(pocet);
    const user = interaction.user.username;
    const spotreba = pocet * 5;

    // načti sklad
    const { data: sklad, error } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      return interaction.reply("❌ Chyba při načítání skladu.");
    }

    if (sklad.trava < spotreba) {
      return interaction.reply("❌ Není dost trávy na skladě!");
    }

    // update sklad
    await supabase
      .from('sklad')
      .update({
        trava: sklad.trava - spotreba,
        penize: sklad.penize + castka
      })
      .eq('id', 1);

    // uložit prodej
    await supabase.from('prodeje').insert({
      user,
      pocet,
      castka,
      datum: new Date()
    });

    interaction.reply(`💰 Odevzdal jsi: **${castka}$**\n🌿 Spotřebováno: ${spotreba}g`);
  }

  // ===== STAV =====
  if (interaction.commandName === 'stav') {
    const { data: sklad, error } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      return interaction.reply("❌ Chyba při načítání skladu.");
    }

    interaction.reply(
      `📦 Stav skladu:\n💰 Peníze: ${sklad.penize}$\n🌿 Tráva: ${sklad.trava}g`
    );
  }

  // ===== SBER =====
  if (interaction.commandName === 'sber') {
    const gramy = interaction.options.getInteger('gramy');

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    await supabase
      .from('sklad')
      .update({
        trava: sklad.trava + gramy
      })
      .eq('id', 1);

    interaction.reply(`🌿 Přidáno ${gramy}g na sklad.`);
  }

  // ===== NAKUP =====
  if (interaction.commandName === 'nakup') {
    const castka = interaction.options.getInteger('castka');

    const { data: sklad } = await supabase
      .from('sklad')
      .select('*')
      .eq('id', 1)
      .single();

    if (sklad.penize < castka) {
      return interaction.reply("❌ Není dost peněz!");
    }

    await supabase
      .from('sklad')
      .update({
        penize: sklad.penize - castka
      })
      .eq('id', 1);

    interaction.reply(`💸 Odečteno ${castka}$ ze skladu.`);
  }
});

client.login(TOKEN);
