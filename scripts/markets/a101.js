/**
 * A101 Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://rio.a101.com.tr/ (A101 RESMİ RIO API & CDN)
 */

const { callGeminiVisionMultiKey } = require('../ai_gemini_client');
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

const MONTH_PATTERN = '(ocak|subat|şubat|mart|nisan|mayis|mayıs|haziran|temmuz|agustos|ağustos|eylul|eylül|ekim|kasim|kasım|aralik|aralık)';

function parseTurkishDateRange(title, defaultYear = new Date().getFullYear()) {
    const clean = normalizeTurkish(title);
    let startDate = null;
    let endDate = null;

    const yearMatch = clean.match(/\b(20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : defaultYear;

    const rangeRegex = new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+${MONTH_PATTERN}`, 'i');
    const rangeMatch = clean.match(rangeRegex);
    if (rangeMatch) {
        const d1 = String(rangeMatch[1]).padStart(2, '0');
        const d2 = String(rangeMatch[2]).padStart(2, '0');
        const m = MONTH_MAP[rangeMatch[3]];
        if (m) {
            startDate = `${year}-${m}-${d1}`;
            endDate = `${year}-${m}-${d2}`;
            return { startDate, endDate };
        }
    }

    const singleRegex = new RegExp(`(\\d{1,2})\\s+${MONTH_PATTERN}`, 'i');
    const singleMatch = clean.match(singleRegex);
    if (singleMatch) {
        const d = String(singleMatch[1]).padStart(2, '0');
        const m = MONTH_MAP[singleMatch[2]];
        if (m) {
            startDate = `${year}-${m}-${d}`;
            const endD = new Date(`${year}-${m}-${d}T00:00:00Z`);
            endD.setUTCDate(endD.getUTCDate() + 6);
            endDate = endD.toISOString().split('T')[0];
            return { startDate, endDate };
        }
    }

    const today = new Date();
    startDate = today.toISOString().split('T')[0];
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 6);
    endDate = nextWeek.toISOString().split('T')[0];
    return { startDate, endDate };
}

async function syncA101(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 A101 RESMİ AKTÜEL & YAPAY ZEKA SENKRONİZASYONU');
    console.log('======================================================');

    let updated = false;

    // 1. Resmi RIO API'den aktif afiş listesini çek
    console.log('🔍 A101 Resmi RIO API sorgulanıyor...');
    const listUrl = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR&__platform=web';
    let listData;
    try {
        const res = await fetch(listUrl, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        listData = await res.json();
    } catch (e) {
        console.error('❌ A101 RIO API listeleme hatası:', e.message);
        return false;
    }

    const items = listData?.items || [];
    console.log(`📋 ${items.length} adet aktif A101 kampanyası tespit edildi.`);

    for (const item of items) {
        const catalogId = `a101-rio-${item.id}`;
        const rawTitle = `${item.title || ''} ${item.seoTitle || ''}`.trim();
        const dates = parseTurkishDateRange(rawTitle);

        console.log(`\n📌 Kampanya: "${rawTitle}" (ID: ${catalogId})`);

        // Akıllı Atlama Kontrolü
        const existingCat = currentData.catalogs.find(c => c.id === catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

        if (existingCat && existingCat.pages?.length > 0 && existingProds.length >= existingCat.pages.length * 2) {
            console.log(`   ⏭️ Zaten taranmış ve ürünleri mevcut (${existingProds.length} ürün, ${existingCat.pages.length} sayfa). Atlanıyor.`);
            continue;
        }

        // Detay API'sinden sayfaları al
        console.log(`   📥 Kampanya sayfaları çekiliyor...`);
        const detUrl = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${item.id}?__culture=tr-TR&__platform=web`;
        let detData;
        try {
            const dRes = await fetch(detUrl, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(15000)
            });
            if (!dRes.ok) throw new Error(`HTTP ${dRes.status}`);
            detData = await dRes.json();
        } catch (e) {
            console.error(`   ❌ Kampanya detay hatası (${item.id}):`, e.message);
            continue;
        }

        const rawPages = detData?.pages || [];
        if (rawPages.length === 0) {
            console.log(`   ⚠️ Sayfa bulunamadı.`);
            continue;
        }

        // Eski ürünleri temizle (yeniden işleme)
        currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
        currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

        const pages = [];

        for (let idx = 0; idx < rawPages.length; idx++) {
            const pObj = rawPages[idx];
            const pageNum = idx + 1;
            const originalUrl = pObj.image;
            // Yüksek çözünürlüklü afiş URL'si
            const highResUrl = originalUrl.includes('_1024x1024.')
                ? originalUrl.replace('_1024x1024.', '_3840x3840.')
                : originalUrl;

            console.log(`   📄 Sayfa ${pageNum}/${rawPages.length} indiriliyor ve inceleniyor...`);

            try {
                let imgBuf;
                let fetchUrl = highResUrl;
                try {
                    const imgRes = await fetch(highResUrl, { signal: AbortSignal.timeout(20000) });
                    if (imgRes.ok) {
                        imgBuf = Buffer.from(await imgRes.arrayBuffer());
                    } else {
                        throw new Error(`HTTP ${imgRes.status}`);
                    }
                } catch {
                    fetchUrl = originalUrl;
                    const fbRes = await fetch(originalUrl, { signal: AbortSignal.timeout(20000) });
                    imgBuf = Buffer.from(await fbRes.arrayBuffer());
                }

                const meta = await sharp(imgBuf).metadata();
                const base64 = imgBuf.toString('base64');

                const prompt = `Sen uzman bir süpermarket aktüel ürün analistisin. 
Bu görsel A101 resmi aktüel broşür sayfasıdır.
Bu sayfada yer alan TÜM ürünleri eksiksiz olarak tespit et.
Her ürün için tam adı, markası, indirimli satış fiyatı (TL cinsinden sayısal) ve sayfadaki görsel koordinatlarını [ymin, xmin, ymax, xmax] (0-1000 normalize koordinat) olarak çıkar.

ÖNEMLİ KURALLAR:
1. Fiyatı net okunamayan veya fiyatı olmayan reklam/slogan kutularını dahil ETME. Fiyat daima 0'dan büyük bir sayı olmalıdır.
2. Ürün adını gramaj/miktar bilgisiyle birlikte tam yaz.
3. box_2d değerini ürünün fotoğrafını ve adını tam kapsayacak şekilde [ymin, xmin, ymax, xmax] formatında ver.

JSON Formatı:
{
  "products": [
    {
      "name": "Ürün Adı ve Miktarı",
      "brand": "Marka",
      "price": 49.50,
      "unit": "Adet",
      "category": "Gıda & Temizlik",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ]
}`;

                const visionRes = await callGeminiVisionMultiKey(prompt, base64);
                const detectedProds = visionRes?.products || [];
                console.log(`      🤖 Gemini Vision: ${detectedProds.length} ürün tespit etti.`);

                const pageProductIds = [];

                detectedProds.forEach((p, pIdx) => {
                    // Fiyat karşılaştırma motorunu bozmamak için fiyatsız (0 veya negatif) ürünleri filtrele
                    if (!p.price || typeof p.price !== 'number' || p.price <= 0) return;
                    if (!p.name || p.name.trim().length < 2) return;

                    const prodId = `${catalogId}-p${pageNum}-${pIdx + 1}`;
                    let img = null;

                    // Akıllı Kırpma URL'si (Weserv proxy)
                    if (p.box_2d && Array.isArray(p.box_2d)) {
                        let box = Array.isArray(p.box_2d[0]) ? p.box_2d[0] : p.box_2d;
                        if (box.length === 4) {
                            let [ymin, xmin, ymax, xmax] = box;
                            const left = Math.max(0, Math.round((xmin / 1000) * meta.width));
                            const top = Math.max(0, Math.round((ymin / 1000) * meta.height));
                            const width = Math.min(meta.width - left, Math.round(((xmax - xmin) / 1000) * meta.width));
                            const height = Math.min(meta.height - top, Math.round(((ymax - ymin) / 1000) * meta.height));

                            if (width > 30 && height > 30) {
                                const cleanUrl = fetchUrl.replace(/^https?:\/\//, '');
                                img = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                            }
                        }
                    }

                    if (!img) img = originalUrl;

                    currentData.products.push({
                        id: prodId,
                        catalogId: catalogId,
                        marketId: 'a101',
                        pageNumber: pageNum,
                        name: p.name.trim(),
                        brand: p.brand?.trim() || 'A101',
                        price: p.price,
                        originalPrice: null,
                        unit: p.unit || 'Adet',
                        category: p.category || 'Aktüel',
                        imageUrl: img,
                        startDate: dates.startDate,
                        endDate: dates.endDate,
                        isPopular: p.price > 150
                    });

                    pageProductIds.push(prodId);
                });

                pages.push({
                    pageNumber: pageNum,
                    imageUrl: highResUrl,
                    thumbnailUrl: originalUrl,
                    productIds: pageProductIds
                });

                updated = true;
                await sleep(2000); // API kotasını koruma aralığı
            } catch (err) {
                console.error(`      ❌ Sayfa ${pageNum} işleme hatası:`, err.message);
            }
        }

        if (pages.length > 0) {
            currentData.catalogs.push({
                id: catalogId,
                marketId: 'a101',
                title: `${rawTitle} A101 Aktüel`,
                subtitle: `${rawTitle} Aldın Aldın Fırsatları`,
                badge: 'Aldın Aldın',
                startDate: dates.startDate,
                endDate: dates.endDate,
                coverImageUrl: pages[0].imageUrl,
                pageCount: pages.length,
                status: 'ACTIVE',
                isFeatured: true,
                pages: pages
            });
            console.log(`   ✅ Kampanya başarıyla eklendi (${pages.length} sayfa, ${currentData.products.filter(p => p.catalogId === catalogId).length} ürün).`);
        }
    }

    return updated;
}

module.exports = { syncA101 };
