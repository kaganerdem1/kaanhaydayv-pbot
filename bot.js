const { Telegraf, Markup } = require('telegraf');
const { PureDB } = require('pure.db');
const http = require('http');

// --- RENDER PORT AYARI ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Aktif');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Render için port ${PORT} dinleniyor...`);
});

// --- BOT KURULUMU ---
const botToken = process.env.BOT_TOKEN;
const grupId = process.env.GRUP_ID;

if (!botToken) {
    console.error("KRİTİK HATA: BOT_TOKEN bulunamadı!");
    process.exit(1);
}

const bot = new Telegraf(botToken);
const db = new PureDB({ filePath: './hayday_db.json' });

// --- YARDIMCI FONKSİYONLAR ---
function etiketGecerliMi(etiket) {
    return /^#[A-Z0-9]{2,10}$/i.test(etiket);
}

// --- BOT KOMUTLARI ---

// 1. YENİ ÜYE KARŞILAMA (İstediğin Metin)
bot.on('new_chat_members', async (ctx) => {
    for (const uye of ctx.message.new_chat_members) {
        // Botun kendisi gruba eklendiyse karşılama yapmasın
        if (uye.id === bot.botInfo.id) continue; 

        const karsilamaMesaji = `🌿 **KOKİNA TAKAS GRUBU'NA HOŞ GELDİNİZ!**\n\n` +
            `Aramıza katıldığınız için teşekkür ederiz.\n\n` +
            `Grubumuzda Hay Day ürün alım-satım ve takas işlemleri yapılmaktadır.\n\n` +
            `• Takas yaparken karşılıklı güvene önem veriniz.\n` +
            `• İlanlarınızı açık ve anlaşılır paylaşınız.\n` +
            `• Gereksiz mesaj ve reklamlardan kaçınınız.\n` +
            `• Yönetici kurallarına uyunuz.\n\n` +
            `Keyifli takaslar, bol kazançlar dileriz.\n\n` +
            `**KOKİNA TAKAS | HAY DAY**`;

        await ctx.reply(karsilamaMesaji, { parse_mode: 'Markdown' });
    }
});

// 2. DETAYLI TAKAS SİSTEMİ (Adım Adım Sihirbaz)
bot.command('takas', async (ctx) => {
    const userId = ctx.from.id;
    
    // Eski yarım kalmış işlemleri sıfırla
    db.set(`takas_islemi_${userId}`, { adim: 'tip' });

    await ctx.reply(
        `🔄 **Yeni Takas İlanı Oluşturuyorsunuz**\n\n` +
        `Lütfen ne yapmak istediğinizi seçin:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📤 SATIŞ Yapıyorum (Ürün Veriyorum)', `takas_tip_SATIŞ_${userId}`)],
            [Markup.button.callback('📥 ALIM Yapıyorum (Ürün İstiyorum)', `takas_tip_ALIM_${userId}`)]
        ])
    );
});

// Takas Tipi Seçildiğinde (Butona tıklanınca)
bot.action(/takas_tip_(SATIŞ|ALIM)_(\d+)/, async (ctx) => {
    const tip = ctx.match[1];
    const hedefUserId = ctx.match[2];

    // Güvenlik kontrolü: Sadece komutu başlatan kişi butona basabilsin
    if (ctx.from.id.toString() !== hedefUserId) {
        return ctx.answerCbQuery('Bu işlem sizin için değil.', { show_alert: true });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(`Seçiminiz: **${tip}**\n\nŞimdi takas etmek istediğiniz **ÜRÜNÜN ADINI** yazın.\n_(Örnek: Buğday, Çivi, Testere vb.)_`, { parse_mode: 'Markdown' });

    const mevcutIslem = db.get(`takas_islemi_${hedefUserId}`) || {};
    mevcutIslem.tip = tip;
    mevcutIslem.adim = 'urun';
    db.set(`takas_islemi_${hedefUserId}`, mevcutIslem);
});

// Metin Girdilerini Yakalama (Ürün, Miktar, Etiket, Karşılık)
bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const islem = db.get(`takas_islemi_${userId}`);

    // Eğer kullanıcının aktif bir takas işlemi yoksa diğer komutlara geç
    if (!islem || !islem.adim) return next();

    const metin = ctx.message.text.trim();

    if (islem.adim === 'urun') {
        islem.urun = metin;
        islem.adim = 'miktar';
        db.set(`takas_islemi_${userId}`, islem);
        return ctx.reply(`✅ Ürün: **${metin}**\n\nŞimdi bu ürünün **MİKTARINI** yazın. _(Sadece sayı girin, Örnek: 100)_`, { parse_mode: 'Markdown' });
    }

    if (islem.adim === 'miktar') {
        if (isNaN(metin)) return ctx.reply('❌ Lütfen sadece sayı girin. Örnek: 50');
        islem.miktar = metin;
        islem.adim = 'etiket';
        db.set(`takas_islemi_${userId}`, islem);
        return ctx.reply(`✅ Miktar: **${metin}**\n\nŞimdi Hay Day **OYUNCU ETİKETİNİZİ** yazın.\n_(Örnek: #ABC123)_`, { parse_mode: 'Markdown' });
    }

    if (islem.adim === 'etiket') {
        if (!etiketGecerliMi(metin)) {
            return ctx.reply('❌ Hatalı etiket formatı! Lütfen #ABC123 şeklinde girin.');
        }
        islem.etiket = metin.toUpperCase();
        islem.adim = 'karsilik';
        db.set(`takas_islemi_${userId}`, islem);
        return ctx.reply(`✅ Etiket: **${metin.toUpperCase()}**\n\nSon olarak, bu takas karşılığında **NE İSTEDİĞİNİZİ** (veya "Ücretsiz" yazın) belirtin.`, { parse_mode: 'Markdown' });
    }

    if (islem.adim === 'karsilik') {
        islem.karsilik = metin;
        islem.adim = 'bitti';
        db.set(`takas_islemi_${userId}`, islem);

        // İşlem bitti, tabloyu oluştur
        await ctx.reply('⏳ İlanınız hazırlanıyor...');

        const tablo = `╔══════════════════════════╗\n` +
                      `   🏷️ **TAKAS TALEP TABLOSU** 🏷️\n` +
                      `╚══════════════════════════╝\n\n` +
                      `📌 **İşlem Tipi:** ${islem.tip === 'SATIŞ' ? '📤 SATIŞ (Ürün Veriyorum)' : '📥 ALIM (Ürün İstiyorum)'}\n` +
                      `📦 **Ürün:** ${islem.urun}\n` +
                      `⚖️ **Miktar:** ${islem.miktar}\n` +
                      `🏷️ **Oyuncu Etiketi:** ${islem.etiket}\n` +
                      `🔄 **Karşılığında İstenen:** ${islem.karsilik}\n` +
                      `👤 **İlan Sahibi:** @${ctx.from.username || ctx.from.first_name}\n\n` +
                      `_Takas yapmak isteyenler lütfen ilan sahibine özelden yazsın._\n` +
                      `_İşlem bittikten sonra ilana yanıt vererek /tamamlandi yazın._`;

        // Tabloyu gruba gönder (Eğer özelden yazdıysa gruba da göndermek isteyebilir, ama şimdilik yazdığı yere atıyoruz)
        await ctx.reply(tablo, { parse_mode: 'Markdown' });

        // İşlemi temizle
        db.delete(`takas_islemi_${userId}`);
    }
});

// 3. Yardım / Menü
bot.command(['yardim', 'menu', 'help'], async (ctx) => {
    const menuMesaji = `🤖 **HAY DAY TAKAS BOTU - KOMUTLAR**\n\n` +
        `📜 **/kurallar**\nGrup kurallarını gösterir.\n\n` +
        `🔄 **/takas**\nAdım adım takas ilanı oluşturur.\n\n` +
        `✅ **/tamamlandi**\nBir ilana yanıt vererek takasın bittiğini bildirir.\n\n` +
        `⭐ **/puanver [ETİKET] [1-5]**\nOyuncuya güven puanı verir.\n\n` +
        `📊 **/puan [ETİKET]**\nOyuncunun güven puanını gösterir.\n\n` +
        `🎁 **/gunluk**\nGünlük görevinizi tamamlar.\n\n` +
        `🚨 **/sikayet [ETİKET] [SEBEP]**\nŞikayet iletir.`;
    await ctx.reply(menuMesaji, { parse_mode: 'Markdown' });
});

// 4. Kurallar
bot.command('kurallar', async (ctx) => {
    const kurallar = `📜 **KOKİNA TAKAS KURALLARI**\n\n` +
        `• Takas yaparken karşılıklı güvene önem veriniz.\n` +
        `• İlanlarınızı açık ve anlaşılır paylaşınız.\n` +
        `• Gereksiz mesaj ve reklamlardan kaçınınız.\n` +
        `• Yönetici kurallarına uyunuz.\n\n` +
        `Günlük puan kazanmak için /gunluk yazabilirsiniz.`;
    await ctx.reply(kurallar, { parse_mode: 'Markdown' });
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

// 9. Şikayet
bot.command('sikayet', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Kullanım: `/sikayet <oyuncu_etiketi> <sebep>`', { parse_mode: 'Markdown' });

    const hedefEtiket = args[0].toUpperCase();
    const sebep = args.slice(1).join(' ');

    const sikayetler = db.get('sikayetler') || [];
    sikayetler.push({ etiket: hedefEtiket, sebep, sikayetci: ctx.from.id, sikayetciAd: ctx.from.username || ctx.from.first_name, tarih: new Date().toISOString() });
    db.set('sikayetler', sikayetler);

    await ctx.reply(`🚨 **Şikayetiniz Alındı**\n\nYetkililer en kısa sürede inceleyecektir.`);

    if (grupId) {
        try {
            await bot.telegram.sendMessage(grupId, `🚨 **YENİ ŞİKAYET ALINDI!**\n\n🏷️ **Şikayet Edilen:** ${hedefEtiket}\n👤 **Şikayet Eden:** @${ctx.from.username || ctx.from.first_name}\n📝 **Sebep:** ${sebep}`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error("Şikayet gruba bildirilemedi:", e.message);
        }
    }
});

// --- BOTU BAŞLATMA ---
bot.launch()
    .then(() => console.log('🤖 KOKİNA Hay Day Takas Botu başarıyla başlatıldı ve çalışıyor!'))
    .catch((err) => console.error('Bot başlatılırken hata oluştu:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
