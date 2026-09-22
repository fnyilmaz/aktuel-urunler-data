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

const REVERSE_MONTH_MAP = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
    '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
    '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
};

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://www.a101.com.tr',
    'Referer': 'https://www.a101.com.tr/',
    'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
};

const ARTI_STATIC_FALLBACK = [
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/BqV34RYEhT_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/i85r-bgRPv_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/S1gT9WD-a8_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/GTaFxK1dU4_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/LyZLyPUJ04_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/IPfQhFTlwg_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/ZjDkaiSJkN_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/pEif1yUhLo_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/KeRsEjeObc_1024x1024.png',
    'https://cdn2.a101.com.tr/dbmk89vnr/CALL/Image/get/b4hvfpsGAd_1024x1024.png'
];

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

/**
 * Kampanya türüne ve başlığına göre doğru rozeti (Badge) belirler
 */
function resolveA101Badge(item, rawTitle) {
    const text = `${item.title || ''} ${item.seoTitle || ''} ${rawTitle || ''}`.toLowerCase();
    if (item.promotionId === 'Z010' || text.includes('10 tl')) return '10 TL ve Üzeri';
    if (item.promotionId === 'Z100' || text.includes('haftanın yıldızları') || text.includes('haftanin yildizlari')) return 'Haftanın Yıldızları';
    if (item.promotionId === 'Z151' || text.includes('ekstra')) return 'Aldın Aldın Ekstra';
    if (text.includes('artı') || text.includes('arti')) return 'A101 Artı';
    if (item.promotionId === 'ZP01' || text.includes('tazenin')) return 'Tazenin Yıldızları';
    return 'Aldın Aldın';
}

/**
 * Temiz ve okunabilir katalog başlıkları ve alt başlıkları üretir
 */
function buildA101Titles(item, badge, dates) {
    let t = (item.title || '').trim();
    let seo = (item.seoTitle || '').trim();

    // "17 Eylül 17 Eylül Tarihinden İtibaren" gibi tekrar eden tarihleri temizle
    let displayTitle = '';
    if (seo && t && seo.toLowerCase().includes(t.toLowerCase())) {
        displayTitle = `${seo} A101 Aktüel`;
    } else if (seo && t) {
        displayTitle = `${t} ${seo} A101 Aktüel`;
    } else if (seo) {
        displayTitle = `${seo} A101 Aktüel`;
    } else {
        displayTitle = `${t} A101 ${badge}`;
    }

    if (badge === 'A101 Artı') {
        let datePrefix = '';
        if (dates.startDate && dates.endDate) {
            const startDay = dates.startDate.split('-')[2];
            const endDay = dates.endDate.split('-')[2];
            const mKey = dates.startDate.split('-')[1];
            const monthName = REVERSE_MONTH_MAP[mKey] || 'Eylül';
            datePrefix = `${startDay}-${endDay} ${monthName} `;
        }
        return {
            title: `${datePrefix}A101 Artı Fırsatları`.trim(),
            subtitle: 'A101 Plus Sadakat & Artı Para Nakit İade Kampanyaları'
        };
    }

    displayTitle = displayTitle.replace(/\s+/g, ' ').trim();
    const subtitle = `${t || dates.startDate} ${badge} Fırsatları & Kampanyalı Aktüel Ürün Kataloğu`.replace(/\s+/g, ' ').trim();

    return { title: displayTitle, subtitle };
}

/**
 * curl fallback yardımcı fonksiyonu (Node.js TLS/undici engellemelerini aşar)
 */
function fetchViaCurl(url, headers = {}) {
    try {
        const { execSync } = require('child_process');
        const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
        const headerArgs = Object.entries(headers)
            .map(([k, v]) => `-H "${k}: ${v}"`)
            .join(' ');
        const cmd = `${curlCmd} -s -L --compressed --max-time 15 ${headerArgs} "${url}"`;
        const stdout = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        if (stdout && stdout.trim().startsWith('{')) {
            return JSON.parse(stdout);
        }
    } catch (e) {
        // ignore
    }
    return null;
}

/**
 * A101 RIO API'sinden detay sayfalarını çeker (Güvenli Pacing ve Tarayıcı Başlıkları ile).
 */
async function fetchRioPosterDetail(itemId) {
    const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${itemId}?__culture=tr-TR`;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, {
                headers: BROWSER_HEADERS,
                signal: AbortSignal.timeout(15000)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.pages && data.pages.length > 0) return data;
            }
            console.log(`      ⚠️ A101 Detay [${itemId}] HTTP ${res.status} (Deneme ${attempt})`);
            await sleep(3500 * attempt);
        } catch (e) {
            console.log(`      ⚠️ A101 Detay hatası [${itemId}]: ${e.message}`);
            await sleep(3500 * attempt);
        }
    }
    return null;
}

/**
 * A101 RIO API'sinden aktif afiş listesini çeker (Güvenli Pacing ve Tarayıcı Başlıkları ile).
 */
async function fetchRioPosterList() {
    const url = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, {
                headers: BROWSER_HEADERS,
                signal: AbortSignal.timeout(15000)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.items && data.items.length > 0) return data;
            }
            console.log(`⚠️ A101 Liste HTTP ${res.status} (Deneme ${attempt})`);
            await sleep(3500 * attempt);
        } catch (e) {
            console.log(`⚠️ A101 Liste hatası (Deneme ${attempt}): ${e.message}`);
            await sleep(3500 * attempt);
        }
    }
    return null;
}

async function syncA101(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 A101 RESMİ AKTÜEL & YAPAY ZEKA SENKRONİZASYONU');
    console.log('======================================================');

    let updated = false;

    // 1. Resmi RIO API'den aktif afiş listesini çek
    console.log('🔍 A101 Resmi RIO API sorgulanıyor...');
    const listData = await fetchRioPosterList();
    if (!listData || !listData.items) {
        console.error('❌ A101 RIO API listeleme hatası: Afiş listesi alınamadı.');
        return false;
    }

    const items = listData?.items || [];
    console.log(`📋 ${items.length} adet aktif A101 kampanyası tespit edildi.`);

    for (const item of items) {
        await sleep(3500); // RIO API rate limit / WAF koruması
        const catalogId = `a101-rio-${item.id}`;
        const rawTitle = `${item.title || ''} ${item.seoTitle || ''}`.trim();
        const dates = parseTurkishDateRange(rawTitle);
        const badge = resolveA101Badge(item, rawTitle);
        const { title, subtitle } = buildA101Titles(item, badge, dates);

        console.log(`\n📌 Kampanya: "${title}" [Rozet: ${badge}] (ID: ${catalogId})`);

        // Akıllı Atlama Kontrolü
        const existingCat = currentData.catalogs.find(c => c.id === catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

        if (existingCat && existingCat.pages?.length > 0 && (existingProds.length >= existingCat.pages.length * 2 || existingCat.badge === 'A101 Artı') && !options.force) {
            console.log(`   ⏭️ Zaten taranmış ve mevcut (${existingCat.badge}, ${existingCat.pages.length} sayfa, ${existingProds.length} ürün). Metadata güncelleniyor.`);
            // Mevcut kataloğun rozet ve başlıklarını kusursuz hale getir
            if (existingCat.badge !== badge || existingCat.title !== title) {
                existingCat.badge = badge;
                existingCat.title = title;
                existingCat.subtitle = subtitle;
                updated = true;
            }
            continue;
        }

        // Detay API'sinden sayfaları al (Güvenli Pacing & Fallback korumalı)
        console.log(`   📥 Kampanya sayfaları çekiliyor...`);
        let detData = await fetchRioPosterDetail(item.id);

        // A101 Artı veya özel manuel kampanya fallback desteği
        if ((!detData || !detData.pages || detData.pages.length === 0) && (badge === 'A101 Artı' || item.sourceType === 'manual')) {
            console.log(`   ℹ️ [A101 Artı] Detay API CDN fallback devreye alınıyor (${ARTI_STATIC_FALLBACK.length} sayfa)...`);
            detData = {
                id: item.id,
                pages: ARTI_STATIC_FALLBACK.map(img => ({ image: img }))
            };
        }

        if (!detData || !detData.pages || detData.pages.length === 0) {
            if (existingCat && existingCat.pages && existingCat.pages.length > 0) {
                console.log(`   ℹ️ [${item.id}] Mevcut ${existingCat.pages.length} sayfalık afiş verisi korunuyor.`);
                continue;
            }
            console.error(`   ❌ Kampanya detay sayfaları alınamadı (${item.id})`);
            continue;
        }

        const rawPages = detData.pages || [];
        console.log(`   📄 Toplam ${rawPages.length} sayfa afiş bulundu.`);

        // Eski ürünleri temizle (yeniden işleme)
        currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
        currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

        const pages = [];

        // A101 Artı kataloğu ürün satış kataloğu değil, sadakat puanı/nakit iade (Artı Para) broşürüdür.
        // Sayfalarda gerçek ürün satış fiyatı bulunmaz, "15 Artı Para", "45 Artı Para" gibi hediye puanlar yer alır.
        // Fiyat karşılaştırma motorunun ve kullanıcıların yanılmaması için sahte ürünler üretilmez, afiş sayfaları tam olarak eklenir.
        if (badge === 'A101 Artı') {
            console.log(`   ℹ️ [A101 Artı] Sadakat ve nakit iade (Artı Para) kataloğu. Gerçek ürün satış fiyatı içermediği için sahte ürün fiyatları oluşturulmuyor, tüm ${rawPages.length} sayfa afiş ekleniyor.`);
            rawPages.forEach((pObj, idx) => {
                const originalUrl = pObj.image;
                const highResUrl = originalUrl.includes('_1024x1024.')
                    ? originalUrl.replace('_1024x1024.', '_3840x3840.')
                    : originalUrl;
                pages.push({
                    pageNumber: idx + 1,
                    imageUrl: highResUrl,
                    thumbnailUrl: originalUrl,
                    productIds: []
                });
            });

            currentData.catalogs.push({
                id: catalogId,
                marketId: 'a101',
                title: title,
                subtitle: subtitle,
                badge: badge,
                startDate: dates.startDate,
                endDate: dates.endDate,
                coverImageUrl: pages[0].imageUrl,
                pageCount: pages.length,
                status: 'ACTIVE',
                isFeatured: true,
                pages: pages
            });
            updated = true;
            console.log(`   ✅ [A101 Artı] Kataloğu başarıyla eklendi (${pages.length} afiş sayfası, 0 sahte ürün).`);
            continue;
        }

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

                // Güçlendirilmiş, Sıfır Hata ve Sıfır Atlama Yapay Zeka Vision Promptu
                const prompt = `Sen uzman bir süpermarket aktüel ürün analistisin. 
Bu görsel A101 resmi aktüel broşür sayfasıdır.
Bu sayfada yer alan TÜM ürünleri EKSİKSİZ, BİREBİR ve HATASIZ olarak tespit et.

ÖNEMLİ KURALLAR:
1. EKSİKSİZLİK (SIFIR ÜRÜN ATLAMA):
   - Sayfayı yukarıdan aşağıya, satır satır ve sütun sütun çok dikkatle tara.
   - Sayfadaki EN KÜÇÜK ÜRÜNÜ, MEŞRUBAT ŞİŞELERİNİ, KÜÇÜK ATIŞTIRMALIKLARI VE SOSLARI DAHİ ASLA ATLAMADAN ÇIKAR.
   - Yan yana duran ikili/üçlü ürünleri (örneğin ketçabın yanındaki mayonez, cips çeşitleri, su paketleri) tek tek ayrı ürünler olarak listele.
   - Bir ürün grubunun altında birden fazla şişe/paket varsa her birini bağımsız ürün olarak ekle. Genellikle bu tip broşür sayfalarında 15 ile 30 arasında ürün bulunur.

2. KESİN VE DOĞRU OCR (GRAMAJ VE FİYAT):
   - Ürünün adını ve üzerindeki/etiketindeki net gramaj/hacim bilgisini (g, KG, L, ml, 'li) TAHMİN ETMEDEN BİREBİR OKU (Örn: kova veya paket üzerinde 9 KG yazıyorsa kesinlikle 9 KG olarak yaz, asla 3 KG yazma).
   - FİYAT: Kırmızı/sarı indirim kutusundaki büyük puntolu güncel indirimli satış fiyatını TL cinsinden sayısal olarak al (örneğin 39.50 veya 475). Asla eski fiyatı, yüzde indirim oranını veya başka sayıyı fiyat olarak yazma.
   - Fiyatı net okunamayan veya fiyatı olmayan reklam/slogan kutularını dahil ETME. Fiyat daima 0'dan büyük bir sayı olmalıdır.
   - ⚠️ ARTI PARA VE SADAKAT PUANI UYARISI: "Artı Para", "Hediye Para", "Para İadesi" veya "Puan" (Örn: "15 Artı Para", "20 Artı Para", "45 Artı Para", "50 Artı Para") İFADELERİ KESİNLİKLE ÜRÜN SATIŞ FİYATI DEĞİLDİR! Bunlar A101 Plus sadakat uygulaması nakit iadeleridir. Eğer sayfada ürünün gerçek perakende TL satış fiyatı (örn: 199.50 TL) kırmızı/sarı fiyat etiketinde açıkça yazmıyorsa, sadece "Artı Para" vaat eden bu sayfalardan KESİNLİKLE ürün ve fiyat çıkarma! Bu tip sayfaları boş ("products": []) olarak geç.

3. KUTU KOORDİNATLARI (box_2d) - KRİTİK KURAL (FİZİKSEL ÜRÜN FOTOĞRAFI ZORUNLULUĞU):
   - box_2d koordinatını [ymin, xmin, ymax, xmax] (0-1000 normalize koordinat) olarak ver.
   - BU KOORDİNAT KESİNLİKLE VE ÖNCELİKLE ÜRÜNÜN FİZİKSEL FOTOĞRAFINI (cihazın ekranını/kasasını, televizyonun ekranını, telefonun/tabletin ekranını, deterjan/şampuan şişesini, gıda paketini, ayakkabıyı/giysiyi) KAPSAMALIDIR!
   - ASLA VE ASLA SADECE METİN KUTUSU, MODEL AÇIKLAMASI VEYA FİYAT ETİKETİNDEN İBARET BİR KUTULAMA YAPMA. Kullanıcı uygulamada ürünün fiziksel fotoğrafını görmek ister, sadece yazı/fiyat kutusunu değil!
   - Eğer ürün görseli ve açıklama metni/fiyat etiketi yan yana veya ayrı duruyorsa (örneğin televizyonlarda TV ekranı solda, model açıklaması ve fiyatı sağda ise): Kutuyu sol taraftaki TV ekranını da içine alacak şekilde geniş çiz veya doğrudan sadece TV cihazını kutula! Kutunun içinde MUTLAKA ürünün fiziksel görseli yer almalıdır.

JSON Formatı:
{
  "products": [
    {
      "name": "Ürün Adı ve Net Miktarı",
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
                await sleep(1500); // API kotasını koruma aralığı
            } catch (err) {
                console.error(`      ❌ Sayfa ${pageNum} işleme hatası:`, err.message);
            }
        }

        if (pages.length > 0) {
            currentData.catalogs.push({
                id: catalogId,
                marketId: 'a101',
                title: title,
                subtitle: subtitle,
                badge: badge,
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
