/**
 * ŞOK Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://kurumsal.sokmarket.com.tr/ (ŞOK RESMİ KURUMSAL PORTALI)
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

async function syncSok(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 ŞOK RESMİ AKTÜEL & YAPAY ZEKA SENKRONİZASYONU');
    console.log('======================================================');

    let updated = false;

    const sections = [
        {
            title: 'Haftanın Fırsatları',
            badge: 'Çarşamba Fırsatları',
            url: 'https://kurumsal.sokmarket.com.tr/firsatlar/haftanin-firsatlari'
        },
        {
            title: 'Hafta Sonu Fırsatları',
            badge: 'Hafta Sonu',
            url: 'https://kurumsal.sokmarket.com.tr/firsatlar/haftasonu-firsatlari'
        }
    ];

    for (const sec of sections) {
        console.log(`\n🔍 ŞOK Bölümü Sorgulanıyor: ${sec.title} (${sec.url})...`);
        let html;
        try {
            html = await fetchHtml(sec.url);
        } catch (e) {
            console.error(`❌ ${sec.title} sayfası açılamadı:`, e.message);
            continue;
        }

        // Afiş görselini bul (/uploads/YYYYMMDD...jpg)
        const imgRegex = /src="([^"]*\/uploads\/[^"]+\.jpg)"/gi;
        const foundImages = [];
        let m;
        while ((m = imgRegex.exec(html)) !== null) {
            let fullUrl = m[1];
            if (!fullUrl.startsWith('http')) {
                fullUrl = `https://kurumsal.sokmarket.com.tr${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
            }
            if (!foundImages.includes(fullUrl)) foundImages.push(fullUrl);
        }

        if (foundImages.length === 0) {
            console.log(`   ⚠️ Görsel tespit edilemedi.`);
            continue;
        }

        console.log(`   📸 ${foundImages.length} adet afiş görseli bulundu.`);

        for (let i = 0; i < foundImages.length; i++) {
            const flyerUrl = foundImages[i];
            const fileMatch = flyerUrl.match(/\/uploads\/(\d{4})(\d{2})(\d{2})/);
            let startDate, endDate;
            if (fileMatch) {
                const year = fileMatch[1];
                const month = fileMatch[2];
                const day = fileMatch[3];
                startDate = `${year}-${month}-${day}`;
                const endD = new Date(`${year}-${month}-${day}T00:00:00Z`);
                endD.setUTCDate(endD.getUTCDate() + 6);
                endDate = endD.toISOString().split('T')[0];
            } else {
                const today = new Date();
                startDate = today.toISOString().split('T')[0];
                const nextWeek = new Date(today);
                nextWeek.setDate(nextWeek.getDate() + 6);
                endDate = nextWeek.toISOString().split('T')[0];
            }

            const cleanFileName = flyerUrl.split('/').pop().replace(/\.[^.]+$/, '');
            const catalogId = `sok-resmi-${cleanFileName}`;

            // Akıllı Atlama Kontrolü
            const existingCat = currentData.catalogs.find(c => c.id === catalogId);
            const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

            if (existingCat && existingProds.length >= 5 && !options.force) {
                console.log(`   ⏭️ "${sec.title}" afişi zaten taranmış (${existingProds.length} ürün mevcut). Atlanıyor.`);
                continue;
            }

            console.log(`   📥 Afiş indiriliyor: ${flyerUrl}`);
            try {
                const imgRes = await fetch(flyerUrl, {
                    headers: { 'User-Agent': USER_AGENT },
                    signal: AbortSignal.timeout(20000)
                });
                if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const meta = await sharp(imgBuf).metadata();
                const base64 = imgBuf.toString('base64');

                const prompt = `Sen uzman bir süpermarket aktüel ürün analistisin. 
Bu görsel ŞOK resmi aktüel broşür sayfasıdır.
Bu sayfada yer alan TÜM indirimli ürünleri eksiksiz olarak tespit et.
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

                            if (width > 10 && height > 10) {
                                const cleanUrl = flyerUrl.replace(/^https?:\/\//, '');
                                img = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                            }
                        }
                    }

                    if (!img) img = flyerUrl;

                    currentData.products.push({
                        id: prodId,
                        catalogId: catalogId,
                        marketId: 'sok',
                        pageNumber: 1,
                        name: p.name.trim(),
                        brand: p.brand?.trim() || 'ŞOK',
                        price: p.price,
                        originalPrice: null,
                        unit: p.unit || 'Adet',
                        category: p.category || 'Aktüel',
                        imageUrl: img,
                        startDate: startDate,
                        endDate: endDate,
                        isPopular: p.price > 100
                    });

                    pageProductIds.push(prodId);
                });

                currentData.catalogs.push({
                    id: catalogId,
                    marketId: 'sok',
                    title: `ŞOK ${sec.title}`,
                    subtitle: `ŞOK ${sec.badge} Kataloğu`,
                    badge: sec.badge,
                    startDate: startDate,
                    endDate: endDate,
                    coverImageUrl: flyerUrl,
                    pageCount: 1,
                    status: 'ACTIVE',
                    isFeatured: true,
                    pages: [
                        {
                            pageNumber: 1,
                            imageUrl: flyerUrl,
                            thumbnailUrl: flyerUrl,
                            productIds: pageProductIds
                        }
                    ]
                });

                console.log(`   ✅ ŞOK Kataloğu eklendi: ${sec.title} (${pageProductIds.length} ürün)`);
                updated = true;
                await sleep(2500);
            } catch (err) {
                console.error(`   ❌ Afiş işleme hatası (${flyerUrl}):`, err.message);
            }
        }
    }

    return updated;
}

module.exports = { syncSok };
