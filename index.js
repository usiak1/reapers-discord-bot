// 🔴 ZMĚNA: nic nahoře se nemění

client.on('interactionCreate', async interaction => {
  try {
    const user_id = interaction.user.id;
    const user_name = interaction.member?.displayName || interaction.user.username;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    const adminLogChannel = await client.channels.fetch(LOG_CHANNEL_ADMIN).catch(() => null);

    if (interaction.isChatInputCommand()) {

      // 🔥 FIX: zabrání timeoutu
      await interaction.deferReply({ ephemeral: true });

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

        const msg = `💰 ${castka}$ | ${dnes+pocet}/60`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply(msg);

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

        const msg = `🚔 Zabaveno: ${pocet} sáčků (-${gramy}g)`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply(msg);

        if (logChannel) {
          logChannel.send(`🚔 ${user_name} byl chycen → -${pocet} sáčků (-${gramy}g)`);
        }
      }

      // ===== STAV =====
      if (interaction.commandName === 'stav') {
        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();
        const msg = `💰 ${sklad.penize}$ | 🌿 ${sklad.trava}g (~${Math.floor(sklad.trava/5)} sáčků)`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply(msg);
      }

      // ===== MOJE =====
      if (interaction.commandName === 'moje') {
        const { data } = await supabase.from('prodeje').select('castka').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.castka,0);
        const dnes = await getTodayProdeje(user_id);

        const msg = `💰 Celkem: ${total}$\n📅 Dnes: ${dnes} sáčků`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply(msg);
      }

      // ===== ZTRATY =====
      if (interaction.commandName === 'ztraty') {
        const { data } = await supabase.from('ztraty').select('gramy').eq('user_id', user_id);
        const total = (data || []).reduce((a,b)=>a+b.gramy,0);
        const dnes = await getTodayZtraty(user_id);

        const msg = `📉 Celkem: ${total}g (~${Math.floor(total/5)} sáčků)\n📅 Dnes: ${dnes}g (~${Math.floor(dnes/5)} sáčků)`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        return interaction.editReply(msg);
      }

      // ===== SBER =====
      if (interaction.commandName === 'sber') {
        const g = interaction.options.getInteger('gramy');

        if (g <= 0) {
          const msg = "❌ Musíš zadat kladné číslo";
          if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
          return interaction.editReply(msg);
        }

        const { data: sklad } = await supabase.from('sklad').select('*').eq('id',1).single();

        await supabase.from('sklad').update({
          trava: sklad.trava + g
        }).eq('id',1);

        const msg = `🌿 +${g}g`;

        if (adminLogChannel) {
          adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);
        }

        await interaction.editReply(msg);

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
          return interaction.editReply(msg);
        }

        await supabase.from('sklad').update({
          penize: sklad.penize - c
        }).eq('id',1);

        const msg = `💸 -${c}$`;

        if (adminLogChannel) adminLogChannel.send(`↩️ RESPONSE\n👤 ${user_name}\n💬 ${msg}`);

        await interaction.editReply(msg);

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

    // 🔴 MODAL + BUTTON BEZE ZMĚN

  } catch (err) {
    console.error(err);

    if (!interaction.replied) {
      interaction.reply({ content:"❌ Chyba aplikace", ephemeral:true });
    }
  }
});
