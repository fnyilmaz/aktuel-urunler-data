/**
 * BİM Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://www.bim.com.tr/ (SADECE BİM RESMİ SİTESİ)
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

function parseTurkishDateRange(title, currentYear = new Date().getFullYear()) {
    const clean = normalizeTurkish(title);
    let startDate = null;
    let endDate = null;

    // Örnek: "24 mart - 31 aralik"
    const twoMonthMatch = clean.match(/(\d{1,2})\s+([a-z]+)\s*[-–]\s*(\d{1,2})\s+([a-z]+)/i);
    if (twoMonthMatch) {
        const d1 = String(twoMonthMatch[1]).padStart(2, '0');
        const m1 = MONTH_MAP[twoMonthMatch[2]];
        const d2 = String(twoMonthMatch[3]).padStart(2, '0');
        const m2 = MONTH_MAP[twoMonthMatch[4]];
        if (m1 && m2) {
            startDate = `${currentYear}-${m1}-${d1}`;
            endDate = `${currentYear}-${m2}-${d2}`;
            return { startDate, endDate };
        }
    }

    // Örnek: "19-25 eylul" veya "01-28 eylul"
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

    // Örnek: "15 eylul sali"
    const singleMatch = clean.match(/(\d{1,2})\s+([a-z]+)/i);
    if (singleMatch) {
        const d = String(singleMatch[1]).padStart(2, '0');
        const m = MONTH_MAP[singleMatch[2]];
        if (m) {
            startDate = `${currentYear}-${m}-${d}`;
            const endD = new Date(`${currentYear}-${m}-${d}T00:00:00Z`);
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

async function fetchHtml(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
}

async function buildBimWebPool() {
    const pool = [];
    try {
        const mainHtml = await fetchHtml('https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx');
        const tabRegex = /<a[^>]+href="\/categories\/100\/aktuel-urunler\.aspx\?Bim_AktuelTarihKey=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const keys = [];
        let m;
        while ((m = tabRegex.exec(mainHtml)) !== null) {
            if (!keys.includes(m[1])) keys.push(m[1]);
        }

        for (const k of keys) {
            try {
                const tabHtml = await fetchHtml(`https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?Bim_AktuelTarihKey=${k}`);
                const blocks = tabHtml.split('<div class="inner">').slice(1);
                blocks.forEach(b => {
                    const imgMatch = b.match(/<img[^>]+src="([^"]+)"/i);
                    const titleMatch = b.match(/<h2 class="title">([\s\S]*?)<\/h2>/i);
                    const subTitleMatch = b.match(/<h2 class="subTitle">([\s\S]*?)<\/h2>/i);
                    if (imgMatch && titleMatch) {
                        let img = imgMatch[1].trim();
                        if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
                        const brand = subTitleMatch ? subTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
                        const name = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                        pool.push({ name, brand, imageUrl: img });
                    }
                });
            } catch (e) {}
        }
    } catch (e) {}
    return pool;
}

function findBestImage(name, brand, pool) {
    if (!pool || pool.length === 0) return null;
    const cleanTarget = normalizeTurkish(name + ' ' + (brand || '')).replace(/[^a-z0-9]/g, ' ');
    const tokens = cleanTarget.split(/\s+/).filter(t => t.length > 2);

    let best = null;
    let maxScore = 0;
    for (const item of pool) {
        const cleanPool = normalizeTurkish(item.name + ' ' + (item.brand || '')).replace(/[^a-z0-9]/g, ' ');
        let matches = 0;
        for (const t of tokens) {
            if (cleanPool.includes(t)) matches++;
        }
        const score = matches / Math.max(tokens.length, 1);
        if (score > maxScore && score >= 0.5) {
            maxScore = score;
            best = item.imageUrl;
        }
    }
    return best;
}

async function syncBim(currentData) {
    console.log('🔴 [BİM] Resmi Web Sitesi (Afişler) Kontrol Ediliyor...');
    const html = await fetchHtml('https://www.bim.com.tr/Categories/680/afisler.aspx');
    const parts = html.split('<a class="subTabArea').slice(1);
    const todayStr = new Date().toISOString().split('T')[0];

    const brochures = [];
    parts.forEach((part, index) => {
        const titleMatch = part.match(/<span class="text">([\s\S]*?)<\/span>/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : `BİM Kampanya ${index + 1}`;

        const dlRegex = /href="([^"]*\/uploads\/afisler\/[^"]+)"/gi;
        const pageUrls = [];
        let match;
        while ((match = dlRegex.exec(part)) !== null) {
            let img = match[1].trim();
            img = img.replace(/\/afisler\/k_/, '/afisler/');
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) pageUrls.push(img);
        }

        const imgRegex = /<img[^>]+src="([^"]*\/uploads\/afisler\/[^"]+)"/gi;
        while ((match = imgRegex.exec(part)) !== null) {
            let img = match[1].trim();
            img = img.replace(/\/afisler\/k_/, '/afisler/');
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) pageUrls.push(img);
        }

        if (pageUrls.length > 0) {
            const { startDate, endDate } = parseTurkishDateRange(rawTitle);
            if (endDate && endDate < todayStr) return;

            const cleanSlug = normalizeTurkish(rawTitle).replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
            const catalogId = `bim_${cleanSlug}_${startDate.replace(/-/g, '_')}`;

            brochures.push({
                catalogId,
                rawTitle,
                startDate,
                endDate,
                pageUrls
            });
        }
    });

    const newBrochures = brochures.filter(b => {
        const existing = (currentData.catalogs || []).find(c => c.id === b.catalogId);
        const existingProds = (currentData.products || []).filter(p => p.catalogId === b.catalogId);
        return !existing || existingProds.length === 0;
    });

    if (newBrochures.length === 0) {
        console.log('⚡ [BİM] Tüm resmi broşürler güncel, yeni broşür bulunamadı.');
        return false;
    }

    console.log(`🚀 [BİM] ${newBrochures.length} yeni resmi broşür bulundu, Gemini Vision ile analiz ediliyor...`);
    const webPool = await buildBimWebPool();
    let updated = false;

    for (const b of newBrochures) {
        console.log(`  📄 Broşür: ${b.rawTitle} (${b.pageUrls.length} sayfa)`);
        const pages = [];

        for (let pIdx = 0; pIdx < b.pageUrls.length; pIdx++) {
            const pageNum = pIdx + 1;
            const pageUrl = b.pageUrls[pIdx];
            console.log(`    ➡️ Sayfa ${pageNum}/${b.pageUrls.length} analiz ediliyor...`);

            try {
                const imgRes = await fetch(pageUrl);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const meta = await sharp(imgBuf).metadata();
                const base64 = imgBuf.toString('base64');

                const prompt = `Sen uzman bir süpermarket aktüel broşür ve ürün analistisin.
Bu görsel BİM resmi aktüel broşür sayfasıdır.
Sayfadaki TÜM indirimli ürünleri eksiksiz tespit et.
Her ürün için tam adı, markası, fiyatı (sayısal TL) ve sayfadaki görsel koordinatlarını [ymin, xmin, ymax, xmax] (0-1000 normalize) ver.

JSON Formatı:
{
  "products": [
    {
      "name": "Ürün Adı ve Gramajı",
      "brand": "Marka",
      "price": 199.0,
      "unit": "Adet",
      "category": "Kategori",
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ]
}`;

                const result = await callGeminiVisionMultiKey(prompt, base64);
                const prods = result?.products || [];
                console.log(`       ✅ Gemini ${prods.length} ürün tespit etti.`);

                const pageProductIds = [];
                prods.forEach((p, idx) => {
                    if (!p.price || typeof p.price !== 'number' || p.price <= 0) return;
                    if (!p.name || p.name.trim().length < 2) return;

                    const prodId = `${b.catalogId}_p${pageNum}_${idx + 1}`;
                    let img = findBestImage(p.name, p.brand, webPool);

                    if (!img && p.box_2d) {
                        let box = Array.isArray(p.box_2d[0]) ? p.box_2d[0] : p.box_2d;
                        if (box.length === 4) {
                            const [ymin, xmin, ymax, xmax] = box;
                            const left = Math.max(0, Math.round((xmin / 1000) * meta.width));
                            const top = Math.max(0, Math.round((ymin / 1000) * meta.height));
                            const width = Math.min(meta.width - left, Math.round(((xmax - xmin) / 1000) * meta.width));
                            const height = Math.min(meta.height - top, Math.round(((ymax - ymin) / 1000) * meta.height));

                            if (width > 0 && height > 0) {
                                const cleanUrl = pageUrl.replace(/^https?:\/\//, '');
                                img = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                            }
                        }
                    }

                    if (!img) img = pageUrl.replace('/afisler/', '/afisler/k_');

                    currentData.products.push({
                        id: prodId,
                        catalogId: b.catalogId,
                        marketId: 'bim',
                        pageNumber: pageNum,
                        name: p.name,
                        brand: p.brand || 'BİM',
                        price: typeof p.price === 'number' ? p.price : 0,
                        originalPrice: null,
                        unit: p.unit || 'Adet',
                        category: p.category || 'Gıda & Tüketim',
                        imageUrl: img,
                        startDate: b.startDate,
                        endDate: b.endDate,
                        isPopular: p.price > 100
                    });

                    pageProductIds.push(prodId);
                });

                pages.push({
                    pageNumber: pageNum,
                    imageUrl: pageUrl,
                    thumbnailUrl: pageUrl.replace('/afisler/', '/afisler/k_'),
                    productIds: pageProductIds
                });

                updated = true;
                await sleep(2000);
            } catch (e) {
                console.error(`       ❌ Sayfa hatası:`, e.message);
            }
        }

        currentData.catalogs.push({
            id: b.catalogId,
            marketId: 'bim',
            title: `${b.rawTitle} BİM Aktüel`,
            subtitle: `${b.rawTitle} İndirimli Ürün Kataloğu`,
            badge: 'Aktüel',
            startDate: b.startDate,
            endDate: b.endDate,
            coverImageUrl: b.pageUrls[0],
            pageCount: pages.length,
            status: 'ACTIVE',
            isFeatured: true,
            pages: pages
        });
    }

    return updated;
}

module.exports = { syncBim };
