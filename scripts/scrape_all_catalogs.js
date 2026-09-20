/**
 * Tüm Marketler Broşür & Ürün Senkronizasyon Motoru (Unified Market Scraper)
 * 
 * BİM, A101 ve ŞOK resmi web sitelerinden tüm güncel afişleri, yüksek çözünürlüklü
 * sayfaları ve bu kataloglara ait TÜM ÜRÜNLERİ izole fotoğraflarıyla eksiksiz çeker.
 * 
 * "Akıllı Atlama" (Skip Existing):
 * Zaten sistemde kayıtlı olan ve ürünleri tam bulunan broşürleri tekrar taramaz,
 * gereksiz ağ trafiği oluşturmaz ve işlemi 1-2 saniyeye indirir.
 */

const fs = require('fs');
const path = require('path');
const { getBimData } = require('./scrapers/bim_scraper');
const { getA101Data } = require('./scrapers/a101_scraper');
const { getSokData } = require('./scrapers/sok_scraper');
const { readData, writeData, backupData, validateData } = require('./catalog_manager');

const DATA_PATH = path.join(__dirname, '..', 'data', 'catalogs.json');

async function scrapeAll(options = {}) {
    const isSync = options.sync || process.argv.includes('--sync');
    const startTime = Date.now();

    console.log('===============================================================');
    console.log('🛒 RESMİ MARKET BROŞÜR & EKSİKSİZ ÜRÜN TARAMA MERKEZİ');
    console.log('===============================================================');
    console.log('Kaynaklar:');
    console.log('  • BİM:  https://www.bim.com.tr/ (Afişler & Aktüel Ürünler)');
    console.log('  • A101: https://www.a101.com.tr/ (RIO API & Kapıda)');
    console.log('  • ŞOK:  https://kurumsal.sokmarket.com.tr/ & https://www.sokmarket.com.tr/');
    console.log('---------------------------------------------------------------\n');

    // Mevcut veritabanını oku (Akıllı atlama için kullanılacak)
    const currentData = readData(DATA_PATH) || { markets: [], catalogs: [], products: [] };
    console.log(`📂 Mevcut Sistem Durumu: ${currentData.catalogs.length} katalog, ${currentData.products.length} kayıtlı ürün.`);
    console.log('⚡ Akıllı Atlama (Skip Existing) devrede: Zaten kayıtlı kataloglar taranmayacak.\n');

    const results = {
        bim: { catalogs: [], products: [] },
        a101: { catalogs: [], products: [] },
        sok: { catalogs: [], products: [] }
    };

    // 1. BİM
    try {
        console.log('[1/3] BİM Kontrol Ediliyor...');
        results.bim = await getBimData(currentData);
    } catch (e) {
        console.error('❌ BİM tarama hatası:', e.message);
    }

    console.log('\n---------------------------------------------------------------\n');

    // 2. A101
    try {
        console.log('[2/3] A101 Kontrol Ediliyor...');
        results.a101 = await getA101Data(currentData);
    } catch (e) {
        console.error('❌ A101 tarama hatası:', e.message);
    }

    console.log('\n---------------------------------------------------------------\n');

    // 3. ŞOK
    try {
        console.log('[3/3] ŞOK Kontrol Ediliyor...');
        results.sok = await getSokData(currentData);
    } catch (e) {
        console.error('❌ ŞOK tarama hatası:', e.message);
    }

    const totalCatalogs = results.bim.catalogs.length + results.a101.catalogs.length + results.sok.catalogs.length;
    const totalProducts = results.bim.products.length + results.a101.products.length + results.sok.products.length;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n===============================================================');
    console.log('📊 TARAMA VE SENKRONİZASYON ÖZETİ:');
    console.log('===============================================================');
    console.log(`⏱️ İşlem Süresi: ${duration} saniye`);
    console.log(`🏪 BİM:  ${results.bim.catalogs.length} katalog, ${results.bim.products.length} ürün`);
    console.log(`🏪 A101: ${results.a101.catalogs.length} katalog, ${results.a101.products.length} ürün`);
    console.log(`🏪 ŞOK:  ${results.sok.catalogs.length} katalog, ${results.sok.products.length} ürün`);
    console.log(`📌 TOPLAM KATALOG: ${totalCatalogs} adet`);
    console.log(`📌 TOPLAM ÜRÜN:    ${totalProducts} adet`);
    console.log('===============================================================\n');

    if (isSync) {
        console.log('🔄 [SENKRONİZASYON] data/catalogs.json güncelleniyor...');

        const scrapedCatalogs = [...results.bim.catalogs, ...results.a101.catalogs, ...results.sok.catalogs];
        const scrapedProducts = [...results.bim.products, ...results.a101.products, ...results.sok.products];

        const relevantCatalogs = scrapedCatalogs.filter(c => c.status === 'ACTIVE' || c.status === 'UPCOMING');
        const idMapping = {};

        relevantCatalogs.forEach(newCat => {
            const existingIdx = currentData.catalogs.findIndex(c => 
                c.id === newCat.id || 
                (c.marketId === newCat.marketId && c.startDate === newCat.startDate)
            );

            if (existingIdx !== -1) {
                const existing = currentData.catalogs[existingIdx];
                idMapping[newCat.id] = existing.id;

                newCat.pages.forEach(p => {
                    const existingPage = (existing.pages || []).find(ep => ep.pageNumber === p.pageNumber);
                    if (existingPage && Array.isArray(existingPage.productIds)) {
                        const mergedIds = Array.from(new Set([...p.productIds, ...existingPage.productIds]));
                        p.productIds = mergedIds;
                    }
                });

                currentData.catalogs[existingIdx] = {
                    ...existing,
                    ...newCat,
                    id: existing.id,
                    title: existing.title || newCat.title,
                    subtitle: existing.subtitle || newCat.subtitle
                };
            } else {
                let safeId = newCat.id;
                let counter = 1;
                while (currentData.catalogs.some(c => c.id === safeId)) {
                    safeId = `${newCat.id}_${counter++}`;
                }
                idMapping[newCat.id] = safeId;
                newCat.id = safeId;
                currentData.catalogs.push(newCat);
            }
        });

        scrapedProducts.forEach(p => {
            if (idMapping[p.catalogId]) {
                p.catalogId = idMapping[p.catalogId];
            }
        });

        const activeCatalogIds = new Set(currentData.catalogs.filter(c => c.status !== 'EXPIRED').map(c => c.id));
        const filteredProducts = scrapedProducts.filter(p => activeCatalogIds.has(p.catalogId));

        const productMap = new Map();
        (currentData.products || []).forEach(p => {
            if (activeCatalogIds.has(p.catalogId)) {
                productMap.set(p.id, p);
            }
        });
        filteredProducts.forEach(p => {
            productMap.set(p.id, p);
        });

        currentData.products = Array.from(productMap.values());

        const validProdIds = new Set(currentData.products.map(p => p.id));
        currentData.catalogs.forEach(cat => {
            (cat.pages || []).forEach(page => {
                page.productIds = (page.productIds || []).filter(pid => validProdIds.has(pid));
            });
        });

        currentData.markets.forEach(m => {
            m.catalogCount = currentData.catalogs.filter(c => c.marketId === m.id && c.status !== 'EXPIRED').length;
        });

        backupData();
        writeData(DATA_PATH, currentData);
        console.log(`💾 data/catalogs.json başarıyla güncellendi!`);
        console.log(`📦 Toplam kayıtlı katalog: ${currentData.catalogs.length}`);
        console.log(`📦 Toplam kayıtlı ürün:    ${currentData.products.length}`);
        
        validateData();
    }

    return results;
}

if (require.main === module) {
    scrapeAll();
}

module.exports = { scrapeAll };
