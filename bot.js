const { Telegraf } = require('telegraf');
const { PureDB } = require('pure.db');

// Render'dan token'ı çekiyoruz
const botToken = process.env.BOT_TOKEN;
if (!botToken) {
    console.error("KRİTİK HATA: BOT_TOKEN bulunamadı! Lütfen Render'da Environment sekmesine ekleyin.");
    process.exit(1);
}

const bot = new Telegraf(botToken);

// Veritabanı (Render'ın kendi diskinde oluşturur)
const db = new PureDB({ filePath: './hayday_db.json' });

// --- YARDIMCI FONKSİYONLAR ---
// Hay Day oyuncu etiketi kontrolü (Örn: #ABC123)
function etiketGecerliMi(etiket) {
    return /^#[A-Z0-9]{2,10}$/i.test(etiket);
}

// --- BOT KOMUTLARI VE ÖZELLİKLERİ ---

// 1. Yeni Üye Karşılama
bot.on('new_chat_members', async (ctx) => {
    for (const uye of ctx.message.new_chat_members) {
        await ctx.reply(`👋 Hoş geldin ${uye.first_name}!\n\nHay Day Takas grubumuza katıldığın için teşekkürler. Lütfen önce /kurallar yazarak kuralları oku. İyi takaslar!`);
    }
});

// 2. Yardım / Menü Komutu
bot.command(['yardim', 'menu', 'help'], async (ctx) => {
    const menuMesaji = `🤖 **HAY DAY TAKAS BOTU - KOMUTLAR**\n\n` +
        `Ben bir Hay Day takas asistanıyım. İşte size sunabileceğim komutlar:\n\n` +
        `📜 **/kurallar**\nGrup kurallarını gösterir.\n\n` +
        `🔄 **/takas [SATIŞ/ALIM] [ÜRÜN] [MİKTAR] [ETİKET]**\nGruba yeni bir takas veya alım-satım ilanı bırakır.\n_Örnek: /takas SATIŞ Buğday 100 #ABC123_\n\n` +
        `✅ **/tamamlandi**\nBir ilana yanıt (reply) vererek yazarsanız, takasın bittiğini bildirir.\n\n` +
        `⭐ **/puanver [ETİKET] [1-5]**\nTakas yaptığınız oyuncuya güven puanı verir.\n_Örnek: /puanver #ABC123 5_\n\n` +
        `📊 **/puan [ETİKET]**\nBir oyuncunun güncel güven puanını ve oy sayısını gösterir.\n\n` +
        `🎁 **/gunluk**\nGünlük aktiflik görevinizi tamamlayıp 10 güven puanı kazanmanızı sağlar.\n\n` +
        `🚨 **/sikayet [ETİKET] [SEBEP]**\nDolandırıcılık veya kural ihlali durumunda şikayet iletir.\n\n` +
        `_Beni kullanarak güvenli takas yapabilirsiniz. İyi oyunlar!_ 🎮`;

    await ctx.reply(menuMesaji, { parse_mode: 'Markdown' });
});

// 3. Takas Kurallarını Hatırlatma
bot.command('kurallar', async (ctx) => {
    const kurallar = `📜 **HAY DAY TAKAS KURALLARI**\n\n` +
        `1. Sadece Hay Day ile ilgili alım-satım ve takas ilanları verilebilir.\n` +
        `2. İlan verirken oyuncu etiketinizi (örn: #ABC123) doğru girin.\n` +
        `3. Dolandırıcılık kesinlikle yasaktır. Şikayet edildiğinde kalıcı olarak banlanırsınız.\n` +
        `4. Küfür, hakaret ve spam yasaktır.\n` +
        `5. Takas sonrası karşı tarafa puan vermeyi unutmayın.\n\n` +
        `Günlük puan kazanmak için /gunluk yazabilirsiniz.`;
    await ctx.reply(kurallar, { parse_mode: 'Markdown' });
});

// 4. Ürün Takası ve Alım-Satım İlanı Paylaşma (/takas komutu)
bot.command('takas', async (ctx) => {
    const mesaj = ctx.message.text.split(' ').slice(1);
    
    if (mesaj.length < 4) {
        return ctx.reply(`⚠️ Eksik bilgi girdiniz.\n\n**Doğru Kullanım:**\n\`/takas [SATIŞ/ALIM] [ÜRÜN] [MİKTAR] [ETİKET]\`\n\n**Örnek:**\n\`/takas SATIŞ Buğday 100 #ABC123\``, { parse_mode: 'Markdown' });
    }

    const tip = mesaj[0].toUpperCase();
    const urun = mesaj[1];
    const miktar = mesaj[2];
    const etiket = mesaj[3];

    // Oyuncu Etiketi Kontrolü
    if (!etiketGecerliMi(etiket)) {
        return ctx.reply('❌ Hatalı etiket formatı! Lütfen etiketi #ABC123 şeklinde girin.');
    }

    const ilan = {
        id: Date.now(),
        tip: tip,
        urun: urun,
        miktar: miktar,
        etiket: etiket,
        kullaniciId: ctx.from.id,
        kullaniciAdi: ctx.from.username || ctx.from.first_name,
        tarih: new Date().toISOString()
    };

    const ilanlar = db.get('ilanlar') || [];
    ilanlar.push(ilan);
    db.set('ilanlar', ilanlar);

    await ctx.reply(
        `✅ **TAKAS İLANI YAYINLANDI**\n\n` +
        `📌 **Tip:** ${tip}\n` +
        `📦 **Ürün:** ${urun}\n` +
        `⚖️ **Miktar:** ${miktar}\n` +
        `🏷️ **Etiket:** ${etiket}\n` +
        `👤 **İlan Sahibi:** @${ctx.from.username || ctx.from.first_name}\n\n` +
        `_Takas yapmak isteyenler lütfen ilan sahibine özelden yazsın._`,
        { parse_mode: 'Markdown' }
    );
});

// 5. Takas Tamamlandı Bildirimi
bot.command('tamamlandi', async (ctx) => {
    const yanitlananMesaj = ctx.message.reply_to_message;
    
    if (!yanitlananMesaj) {
        return ctx.reply('⚠️ Takası tamamladığınız ilanın mesajına **yanıt (reply)** vererek bu komutu kullanmalısınız.');
    }

    await ctx.reply(`🎉 **Takas Tamamlandı!**\n\nLütfen karşı tarafa dürüstlüğü için puan verin:\n\`/puanver [ETİKET] [1-5]\`\nÖrnek: \`/puanver #ABC123 5\``, { parse_mode: 'Markdown' });
});

// 6. Güvenilir Oyuncu Puanlama
bot.command('puanver', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
        return ctx.reply('Kullanım: `/puanver <oyuncu_etiketi> <1-5 arası puan>`\nÖrnek: `/puanver #ABC123 5`', { parse_mode: 'Markdown' });
    }

    const hedefEtiket = args[0].toUpperCase();
    const puan = parseInt(args[1]);

    if (!etiketGecerliMi(hedefEtiket)) {
        return ctx.reply('❌ Geçersiz etiket formatı.');
    }

    if (isNaN(puan) || puan < 1 || puan > 5) {
        return ctx.reply('❌ Lütfen 1 ile 5 arasında bir puan girin.');
    }

    const anahtar = `puanlar_${hedefEtiket}`;
    const mevcutVeri = db.get(anahtar) || { toplamPuan: 0, oySayisi: 0 };
    
    mevcutVeri.toplamPuan += puan;
    mevcutVeri.oySayisi += 1;
    db.set(anahtar, mevcutVeri);

    const ortalama = (mevcutVeri.toplamPuan / mevcutVeri.oySayisi).toFixed(1);
    await ctx.reply(`✅ **Puanınız Kaydedildi!**\n\nOyuncu: ${hedefEtiket}\nVerdiğiniz Puan: ${puan}\n\n📊 **Oyuncunun Güncel Ortalaması:** ${ortalama} (${mevcutVeri.oySayisi} oy)`, { parse_mode: 'Markdown' });
});

// 7. Günlük Aktiflik Görevi
bot.command('gunluk', async (ctx) => {
    const userId = ctx.from.id;
    const bugun = new Date().toISOString().split('T')[0]; 
    const anahtar = `gunluk_gorev_${userId}`;
    
    const sonKatilim = db.get(anahtar);
    if (sonKatilim === bugun) {
        return ctx.reply('⏳ Bugünkü günlük görevinizi zaten tamamladınız. Yarın tekrar bekleriz!');
    }

    db.set(anahtar, bugun);
    
    const puanKey = `puanlar_#KULLANICI_${userId}`;
    const mevcutPuan = db.get(puanKey) || 0;
    db.set(puanKey, mevcutPuan + 10);

    await ctx.reply('✅ Günlük aktiflik göreviniz tamamlandı! Hesabınıza **10 güven puanı** eklendi. Yarın tekrar gelin!');
});

// 8. Dolandırıcılık Şikâyeti
bot.command('sikayet', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
        return ctx.reply('Kullanım: `/sikayet <oyuncu_etiketi> <sebep>`\nÖrnek: `/sikayet #ABC123 Ürünü verip paramı almadı.`', { parse_mode: 'Markdown' });
    }

    const hedefEtiket = args[0].toUpperCase();
    const sebep = args.slice(1).join(' ');

    const sikayetler = db.get('sikayetler') || [];
    sikayetler.push({
        etiket: hedefEtiket,
        sebep: sebep,
        sikayetci: ctx.from.id,
        sikayetciAd: ctx.from.username || ctx.from.first_name,
        tarih: new Date().toISOString()
    });
    db.set('sikayetler', sikayetler);

    await ctx.reply(`🚨 **Şikayetiniz Alındı**\n\nYetkililer en kısa sürede inceleme yapacaktır. Lütfen kanıtlarınızı (ekran görüntüsü vb.) yöneticilere iletin.`);
});

// 9. Puan Sorgulama
bot.command('puan', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
        return ctx.reply('Kullanım: `/puan <oyuncu_etiketi>`\nÖrnek: `/puan #ABC123`', { parse_mode: 'Markdown' });
    }

    const hedefEtiket = args[0].toUpperCase();
    const anahtar = `puanlar_${hedefEtiket}`;
    const mevcutVeri = db.get(anahtar);

    if (!mevcutVeri) {
        return ctx.reply(`ℹ️ ${hedefEtiket} etiketli oyuncu için henüz hiç puan verilmemiş.`);
    }

    const ortalama = (mevcutVeri.toplamPuan / mevcutVeri.oySayisi).toFixed(1);
    await ctx.reply(`📊 **Oyuncu İstatistikleri**\n\n🏷️ Etiket: ${hedefEtiket}\n⭐ Ortalama Puan: **${ortalama}**\n🗳️ Toplam Oy: ${mevcutVeri.oySayisi}`, { parse_mode: 'Markdown' });
});

// --- BOTU BAŞLATMA ---
// Render sunucusunda botun çalışmasını sağlayan ana komut
bot.launch()
    .then(() => console.log('🤖 Hay Day Takas Botu başarıyla başlatıldı ve çalışıyor!'))
    .catch((err) => console.error('Bot başlatılırken hata oluştu:', err));

// Olası çökmelerde botun düzgün kapanmasını sağlar
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
