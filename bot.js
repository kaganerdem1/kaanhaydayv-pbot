const { Telegraf } = require('telegraf');
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

// 1. YENİ ÜYE KARŞILAMA (KOKİNA TAKAS)
bot.on('new_chat_members', async (ctx) => {
    for (const uye of ctx.message.new_chat_members) {
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

// 2. AKILLI TAKAS SİSTEMİ (Tek Satırda Otomatik Tablo)
bot.command('takas', async (ctx) => {
    // Komuttan sonraki metni al (örn: "89 ağıl satılır")
    const metin = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (!metin) {
        return ctx.reply(
            `⚠️ Lütfen takas detaylarını yazın.\n\n` +
            `**Örnek Kullanım:**\n` +
            `\`/takas 89 ağıl satılır\`\n` +
            `\`/takas 50 buğday alınır\`\n` +
            `\`/takas 200 çivi satılık\``,
            { parse_mode: 'Markdown' }
        );
    }

    // İlanı tablo formatına sok
    const ilanTablo = `╔══════════════════════════╗\n` +
                      `   🏷️ **YENİ TAKAS İLANI** 🏷️\n` +
                      `╚══════════════════════════╝\n\n` +
                      `📝 **Açıklama:**\n${metin}\n\n` +
                      `👤 **İlan Sahibi:** @${ctx.from.username || ctx.from.first_name}\n\n` +
                      `_Takas yapmak isteyenler lütfen ilan sahibine özelden yazsın._\n` +
                      `_İşlem bittikten sonra ilana yanıt vererek /tamamlandi yazın._`;

    // İlanı veritabanına kaydet (İleride lazım olur diye)
    const ilanlar = db.get('ilanlar') || [];
    ilanlar.push({ 
        metin: metin, 
        kullaniciId: ctx.from.id, 
        kullaniciAdi: ctx.from.username || ctx.from.first_name, 
        tarih: new Date().toISOString() 
    });
    db.set('ilanlar', ilanlar);

    // Tabloyu gruba gönder
    await ctx.reply(ilanTablo, { parse_mode: 'Markdown' });
});

// 3. Yardım / Menü
bot.command(['yardim', 'menu', 'help'], async (ctx) => {
    const menuMesaji = `🤖 **KOKİNA HAY DAY TAKAS BOTU**\n\n` +
        `📜 **/kurallar**\nGrup kurallarını gösterir.\n\n` +
        `🔄 **/takas [İlan Metni]**\nOtomatik takas tablosu oluşturur.\n_Örnek: /takas 89 ağıl satılır_\n\n` +
        `✅ **/tamamlandi**\nBir ilana yanıt vererek takasın bittiğini bildirir.\n\n` +
        `⭐ **/puanver [ETİKET] [1-5]**\nOyuncuya güven puanı verir.\n\n` +
        `📊 **/puan [ETİKET]**\nOyuncunun güven puanını gösterir.\n\n` +
        `🎁 **/gunluk**\nGünlük görevinizi tamamlar.`;
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

    if (!etiketGecerliMi(hedefEtiket)) return ctx.reply('❌ Geçersiz etiket formatı. (Örnek: #ABC123)');
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
