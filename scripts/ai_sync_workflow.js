/**
 * GitHub Actions & Yerel Ortam İçin Yapay Zeka (Gemini Vision) Destekli
 * Çoklu API Havuzlu, Tekil Saatlik ve Çoklu Market Senkronizasyon Motoru
 * 
 * Desteklenen Marketler:
 * 1. BİM (bim.com.tr)
 * 2. A101 (rio.a101.com.tr)
 * 3. ŞOK (kurumsal.sokmarket.com.tr)
 * 4. MİGROS (money.com.tr - Migroskop)
 * 5. CARREFOURSA (images.csfour.com - CarrefourSA Fırsatları)
 * 
 * Özellikler:
 * - 5 adet ücretsiz Gemini API anahtarı arasında rasgele yük dağıtımı ve otomatik failover.
 * - Sadece ve sadece marketlerin kendi resmi web siteleri / API'lerinden veri alımı.
 * - Her market için günde 1 kez izole tarama (--market <bim|a101|sok|migros|carrefoursa|all|auto>).
 * - Fiyat karşılaştırma güvenliği (fiyatsız/0 TL ürünler filtrelenir).
 * - Akıllı Bounding-Box (Weserv) kırpma.
 */

const fs = require('fs');
const path = require('path');

const { syncBim } = require('./markets/bim');
const { syncA101 } = require('./markets/a101');
const { syncSok } = require('./markets/sok');
const { syncMigros } = require('./markets/migros');
const { syncCarrefour } = require('./markets/carrefoursa');

const DATA_PATH = fs.existsSync(path.join(__dirname, '..', 'catalogs.json'))
    ? path.join(__dirname, '..', 'catalogs.json')
    : path.join(__dirname, '..', '..', 'github_automation', 'catalogs.json');

const DEFAULT_MARKETS = [
    {
        id: "bim",
        name: "BİM",
        brandColorHex: "#E30613",
        accentColorHex: "#FFFFFF",
        logoUrl: "https://cdn2.bim.com.tr/templates/images/header-aktuel.png",
        category: "Süpermarket",
        description: "Toptan Fiyatına Perakende Satış",
        catalogCount: 0
    },
    {
        id: "a101",
        name: "A101",
        brandColorHex: "#009AC7",
        accentColorHex: "#FFFFFF",
        logoUrl: "https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/dikey-kapida-logo_256x256.png",
        category: "Süpermarket",
        description: "Harca Harca Bitmez",
        catalogCount: 0
    },
    {
        id: "sok",
        name: "ŞOK",
        brandColorHex: "#F9A01B",
        accentColorHex: "#002B49",
        logoUrl: "https://images.ceptesok.com/cdn-cgi/image/width=120,height=120,fit=pad,quality=80,format=webp/logos/service-types/market-logo.svg",
        category: "Süpermarket",
        description: "Yeter de Artar",
        catalogCount: 0
    },
    {
        id: "migros",
        name: "Migros",
        brandColorHex: "#FF6000",
        accentColorHex: "#FFFFFF",
        logoUrl: "https://images.migrosone.com/sanalmarket/category/icon/00000000-0000-0000-0000-000000000000/1-0.png",
        category: "Süpermarket",
        description: "Migros Kalitesi ve Fırsatları",
        catalogCount: 0
    },
    {
        id: "carrefoursa",
        name: "CarrefourSA",
        brandColorHex: "#004B93",
        accentColorHex: "#D52B1E",
        logoUrl: "https://images.csfour.com/staticimage/carrefoursacom-logo.svg",
        category: "Süpermarket",
        description: "Doğru Kalite Doğru Fiyata",
        catalogCount: 0
    }
];

function parseArgs() {
    const args = process.argv.slice(2);
    let market = 'auto';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--market' && args[i + 1]) {
            market = args[i + 1].toLowerCase();
            i++;
        }
    }

    if (process.env.TARGET_MARKET) {
        market = process.env.TARGET_MARKET.toLowerCase();
    }

    return { market };
}

function resolveTargetMarket(arg) {
    if (arg && arg !== 'auto') {
        return arg;
    }

    // Auto mod: Türkiye saati (UTC+3)
    const now = new Date();
    const utcHour = now.getUTCHours();
    // 03:00 UTC = 06:00 TSİ (BİM)
    // 04:00 UTC = 07:00 TSİ (A101)
    // 05:00 UTC = 08:00 TSİ (ŞOK)
    // 06:00 UTC = 09:00 TSİ (Migros)
    // 07:00 UTC = 10:00 TSİ (CarrefourSA)
    switch (utcHour) {
        case 3: // 06:00 TSİ
            return 'bim';
        case 4: // 07:00 TSİ
            return 'a101';
        case 5: // 08:00 TSİ
            return 'sok';
        case 6: // 09:00 TSİ
            return 'migros';
        case 7: // 10:00 TSİ
            return 'carrefoursa';
        default:
            return 'all';
    }
}

async function runAiSyncWorkflow() {
    const { market: rawMarket } = parseArgs();
    const targetMarket = resolveTargetMarket(rawMarket);

    console.log('================================================================');
    console.log('🤖 AKTUEL URUNLER AI SENKRONİZASYON MOTORU (MULTI-MARKET)');
    console.log(`🎯 Hedef Market Modu: ${targetMarket.toUpperCase()} (Argüman: ${rawMarket})`);
    console.log(`⏰ Sistem Zamanı (UTC): ${new Date().toISOString()}`);
    console.log('================================================================');

    let currentData;
    try {
        const raw = fs.readFileSync(DATA_PATH, 'utf8');
        currentData = JSON.parse(raw);
    } catch (e) {
        console.error('⚠️ catalogs.json okuma/ayrıştırma hatası:', e.message);
        currentData = {
            version: 1,
            lastUpdated: new Date().toISOString(),
            markets: JSON.parse(JSON.stringify(DEFAULT_MARKETS)),
            catalogs: [],
            products: []
        };
        console.log('⚠️ Boş veya geçersiz catalogs.json yerine temel şablon oluşturuldu.');
    }

    currentData.catalogs = currentData.catalogs || [];
    currentData.products = currentData.products || [];

    // Market listesini daima 5 market ile güvenceye al
    if (!currentData.markets || currentData.markets.length === 0) {
        currentData.markets = JSON.parse(JSON.stringify(DEFAULT_MARKETS));
    } else {
        for (const dm of DEFAULT_MARKETS) {
            if (!currentData.markets.some(m => m.id === dm.id)) {
                currentData.markets.push({ ...dm });
            }
        }
    }

    const initialCatCount = currentData.catalogs.length;
    const initialProdCount = currentData.products.length;

    let hasChanges = false;

    // 1. BİM
    if (targetMarket === 'bim' || targetMarket === 'all') {
        try {
            const bimChanged = await syncBim(currentData);
            if (bimChanged) hasChanges = true;
        } catch (e) {
            console.error('❌ BİM senkronizasyon hatası:', e.message);
        }
    }

    // 2. A101
    if (targetMarket === 'a101' || targetMarket === 'all') {
        try {
            const a101Changed = await syncA101(currentData);
            if (a101Changed) hasChanges = true;
        } catch (e) {
            console.error('❌ A101 senkronizasyon hatası:', e.message);
        }
    }

    // 3. ŞOK
    if (targetMarket === 'sok' || targetMarket === 'all') {
        try {
            const sokChanged = await syncSok(currentData);
            if (sokChanged) hasChanges = true;
        } catch (e) {
            console.error('❌ ŞOK senkronizasyon hatası:', e.message);
        }
    }

    // 4. MİGROS
    if (targetMarket === 'migros' || targetMarket === 'all') {
        try {
            const migrosChanged = await syncMigros(currentData);
            if (migrosChanged) hasChanges = true;
        } catch (e) {
            console.error('❌ MİGROS senkronizasyon hatası:', e.message);
        }
    }

    // 5. CARREFOURSA
    if (targetMarket === 'carrefoursa' || targetMarket === 'all') {
        try {
            const carrefourChanged = await syncCarrefour(currentData);
            if (carrefourChanged) hasChanges = true;
        } catch (e) {
            console.error('❌ CARREFOURSA senkronizasyon hatası:', e.message);
        }
    }

    // Veri Temizliği ve Doğrulama
    // 1. Sıfır veya tanımsız fiyatlı ürünleri temizle (Fiyat karşılaştırma güvenliği)
    const validProducts = currentData.products.filter(p => {
        return p.name && p.name.trim().length > 1 && typeof p.price === 'number' && p.price > 0;
    });

    if (validProducts.length !== currentData.products.length) {
        console.log(`🧹 ${currentData.products.length - validProducts.length} adet geçersiz/fiyatsız ürün ayıklandı.`);
        currentData.products = validProducts;
        hasChanges = true;
    }

    // 2. Boş kataloğu olanları temizle
    const validCatalogs = currentData.catalogs.filter(c => {
        const catProds = currentData.products.filter(p => p.catalogId === c.id);
        return c.pages && c.pages.length > 0 && catProds.length > 0;
    });

    if (validCatalogs.length !== currentData.catalogs.length) {
        console.log(`🧹 ${currentData.catalogs.length - validCatalogs.length} adet boş katalog ayıklandı.`);
        currentData.catalogs = validCatalogs;
        hasChanges = true;
    }

    if (hasChanges || currentData.catalogs.length !== initialCatCount || currentData.products.length !== initialProdCount) {
        currentData.version = (currentData.version || 20) + 1;
        currentData.lastUpdated = new Date().toISOString();

        // Market katalog sayılarını güncelle
        currentData.markets.forEach(m => {
            m.catalogCount = currentData.catalogs.filter(c => c.marketId === m.id).length;
        });

        console.log('\n================================================================');
        console.log(`📦 VERİ GÜNCELLENDİ! Yeni Sürüm: v${currentData.version}`);
        console.log(`📊 Toplam Katalog: ${currentData.catalogs.length} (Önceki: ${initialCatCount})`);
        console.log(`🛍️ Toplam Ürün: ${currentData.products.length} (Önceki: ${initialProdCount})`);
        console.log('================================================================');

        fs.writeFileSync(DATA_PATH, JSON.stringify(currentData, null, 2), 'utf8');
        console.log(`💾 Kaydedildi: ${DATA_PATH}`);

        // data/catalogs.json da varsa eşitle
        const altDataPath = path.join(__dirname, '..', '..', 'data', 'catalogs.json');
        if (fs.existsSync(path.dirname(altDataPath))) {
            fs.writeFileSync(altDataPath, JSON.stringify(currentData, null, 2), 'utf8');
        }

        return true;
    }

    console.log('\n✨ Verilerde yeni bir değişiklik veya eksik tespit edilmedi.');
    return false;
}

if (require.main === module) {
    runAiSyncWorkflow()
        .then(changed => {
            console.log(changed ? '🎉 Güncelleme tamamlandı!' : '✨ Sistem güncel.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Kritik Hata:', err);
            process.exit(1);
        });
}

module.exports = { runAiSyncWorkflow };
