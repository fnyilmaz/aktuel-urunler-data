/**
 * MİGROS Resmi Aktüel Broşür (Migroskop) Senkronizasyon Modülü
 * Kaynak: https://www.money.com.tr/ & https://www.migros.com.tr/ (MİGROS RESMİ SİSTEMLERİ)
 */

const sharp = require('sharp');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MONTH_MAP = {
    'ocak': '01', 'subat': '02', 'şubat': '02', 'mart': '03',
    'nisan': '04', 'mayis': '05', 'mayıs': '05', 'haziran': '06',
    'temmuz': '07', 'agustos': '08', 'ağustos': '08', 'eylul': '09',
    'eylül': '09', 'ekim': '10', 'kasim': '11', 'kasım': '11', 'aralik': '12', 'aralık': '12'
};

function normalizeTurkish(str) {
    return (str || '')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .trim();
}

function parseTurkishDateRange(title, currentYear = new Date().getFullYear()) {
    const clean = normalizeTurkish(title);
    let startDate = null;
    let endDate = null;

    const rangeMatch = clean.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-z]+)/i);
    if (rangeMatch) {
        const d1 = String(rangeMatch[1]).padStart(2, '0');
        const d2 = String(rangeMatch[2]).padStart(2, '0');
        const m = MONTH_MAP[rangeMatch[3]];
        if (m) {
            startDate = `${currentYear}-${m}-${d1}`;
            endDate = `${currentYear}-${m}-${d2}`;
            return { startDate, endDate };
        }
    }

    const today = new Date();
    startDate = today.toISOString().split('T')[0];
    const nextTwoWeeks = new Date(today);
    nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 13);
    endDate = nextTwoWeeks.toISOString().split('T')[0];
    return { startDate, endDate };
}

async function fetchHtml(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9'
        },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
}

async function syncMigros(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 MİGROS RESMİ AKTÜEL (MİGROSKOP) SENKRONİZASYONU');
    console.log('======================================================');

    let updated = false;

    // 1. Money.com.tr'den güncel Migroskop sayı ve tarih bilgisini al
    console.log('🔍 Money.com.tr resmi Migroskop portalı sorgulanıyor...');
    let moneyHtml = '';
    try {
        moneyHtml = await fetchHtml('https://www.money.com.tr/mc/kataloglarimiz/migroskop-dijital/83');
    } catch (e) {
        console.error('❌ Money.com.tr sayfası alınamadı:', e.message);
    }

    // Aktif sayıyı ve tarih bilgisini tespit et
    const buttonMatch = moneyHtml.match(/source="([^"]*migroskop[^"]*)"\s+mcdate="([^"]+)"/i);
    const dateStr = buttonMatch ? buttonMatch[2] : '10 - 23 Eylül 2026';
    const dates = parseTurkishDateRange(dateStr);

    const kapakMatch = moneyHtml.match(/https?:\/\/moneyclubkart\.azureedge\.net\/mcstage\/insert-kapak-mockup-migroskop-[^"'\s]+\.png/i);
    const coverUrl = kapakMatch
        ? kapakMatch[0]
        : 'https://moneyclubkart.azureedge.net/mcstage/insert-kapak-mockup-migroskop-906-639245671460382181.png';

    const numMatch = coverUrl.match(/migroskop-(\d+)/i);
    const issueNum = numMatch ? numMatch[1] : '906';
    const catalogId = `migros-migroskop-${issueNum}`;

    console.log(`📌 Güncel Katalog: Migroskop Sayı ${issueNum} (${dateStr}) [ID: ${catalogId}]`);

    // Akıllı Atlama
    const existingCat = currentData.catalogs.find(c => c.id === catalogId);
    const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

    if (existingCat && existingProds.length >= 10) {
        console.log(`   ⏭️ Migroskop ${issueNum} zaten taranmış (${existingProds.length} ürün mevcut). Atlanıyor.`);
        return false;
    }

    // 2. Migros resmi REST API'sinden Migroskop ürünlerini çek
    console.log('🔍 Migros Resmi REST API ürün sorgulanıyor...');
    let apiProducts = [];
    try {
        const searchUrl = 'https://www.migros.com.tr/rest/products/search?q=migroskop';
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
                'x-device-type': 'WEB'
            },
            signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
            const json = await res.json();
            apiProducts = json?.data?.storeProductInfos || [];
        }
    } catch (e) {
        console.error('❌ Migros REST API hatası:', e.message);
    }

    console.log(`📋 Migros resmi sisteminden ${apiProducts.length} adet Migroskop ürünü alındı.`);

    if (apiProducts.length === 0) {
        console.log('⚠️ Migroskop ürünü bulunamadı.');
        return false;
    }

    // Eski kayıtları temizle
    currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
    currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

    const productIds = [];

    apiProducts.forEach((p, idx) => {
        const priceInTl = (p.shownPrice || p.regularPrice || 0) / 100;
        if (!priceInTl || priceInTl <= 0) return;
        if (!p.name || p.name.trim().length < 2) return;

        const prodId = `${catalogId}-p1-${idx + 1}`;
        const hdImage = p.images?.[0]?.urls?.PRODUCT_HD || p.images?.[0]?.urls?.PRODUCT_DETAIL || p.images?.[0]?.urls?.PRODUCT_LIST;

        currentData.products.push({
            id: prodId,
            catalogId: catalogId,
            marketId: 'migros',
            pageNumber: 1,
            name: p.name.trim(),
            brand: p.brand?.name || 'Migros',
            price: Number(priceInTl.toFixed(2)),
            originalPrice: p.regularPrice && p.regularPrice > p.shownPrice ? Number((p.regularPrice / 100).toFixed(2)) : null,
            unit: p.unit || 'Adet',
            category: p.category?.name || 'Migroskop',
            imageUrl: hdImage || coverUrl,
            startDate: dates.startDate,
            endDate: dates.endDate,
            isPopular: priceInTl > 150
        });

        productIds.push(prodId);
    });

    currentData.catalogs.push({
        id: catalogId,
        marketId: 'migros',
        title: `Migros Migroskop ${issueNum} (${dateStr})`,
        subtitle: `Migros İndirimli Ürün Kataloğu`,
        badge: 'Migroskop',
        startDate: dates.startDate,
        endDate: dates.endDate,
        coverImageUrl: coverUrl,
        pageCount: 1,
        status: 'ACTIVE',
        isFeatured: true,
        pages: [
            {
                pageNumber: 1,
                imageUrl: coverUrl,
                thumbnailUrl: coverUrl,
                productIds: productIds
            }
        ]
    });

    console.log(`✅ Migros Kataloğu eklendi: Migroskop ${issueNum} (${productIds.length} ürün)`);
    return true;
}

module.exports = { syncMigros };
