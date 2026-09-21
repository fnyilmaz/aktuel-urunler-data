/**
 * GitHub Actions & Yerel Ortam İçin Yapay Zeka (Gemini Vision) Destekli
 * Otomatik Broşür & Ürün Senkronizasyonu ve Akıllı Kırpma Motoru
 * 
 * 1. BİM resmi sitesinden güncel broşürleri kontrol eder.
 * 2. Zaten taranmış ve ürünleri eksiksiz olan broşürleri AKILLI ATLAMA (Skip) ile geçer.
 * 3. Yeni bir broşür geldiğinde:
 *    - Her sayfasını Gemini Vision ile inceler ve tüm ürünleri çıkarır.
 *    - Web sitesindeki izole stüdyo fotoğraflarıyla eşleştirir.
 *    - İzole fotoğrafı olmayan ürünleri afişten bounding-box (kutulama) yöntemiyle kırpar.
 * 4. Değişiklik varsa veriyi doğrular ve kaydeder.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1. Ortam Değişkenleri (.env veya GitHub Actions Secrets)
const envPath = path.join(__dirname, '..', '.env');
let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    envLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('GEMINI_API_KEY=')) {
            apiKey = trimmed.replace('GEMINI_API_KEY=', '').trim();
        }
    });
}

const DATA_PATH = fs.existsSync(path.join(__dirname, '..', 'catalogs.json'))
    ? path.join(__dirname, '..', 'catalogs.json')
    : path.join(__dirname, '..', '..', 'github_automation', 'catalogs.json');

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

async function callGeminiVision(prompt, base64Image) {
    if (!apiKey) throw new Error('GEMINI_API_KEY tanımlı değil!');

    const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-3.5-flash'
    ];

    for (const model of candidateModels) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const r = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (r.status === 429) {
                console.log(`⏳ Rate limit (429) - 15 sn bekleniyor...`);
                await sleep(15000);
                continue;
            }

            if (r.ok) {
                const data = await r.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return JSON.parse(text);
            }
        } catch (e) {
            console.warn(`Model ${model} hatası:`, e.message);
            await sleep(3000);
        }
    }
    return null;
}

// BİM web sitesindeki beyaz zeminli ürün fotoğrafları havuzunu oluşturur
async function buildWebImagePool() {
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
    } catch (e) {
        console.warn('⚠️ Web fotoğraf havuzu oluşturulamadı:', e.message);
    }
    return pool;
}

function findBestWebImage(name, brand, webImagePool) {
    if (!webImagePool || webImagePool.length === 0) return null;
    const cleanTarget = normalizeTurkish(name + ' ' + (brand || '')).replace(/[^a-z0-9]/g, ' ');
    const targetTokens = cleanTarget.split(/\s+/).filter(t => t.length > 2);

    let bestMatch = null;
    let highestScore = 0;

    for (const item of webImagePool) {
        const cleanPool = normalizeTurkish(item.name + ' ' + (item.brand || '')).replace(/[^a-z0-9]/g, ' ');
        let matchCount = 0;
        for (const t of targetTokens) {
            if (cleanPool.includes(t)) matchCount++;
        }
        const score = matchCount / Math.max(targetTokens.length, 1);
        if (score > highestScore && score >= 0.5) {
            highestScore = score;
            bestMatch = item.imageUrl;
        }
    }
    return bestMatch;
}

async function runAiSyncWorkflow() {
    console.log('===============================================================');
    console.log('🤖 BİM & MARKETLER AKILLI AI VİZYON VE KIRPMA MOTORU');
    console.log('===============================================================');
    console.log(`⏰ Çalışma Zamanı: ${new Date().toLocaleString('tr-TR')}`);

    if (!fs.existsSync(DATA_PATH)) {
        console.error(`❌ Veri dosyası bulunamadı: ${DATA_PATH}`);
        process.exit(1);
    }

    const currentData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    currentData.catalogs = currentData.catalogs || [];
    currentData.products = currentData.products || [];

    console.log(`📂 Mevcut Durum: ${currentData.catalogs.length} katalog, ${currentData.products.length} ürün (v${currentData.version || 1})`);

    // 1. BİM broşür sayfasını kontrol et
    console.log('\n🔍 BİM resmi afişleri taranıyor...');
    let html = '';
    try {
        html = await fetchHtml('https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx');
    } catch (e) {
        console.error('❌ BİM ana sayfasına ulaşılamadı:', e.message);
        return;
    }

    const parts = html.split('<div class="subButton">').slice(1);
    const discoveredBrochures = [];
    const todayStr = new Date().toISOString().split('T')[0];

    parts.forEach((part, index) => {
        const titleMatch = part.match(/<span class="text">([\s\S]*?)<\/span>/i);
        const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : `BİM Kampanya ${index + 1}`;

        const imgRegex = /data-bigimg="([^"]+)"/gi;
        const pageUrls = [];
        let match;
        while ((match = imgRegex.exec(part)) !== null) {
            let img = match[1].trim();
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) pageUrls.push(img);
        }

        const fancyMatch = part.match(/<a[^>]+class="fancyboxImage"[^>]+href="([^"]+)"/i);
        if (fancyMatch) {
            let img = fancyMatch[1].trim();
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) pageUrls.unshift(img);
        }

        if (pageUrls.length > 0) {
            const { startDate, endDate } = parseTurkishDateRange(rawTitle);
            if (endDate < todayStr) return; // Süresi geçmişleri atla

            const cleanSlug = normalizeTurkish(rawTitle).replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
            const catalogId = `bim_${cleanSlug}_${startDate.replace(/-/g, '_')}`;

            discoveredBrochures.push({
                catalogId,
                rawTitle,
                startDate,
                endDate,
                pageUrls
            });
        }
    });

    console.log(`📌 BİM sitesinde ${discoveredBrochures.length} güncel broşür bulundu.`);

    // 2. Akıllı Atlama (Skip) Kontrolü
    const newBrochures = [];
    for (const b of discoveredBrochures) {
        const existing = currentData.catalogs.find(c => c.id === b.catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === b.catalogId);
        if (existing && existingProds.length > 0) {
            // Zaten mevcut ve ürünleri dolu
            continue;
        }
        newBrochures.push(b);
    }

    // 3. Afiş minyatürü kullanan ürün kontrolü (kırpma gereksinimi)
    const prodsNeedingCrop = currentData.products.filter(p => 
        p.imageUrl && (p.imageUrl.includes('/afisler/k_') || (p.imageUrl.includes('/afisler/') && !p.imageUrl.includes('crop=')))
    );

    if (newBrochures.length === 0 && prodsNeedingCrop.length === 0) {
        console.log('\n✨ [AKILLI ATLAMA]: Tüm broşürler ve ürün kırpmaları %100 güncel!');
        console.log('   Yeni taranacak broşür veya kırpılacak görsel bulunamadı.');
        return false;
    }

    let hasChanges = false;
    let webPool = null;

    // 4. Yeni broşürleri tara
    if (newBrochures.length > 0) {
        console.log(`\n🚀 ${newBrochures.length} YENİ BROŞÜR TESPİT EDİLDİ! Gemini Vision ile taranıyor...`);
        webPool = await buildWebImagePool();

        for (const b of newBrochures) {
            console.log(`\n📄 Broşür İnceleniyor: ${b.rawTitle} (${b.pageUrls.length} Sayfa)`);
            const pages = [];

            for (let pIdx = 0; pIdx < b.pageUrls.length; pIdx++) {
                const pageNum = pIdx + 1;
                const pageUrl = b.pageUrls[pIdx];
                console.log(`  ➡️ Sayfa ${pageNum}/${b.pageUrls.length} okunuyor...`);

                try {
                    const imgRes = await fetch(pageUrl, { headers: { 'User-Agent': USER_AGENT } });
                    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                    const meta = await sharp(imgBuf).metadata();
                    const base64Image = imgBuf.toString('base64');

                    const prompt = `Sen uzman bir market broşürü ve aktüel ürün analistisin. 
Bu görsel bir süpermarket aktüel broşür sayfasıdır.
Bu sayfada yer alan TÜM indirimli ürünleri eksiksiz olarak tespit et.
Her ürün için tam adını, markasını, fiyatını (sayısal TL) ve sayfadaki görsel koordinatlarını [ymin, xmin, ymax, xmax] (0-1000 normalize) ver.

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
                    const resJson = await callGeminiVision(prompt, base64Image);
                    const prods = resJson?.products || [];
                    console.log(`     ✅ Gemini ${prods.length} ürün tespit etti.`);

                    const pageProductIds = [];
                    prods.forEach((p, idx) => {
                        const prodId = `${b.catalogId}_p${pageNum}_${idx + 1}`;
                        let imageUrl = findBestWebImage(p.name, p.brand, webPool);

                        // Eğer web stüdyo resmi yoksa, doğrudan afişten kırpılmış URL ver!
                        if (!imageUrl && p.box_2d && p.box_2d.length === 4) {
                            let [ymin, xmin, ymax, xmax] = Array.isArray(p.box_2d[0]) ? p.box_2d[0] : p.box_2d;
                            const left = Math.max(0, Math.round((xmin / 1000) * meta.width));
                            const top = Math.max(0, Math.round((ymin / 1000) * meta.height));
                            const width = Math.min(meta.width - left, Math.round(((xmax - xmin) / 1000) * meta.width));
                            const height = Math.min(meta.height - top, Math.round(((ymax - ymin) / 1000) * meta.height));

                            if (width > 0 && height > 0) {
                                const cleanUrl = pageUrl.replace(/^https?:\/\//, '');
                                imageUrl = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                            }
                        }

                        if (!imageUrl) {
                            imageUrl = pageUrl.replace('/afisler/', '/afisler/k_');
                        }

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
                            imageUrl: imageUrl,
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

                    hasChanges = true;
                    await sleep(4000);
                } catch (e) {
                    console.error(`     ❌ Sayfa hatası:`, e.message);
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
    }

    // 5. Kırpılması gereken eski afiş minyatürleri varsa kırp
    if (prodsNeedingCrop.length > 0) {
        console.log(`\n✂️ ${prodsNeedingCrop.length} adet afiş minyatürü kullanan ürün için kutu kırpması yapılıyor...`);
        // Group by page
        const groups = new Map();
        for (const p of prodsNeedingCrop) {
            const k = `${p.catalogId}#${p.pageNumber}`;
            if (!groups.has(k)) {
                const c = currentData.catalogs.find(cat => cat.id === p.catalogId);
                const page = c?.pages?.find(pg => pg.pageNumber === p.pageNumber);
                let highRes = (page?.imageUrl || p.imageUrl).replace('/afisler/k_', '/afisler/');
                groups.set(k, { pageUrl: highRes, products: [] });
            }
            groups.get(k).products.push(p);
        }

        for (const [k, grp] of groups.entries()) {
            try {
                const imgRes = await fetch(grp.pageUrl);
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const meta = await sharp(imgBuf).metadata();
                const base64 = imgBuf.toString('base64');

                const prompt = `Bu afişteki şu ürünlerin her birinin sınır kutusunu [ymin, xmin, ymax, xmax] (0-1000 normalize) olarak tespit et:
${grp.products.map((p, i) => `${i + 1}. [id: "${p.id}"] "${p.name}"`).join('\n')}

Yanıtı sadece JSON ver:
{
  "crops": [
    { "id": "ürün_id", "box_2d": [ymin, xmin, ymax, xmax] }
  ]
}`;
                const resJson = await callGeminiVision(prompt, base64);
                const crops = resJson?.crops || [];

                crops.forEach(c => {
                    const prod = grp.products.find(p => p.id === c.id);
                    if (!prod || !c.box_2d) return;
                    let box = Array.isArray(c.box_2d[0]) ? c.box_2d[0] : c.box_2d;
                    if (box.length !== 4) return;
                    let [ymin, xmin, ymax, xmax] = box;

                    const left = Math.max(0, Math.round((xmin / 1000) * meta.width));
                    const top = Math.max(0, Math.round((ymin / 1000) * meta.height));
                    const width = Math.min(meta.width - left, Math.round(((xmax - xmin) / 1000) * meta.width));
                    const height = Math.min(meta.height - top, Math.round(((ymax - ymin) / 1000) * meta.height));

                    if (width > 0 && height > 0) {
                        const cleanUrl = grp.pageUrl.replace(/^https?:\/\//, '');
                        prod.imageUrl = `https://images.weserv.nl/?url=${cleanUrl}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                        hasChanges = true;
                    }
                });
                await sleep(4000);
            } catch (e) {
                console.error(`Kırpma hatası (${k}):`, e.message);
            }
        }
    }

    if (hasChanges) {
        currentData.version = (currentData.version || 20) + 1;
        currentData.lastUpdated = new Date().toISOString();

        console.log(`\n📦 Veri güncellendi! Yeni Sürüm: v${currentData.version}`);

        fs.writeFileSync(DATA_PATH, JSON.stringify(currentData, null, 2), 'utf8');
        console.log(`💾 Kaydedildi: ${DATA_PATH}`);

        // data/catalogs.json da varsa güncelle
        const altDataPath = path.join(__dirname, '..', '..', 'data', 'catalogs.json');
        if (fs.existsSync(path.dirname(altDataPath))) {
            fs.writeFileSync(altDataPath, JSON.stringify(currentData, null, 2), 'utf8');
        }

        return true;
    }

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
