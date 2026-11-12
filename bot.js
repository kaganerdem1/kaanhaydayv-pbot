const { Telegraf } = require('telegraf');
const { PureDB } = require('pure.db');
const http = require('http'); // Render port hatasını çözer

// --- RENDER PORT AYARI ---
// Bu kısım Render'ın "No open ports detected" hatasını engeller.
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Aktif');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Render için port ${PORT} dinleniyor...`);
});

// --- BOT KURULUMU ---
const botToken = process.env.BOT_TOKEN;
const grupId = process.env.GRUP_ID; // Render'daki Environment'tan geliyor

if (!botToken) {
    console.error("KRİTİK HATA: BOT_TOKEN bulunamadı! Lütfen Render'da Environment sekmesine ekleyin.");
    process.exit(1);
}

const bot = new Telegraf(botToken);
const db = new PureDB({ filePath: './hayday_db.json' });

// --- YARDIMCI FONKSİYONLAR ---
function etiketGecerliMi(etiket) {
    return /^#[A-Z0-9]{2,10}$/i.test(etiket);
}

// --- BOT KOMUTLARI ---

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
        `🔄 **/takas [SATIŞ/ALIM] [ÜRÜN] [MİKTAR] [ETİKET]**\nGruba yeni bir takas ilanı bırakır.\n_Örnek: /takas SATIŞ Buğday 100 #ABC123_\n\n` +
        `✅ **/tamamlandi**\nBir ilana yanıt (reply) vererek yazarsanız, takasın bittiğini bildirir.\n\n` +
        `⭐ **/puanver [ETİKET] [1-5]**\nTakas yaptığınız oyuncuya güven puanı verir.\n\n` +
        `📊 **/puan [ETİKET]**\nBir oyuncunun güncel güven puanını gösterir.\n\n` +
        `🎁 **/gunluk**\nGünlük aktiflik görevinizi tamamlayıp puan kazanırsınız.\n\n` +
        `🚨 **/sikayet [ETİKET] [SEBEP]**\nDolandırıcılık durumunda şikayet iletir.`;

    await ctx.reply(menuMesaji, { parse_mode: 'Markdown' });
});

// 3. Kurallar
bot.command('kurallar', async (ctx) => {
    const kurallar = `📜 **HAY DAY TAKAS KURALLARI**\n\n` +
        `1. Sadece Hay Day ile ilgili takas ilanları verilebilir.\n` +
        `2. Oyuncu etiketinizi (örn: #ABC123) doğru girin.\n` +
        `3. Dolandırıcılık kesinlikle yasaktır.\n` +
        `4. Saygılı olun.\n\n` +
        `Günlük puan kazanmak için /gunluk yazabilirsiniz.`;
    await ctx.reply(kurallar, { parse_mode: 'Markdown' });
});

// 4. Takas İlanı Verme
bot.command('takas', async (ctx) => {
    const mesaj = ctx.message.text.split(' ').slice(1);
    if (mesaj.length < 4) {
        return ctx.reply(`⚠️ Eksik bilgi girdiniz.\n\n**Doğru Kullanım:**\n\`/takas [SATIŞ/ALIM] [ÜRÜN] [MİKTAR] [ETİKET]\`\n\n**Örnek:**\n\`/takas SATIŞ Buğday 100 #ABC123\``, { parse_mode: 'Markdown' });
    }

    const tip = mesaj[0].toUpperCase();
    const urun = mesaj[1];
    const miktar = mesaj[2];
    const etiket = mesaj[3];

    if (!etiketGecerliMi(etiket)) {
        return ctx.reply('❌ Hatalı etiket formatı! Lütfen etiketi #ABC123 şeklinde girin.');
    }

    const ilan = { id: Date.now(), tip, urun, miktar, etiket, kullaniciId: ctx.from.id, kullaniciAdi: ctx.from.username || ctx.from.first_name, tarih: new Date().toISOString() };
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
        `_Takas yapmak isteyenler lütfen ilan sahibine özelden yazsın._`, { parse_mode: 'Markdown' }
    );
});

// 5. Takas Tamamlandı
bot.command('tamamlandi', async (ctx) => {
    if (!ctx.message.reply_to_message) {
        return ctx.reply('⚠️ Takası tamamladığınız ilanın mesajına **yanıt (reply)** vererek bu komutu kullanmalısınız.');
    }
    await ctx.reply(`🎉 **Takas Tamamlandı!**\n\nLütfen karşı tarafa dürüstlüğü için puan verin:\n\`/puanver [ETİKET] [1-5]\``, { parse_mode: 'Markdown' });
});

// 6. Puanlama
bot.command('puanver', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Kullanım: `/puanver <oyuncu_etiketi> <1-5 arası puan>`\nÖrnek: `/puanver #ABC123 5`', { parse_mode: 'Markdown' });

    const hedefEtiket = args[0].toUpperCase();
    const puan = parseInt(args[1]);

    if (!etiketGecerliMi(hedefEtiket)) return ctx.reply('❌ Geçersiz etiket formatı.');
    if (isNaN(puan) || puan < 1 || puan > 5) return ctx.reply('❌ Lütfen 1 ile 5 arasında bir puan girin.');

    const anahtar = `puanlar_${hedefEtiket}`;
    const mevcutVeri = db.get(anahtar) || { toplamPuan: 0, oySayisi: 0 };
    mevcutVeri.toplamPuan += puan;
    mevcutVeri.oySayisi += 1;
    db.set(anahtar, mevcutVeri);

    const ortalama = (mevcutVeri.toplamPuan / mevcutVeri.oySayisi).toFixed(1);
    await ctx.reply(`✅ **Puanınız Kaydedildi!**\n\nOyuncu: ${hedefEtiket}\nVerdiğiniz Puan: ${puan}\n\n📊 **Güncel Ortalama:** ${ortalama} (${mevcutVeri.oySayisi} oy)`, { parse_mode: 'Markdown' });
});

// 7. Puan Sorgulama
bot.command('puan', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) return ctx.reply('Kullanım: `/puan <oyuncu_etiketi>`\nÖrnek: `/puan #ABC123`', { parse_mode: 'Markdown' });

    const hedefEtiket = args[0].toUpperCase();
    const anahtar = `puanlar_${hedefEtiket}`;
    const mevcutVeri = db.get(anahtar);

    if (!mevcutVeri) return ctx.reply(`ℹ️ ${hedefEtiket} etiketi için henüz hiç puan verilmemiş.`);

    const ortalama = (mevcutVeri.toplamPuan / mevcutVeri.oySayisi).toFixed(1);
    await ctx.reply(`📊 **Oyuncu İstatistikleri**\n\n🏷️ Etiket: ${hedefEtiket}\n⭐ Ortalama Puan: **${ortalama}**\n🗳️ Toplam Oy: ${mevcutVeri.oySayisi}`, { parse_mode: 'Markdown' });
});

// 8. Günlük Görev
bot.command('gunluk', async (ctx) => {
    const userId = ctx.from.id;
    const bugun = new Date().toISOString().split('T')[0]; 
    const anahtar = `gunluk_gorev_${userId}`;
    
    if (db.get(anahtar) === bugun) return ctx.reply('⏳ Bugünkü günlük görevinizi zaten tamamladınız. Yarın tekrar bekleriz!');
    db.set(anahtar, bugun);
    
    const puanKey = `puanlar_#KULLANICI_${userId}`;
    db.set(puanKey, (db.get(puanKey) || 0) + 10);
    await ctx.reply('✅ Günlük göreviniz tamamlandı! Hesabınıza **10 güven puanı** eklendi.');
});

// 9. Şikayet (Grup ID'sine Bildirim Atar)
bot.command('sikayet', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Kullanım: `/sikayet <oyuncu_etiketi> <sebep>`', { parse_mode: 'Markdown' });

    const hedefEtiket = args[0].toUpperCase();
    const sebep = args.slice(1).join(' ');

    const sikayetler = db.get('sikayetler') || [];
    sikayetler.push({ etiket: hedefEtiket, sebep, sikayetci: ctx.from.id, sikayetciAd: ctx.from.username || ctx.from.first_name, tarih: new Date().toISOString() });
    db.set('sikayetler', sikayetler);

    await ctx.reply(`🚨 **Şikayetiniz Alındı**\n\nYetkililer en kısa sürede inceleyecektir.`);

    // Eğer GRUP_ID Render'da tanımlıysa, oraya gizli bir uyarı gönder
    if (grupId) {
        try {
            await bot.telegram.sendMessage(grupId, `🚨 **YENİ ŞİKAYET ALINDI!**\n\n🏷️ **Şikayet Edilen:** ${hedefEtiket}\n👤 **Şikayet Eden:** @${ctx.from.username || ctx.from.first_name}\n📝 **Sebep:** ${sebep}`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error("Şikayet gruba bildirilemedi. Grup ID'si doğru mu?", e.message);
        }
    }
});

// --- BOTU BAŞLATMA ---
bot.launch()
    .then(() => console.log('🤖 Hay Day Takas Botu başarıyla başlatıldı ve çalışıyor!'))
    .catch((err) => console.error('Bot başlatılırken hata oluştu:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
