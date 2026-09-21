/**
 * CarrefourSA Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://images.csfour.com/ & https://www.carrefoursa.com/ (RESMİ CARREFOURSA VARLIKLARI)
 */

const { callGeminiVisionMultiKey } = require('../ai_gemini_client');
const sharp = require('sharp');
const fs = require('fs');

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
            endD.setUTCDate(endD.getUTCDate() + 11);
            endDate = endD.toISOString().split('T')[0];
            return { startDate, endDate };
        }
    }

    const today = new Date();
    startDate = today.toISOString().split('T')[0];
    const nextTwoWeeks = new Date(today);
    nextTwoWeeks.setDate(nextTwoWeeks.getDate() + 11);
    endDate = nextTwoWeeks.toISOString().split('T')[0];
    return { startDate, endDate };
}

// Resmi CarrefourSA afiş kaynakları (images.csfour.com)
const OFFICIAL_CARREFOUR_BANNERS = [
    {
        id: 'carrefoursa-dogru-kalite-19-30-eylul',
        title: 'CarrefourSA Doğru Kalite Doğru Fiyata (19-30 Eylül)',
        badge: 'Fırsat Kataloğu',
        dateStr: '19-30 Eylül',
        url: 'https://images.csfour.com/bannerimage/regebebebeeee_0_MC/8876417187890.png'
    },
    {
        id: 'carrefoursa-gurme-eylul-2026',
        title: 'CarrefourSA Gurme Okula Dönüş (1-30 Eylül)',
        badge: 'Gurme',
        dateStr: '1-30 Eylül',
        url: 'https://images.csfour.com/bannerimage/653h3h3b3b3_0_MC/8876178997298.png'
    }
];

async function syncCarrefour(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 CARREFOURSA RESMİ AKTÜEL & YAPAY ZEKA SENKRONİZASYONU');
    console.log('======================================================');

    let updated = false;

    // 1. Varsa Puppeteer ile katalog sayfasından canlı afişleri tara
    let liveBanners = [];
    try {
        const puppeteer = require('puppeteer-core');
        const chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const executablePath = chromePaths.find(p => fs.existsSync(p));
        if (executablePath) {
            console.log(`🌐 Chromium ile CarrefourSA taranıyor (${executablePath})...`);
            const browser = await puppeteer.launch({
                executablePath,
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.goto('https://www.carrefoursa.com/kataloglar', { waitUntil: 'networkidle2', timeout: 30000 });
            liveBanners = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('img[src*="images.csfour.com/bannerimage"]').forEach(img => {
                    const w = img.naturalWidth || img.width || 0;
                    const h = img.naturalHeight || img.height || 0;
                    if (w >= 400 && h >= 400 && !img.src.includes('ikon') && !img.src.includes('ic_')) {
                        results.push(img.src);
                    }
                });
                return results;
            });
            await browser.close();
        }
    } catch (e) {
        // Puppeteer yoksa veya engellenirse resmi CDN listesiyle devam eder
    }

    // Hedef afiş listesi
    const targetBanners = [...OFFICIAL_CARREFOUR_BANNERS];
    liveBanners.forEach((url, idx) => {
        if (!targetBanners.some(b => b.url === url)) {
            targetBanners.push({
                id: `carrefoursa-canli-afis-${idx + 1}`,
                title: `CarrefourSA Aktüel Fırsatlar`,
                badge: 'Aktüel',
                dateStr: '19-30 Eylül',
                url: url
            });
        }
    });

    console.log(`📋 ${targetBanners.length} adet resmi CarrefourSA afişi değerlendiriliyor.`);

    for (const b of targetBanners) {
        const catalogId = b.id;
        const dates = parseTurkishDateRange(b.dateStr);

        console.log(`\n📌 Afiş: "${b.title}" (ID: ${catalogId})`);

        // Akıllı Atlama Kontrolü
        const existingCat = currentData.catalogs.find(c => c.id === catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

        if (existingCat && existingProds.length >= 3) {
            console.log(`   ⏭️ Zaten taranmış (${existingProds.length} ürün mevcut). Atlanıyor.`);
            continue;
        }

        console.log(`   📥 Afiş indiriliyor: ${b.url}`);
        try {
            const imgRes = await fetch(b.url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(20000)
            });
            if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            const meta = await sharp(imgBuf).metadata();

            // Boyut kontrolü: Broşür olmayan küçük simgeleri atla
            if (!meta.width || !meta.height || meta.width < 400 || meta.height < 400) {
                console.log(`   ⏭️ Görsel boyutu yetersiz (${meta.width}x${meta.height}), afiş değil. Atlanıyor.`);
                continue;
            }
            const base64 = imgBuf.toString('base64');

            const prompt = `Sen uzman bir süpermarket aktüel ürün analistisin. 
Bu görsel CarrefourSA resmi aktüel broşürü veya fırsat afişidir.
Bu sayfada yer alan TÜM indirimli ürünleri, fiyatları ve fırsatları eksiksiz olarak tespit et.
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

            console.log('   🤖 Gemini Vision (Çoklu API Key Havuzu) ile afiş inceleniyor...');
            const visionRes = await callGeminiVisionMultiKey(prompt, base64);
            const detectedProds = visionRes?.products || [];
            console.log(`      ✅ Gemini Vision: ${detectedProds.length} ürün tespit etti.`);

            if (detectedProds.length === 0) continue;

            // Eski kayıtları temizle
            currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
            currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

            const pageProductIds = [];

            detectedProds.forEach((p, pIdx) => {
                if (!p.price || typeof p.price !== 'number' || p.price <= 0) return;
                if (!p.name || p.name.trim().length < 2) return;

                const prodId = `${catalogId}-p1-${pIdx + 1}`;
                let img = null;

                if (p.box_2d && Array.isArray(p.box_2d)) {
                    let box = Array.isArray(p.box_2d[0]) ? p.box_2d[0] : p.box_2d;
                    if (box.length === 4) {
                        let [ymin, xmin, ymax, xmax] = box;
                        const left = Math.max(0, Math.round((xmin / 1000) * meta.width));
                        const top = Math.max(0, Math.round((ymin / 1000) * meta.height));
                        const width = Math.min(meta.width - left, Math.round(((xmax - xmin) / 1000) * meta.width));
                        const height = Math.min(meta.height - top, Math.round(((ymax - ymin) / 1000) * meta.height));

                        if (width > 30 && height > 30) {
                            const cleanUrl = b.url.replace(/^https?:\/\//, '');
                            img = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                        }
                    }
                }

                if (!img) img = b.url;

                currentData.products.push({
                    id: prodId,
                    catalogId: catalogId,
                    marketId: 'carrefoursa',
                    pageNumber: 1,
                    name: p.name.trim(),
                    brand: p.brand?.trim() || 'CarrefourSA',
                    price: p.price,
                    originalPrice: null,
                    unit: p.unit || 'Adet',
                    category: p.category || 'Aktüel',
                    imageUrl: img,
                    startDate: dates.startDate,
                    endDate: dates.endDate,
                    isPopular: p.price > 100
                });

                pageProductIds.push(prodId);
            });

            currentData.catalogs.push({
                id: catalogId,
                marketId: 'carrefoursa',
                title: b.title,
                subtitle: `CarrefourSA İndirimli Ürün Kataloğu`,
                badge: b.badge,
                startDate: dates.startDate,
                endDate: dates.endDate,
                coverImageUrl: b.url,
                pageCount: 1,
                status: 'ACTIVE',
                isFeatured: true,
                pages: [
                    {
                        pageNumber: 1,
                        imageUrl: b.url,
                        thumbnailUrl: b.url,
                        productIds: pageProductIds
                    }
                ]
            });

            console.log(`   ✅ CarrefourSA Kataloğu eklendi: ${b.title} (${pageProductIds.length} ürün)`);
            updated = true;
            await sleep(2500);
        } catch (err) {
            console.error(`   ❌ CarrefourSA afiş hatası (${b.url}):`, err.message);
        }
    }

    return updated;
}

module.exports = { syncCarrefour };
