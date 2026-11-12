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

// 1. YENİ ÜYE KARŞILAMA
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

// 2. AKILLI TAKAS SİSTEMİ
bot.command('takas', async (ctx) => {
    const metin = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (!metin) {
        return ctx.reply(
            `⚠️ Lütfen takas detaylarını yazın.\n\n` +
            `**Örnek Kullanım:**\n` +
            `\`/takas 89 ağıl satılır\`\n` +
            `\`/takas 50 buğday alınır\``,
            { parse_mode: 'Markdown' }
        );
    }

    const ilanTablo = `╔══════════════════════════╗\n` +
                      `   🏷️ **YENİ TAKAS İLANI** 🏷️\n` +
                      `╚══════════════════════════╝\n\n` +
                      `📝 **Açıklama:**\n${metin}\n\n` +
                      `👤 **İlan Sahibi:** @${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})\n\n` +
                      `_Takas bittiyse bu mesaja yanıt verip_ **/tamamlandi** _yazın._`;

    const ilanlar = db.get('ilanlar') || [];
    ilanlar.push({ 
        metin: metin, 
        kullaniciId: ctx.from.id, 
        kullaniciAdi: ctx.from.username || ctx.from.first_name, 
        tarih: new Date().toISOString() 
    });
    db.set('ilanlar', ilanlar);

    await ctx.reply(ilanTablo, { parse_mode: 'Markdown' });
});

// 3. TAKAS TAMAMLANDI (PUAN BUTONU EKLENDİ)
bot.command('tamamlandi', async (ctx) => {
    const yanitlananMesaj = ctx.message.reply_to_message;
    if (!yanitlananMesaj) {
        return ctx.reply('⚠️ Takası tamamladığınız ilanın mesajına **yanıt (reply)** vererek bu komutu kullanmalısınız.');
    }

    // İlan sahibinin Telegram ID'sini mesajdan ayıklamaya çalış (Basit bir yöntem)
    // Ancak en garantisi, ilan mesajındaki "ID: 123456" kısmını okumaktır.
    let ilanSahibiId = null;
    const idMatch = yanitlananMesaj.text.match(/ID: (\d+)/);
    if (idMatch) {
        ilanSahibiId = idMatch[1];
    }

    if (!ilanSahibiId) {
        return ctx.reply('⚠️ İlan sahibi tespit edilemedi. Lütfen ilana yanıt verdiğinizden emin olun.');
    }

    // Eğer ilan sahibi kendi ilanına /tamamlandi yazarsa puan veremesin
    if (ctx.from.id.toString() === ilanSahibiId) {
         return ctx.reply('⚠️ Kendi ilanınızı tamamladınız. Puanı karşı taraf vermelidir.');
    }

    // Puan butonunu oluştur
    const puanButonu = Markup.inlineKeyboard([
        [Markup.button.callback('⭐ 1 Puan', `puan_1_${ilanSahibiId}`), Markup.button.callback('⭐ 2 Puan', `puan_2_${ilanSahibiId}`), Markup.button.callback('⭐ 3 Puan', `puan_3_${ilanSahibiId}`)],
        [Markup.button.callback('⭐ 4 Puan', `puan_4_${ilanSahibiId}`), Markup.button.callback('⭐ 5 Puan', `puan_5_${ilanSahibiId}`)]
    ]);

    const mesaj = await ctx.reply(
        `🎉 **Takas Tamamlandı!**\n\n` +
        `Sayın @${ctx.from.username || ctx.from.first_name}, lütfen takas yaptığınız kişiye puan verin:`,
        { parse_mode: 'Markdown', reply_markup: puanButonu.reply_markup }
    );

    // Temizlik: İlanı ve kullanıcının yazdığı /tamamlandi mesajını sil
    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, yanitlananMesaj.message_id);
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch(e) {}

    // Puan mesajını 1 dakika sonra sil
    setTimeout(async () => {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, mesaj.message_id);
        } catch (e) {}
    }, 60000);
});

// 4. PUAN BUTONUNA TIKLANINCA
bot.action(/puan_(\d)_(\d+)/, async (ctx) => {
    const puan = parseInt(ctx.match[1]);
    const hedefId = ctx.match[2];
    
    // Puanlayan kullanıcı, kendi kendine puan veremez
    if (ctx.from.id.toString() === hedefId) {
        return ctx.answerCbQuery('Kendinize puan veremezsiniz!', { show_alert: true });
    }

    // Hedefin etiketini bulmak için son ilanlara bak (Basit bir çözüm)
    // Gerçekte burada daha kompleks bir veritabanı sorgusu gerekebilir.
    const ilanlar = db.get('ilanlar') || [];
    const sonIlan = ilanlar.reverse().find(i => i.kullaniciId.toString() === hedefId);
    const hedefEtiket = sonIlan ? sonIlan.metin : '#KOKINA';

    const anahtar = `puanlar_${hedefEtiket}`;
    const mevcutVeri = db.get(anahtar) || { toplamPuan: 0, oySayisi: 0 };
    mevcutVeri.toplamPuan += puan;
    mevcutVeri.oySayisi += 1;
    db.set(anahtar, mevcutVeri);

    const ortalama = (mevcutVeri.toplamPuan / mevcutVeri.oySayisi).toFixed(1);
    
    // Butonun yazısını değiştir ve işlemi kapat
    await ctx.editMessageText(`✅ **Puanınız Kaydedildi!**\n\nİlan Sahibi ID: ${hedefId}\nPuan: ${puan}\n📊 Ortalama: ${ortalama} (${mevcutVeri.oySayisi} oy)`);

    setTimeout(async () => {
        try {
            await ctx.deleteMessage();
        } catch (e) {}
    }, 5000);
});

// 5. YARDIM / MENÜ
bot.command(['yardim', 'menu', 'help'], async (ctx) => {
    const menuMesaji = `🤖 **KOKİNA HAY DAY TAKAS BOTU**\n\n` +
        `📜 **/kurallar**\nGrup kurallarını gösterir.\n\n` +
        `🔄 **/takas [İlan Metni]**\nOtomatik takas tablosu oluşturur.\n_Örnek: /takas 89 ağıl satılır_\n\n` +
        `✅ **/tamamlandi**\nBir ilana yanıt vererek takasın bittiğini bildirir ve puan butonu çıkarır.\n\n` +
        `📊 **/puan [ETİKET]**\nOyuncunun güven puanını gösterir.\n\n` +
        `🎁 **/gunluk**\nGünlük görevinizi tamamlar.`;
    await ctx.reply(menuMesaji, { parse_mode: 'Markdown' });
});

// 6. KURALLAR
bot.command('kurallar', async (ctx) => {
    const kurallar = `📜 **KOKİNA TAKAS KURALLARI**\n\n` +
        `• Takas yaparken karşılıklı güvene önem veriniz.\n` +
        `• İlanlarınızı açık ve anlaşılır paylaşınız.\n` +
        `• Gereksiz mesaj ve reklamlardan kaçınınız.\n` +
        `• Yönetici kurallarına uyunuz.\n\n` +
        `Günlük puan kazanmak için /gunluk yazabilirsiniz.`;
    await ctx.reply(kurallar, { parse_mode: 'Markdown' });
});

// 7. PUAN SORGULAMA
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

// 8. GÜNLÜK GÖREV
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

// 9. ŞİKAYET
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
