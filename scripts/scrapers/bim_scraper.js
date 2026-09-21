/**
 * BİM Aktüel Broşür, Afiş ve Ürün Çekici (BİM Scraper)
 * 
 * BİM resmi web sitesinden:
 * 1. Afişler (https://www.bim.com.tr/Categories/680/afisler.aspx)
 * 2. Tüm Aktüel Ürünler (https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx)
 * 
 * "Akıllı Atlama" (Skip Existing):
 * Zaten sistemde kayıtlı olan ve ürünleri eksiksiz bulunan afiş sekmelerine
 * gereksiz HTTP istekleri atmaz, doğrudan atlayarak işlemi saniyelere indirir.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

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
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
}

/**
 * Türkçe tarih metninden ISO formatlı tarihler üretir.
 */
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

/**
 * BİM Resmi Afişler Sayfasından tüm broşürleri çeker.
 */
async function getBimBrochures(existingData = null) {
    console.log('🔍 BİM Resmi Afişler Kontrol Ediliyor...');
    const html = await fetchHtml('https://www.bim.com.tr/Categories/680/afisler.aspx');

    const parts = html.split('<a class="subTabArea triangle">').slice(1);
    const brochures = [];

    const existingCatalogs = (existingData?.catalogs || []).filter(c => c.marketId === 'bim');
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'bim');
    const todayStr = new Date().toISOString().split('T')[0];

    parts.forEach((part, index) => {
        const titleMatch = part.match(/<span class="text">([\s\S]*?)<\/span>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : `BİM Kampanya ${index + 1}`;

        const imgRegex = /data-bigimg="([^"]+)"/gi;
        const pageUrls = [];
        let match;
        while ((match = imgRegex.exec(part)) !== null) {
            let img = match[1].trim();
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) {
                pageUrls.push(img);
            }
        }

        const fancyMatch = part.match(/<a[^>]+class="fancyboxImage"[^>]+href="([^"]+)"/i);
        if (fancyMatch) {
            let img = fancyMatch[1].trim();
            if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
            if (!pageUrls.includes(img)) {
                pageUrls.unshift(img);
            }
        }

        if (pageUrls.length > 0) {
            const { startDate, endDate } = parseTurkishDateRange(title);
            if (endDate < todayStr) {
                return; // Geçmiş afişleri atla
            }

            let status = 'ACTIVE';
            let badge = 'Aktüel';
            if (startDate > todayStr) {
                status = 'UPCOMING';
                badge = title.includes('Cuma') ? 'Cuma Başlıyor' : (title.includes('Salı') ? 'Salı Başlıyor' : 'Yakında');
            } else if (endDate < todayStr) {
                status = 'EXPIRED';
                badge = 'Süresi Doldu';
            } else {
                badge = title.includes('Cuma') ? 'Cuma Fırsatları' : (title.includes('Salı') ? 'Salı Fırsatları' : 'Fırsat Ürünleri');
            }

            const cleanSlug = normalizeTurkish(title).replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
            const catalogId = `bim_${cleanSlug}_${startDate.replace(/-/g, '_')}`;

            // Sistemde zaten var mı ve ürünleri tam mı kontrolü
            const matchedExisting = existingCatalogs.find(c => 
                c.id === catalogId || 
                (c.startDate === startDate && normalizeTurkish(c.title).includes(normalizeTurkish(title).split(' ')[0]))
            );

            const existingProdCount = matchedExisting 
                ? existingProducts.filter(p => p.catalogId === matchedExisting.id).length 
                : 0;

            const pages = pageUrls.map((url, pIdx) => {
                const thumbUrl = url.replace('/afisler/', '/afisler/k_');
                return {
                    pageNumber: pIdx + 1,
                    imageUrl: url,
                    thumbnailUrl: thumbUrl,
                    productIds: []
                };
            });

            brochures.push({
                id: matchedExisting ? matchedExisting.id : catalogId,
                marketId: 'bim',
                title: matchedExisting?.title || `${title} BİM Aktüel`,
                subtitle: matchedExisting?.subtitle || `${title} Haftanın Fırsatları ve İndirimli Ürün Kataloğu`,
                badge: badge,
                startDate: startDate,
                endDate: endDate,
                coverImageUrl: pageUrls[0],
                pageCount: pages.length,
                status: status,
                isFeatured: status === 'ACTIVE' || status === 'UPCOMING',
                pages: pages,
                isAlreadyStored: !!(matchedExisting && existingProdCount > 0),
                existingProdCount: existingProdCount
            });
        }
    });

    return brochures;
}

/**
 * BİM Aktüel Ürünler sayfasından ürünleri çeker (zaten kayıtlı olanları doğrudan atlar).
 */
async function getBimProducts(brochures = [], existingData = null) {
    const mainHtml = await fetchHtml('https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx');
    const tabRegex = /<a[^>]+href="\/categories\/100\/aktuel-urunler\.aspx\?Bim_AktuelTarihKey=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const tabs = [];
    let m;
    while ((m = tabRegex.exec(mainHtml)) !== null) {
        const title = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
        if (title && !tabs.some(t => t.key === m[1])) {
            tabs.push({ key: m[1], title, normTitle: normalizeTurkish(title) });
        }
    }

    const allProducts = [];
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'bim');
    const todayStr = new Date().toISOString().split('T')[0];

    for (const t of tabs) {
        const { startDate, endDate } = parseTurkishDateRange(t.title);

        // Süresi dolmuş geçmiş sekmeleri tamamen atla
        if (endDate < todayStr) {
            console.log(`  ⏭️ [BİM] "${t.title}" kataloğunun süresi dolmuş, tarama atlandı.`);
            continue;
        }

        // Broşür eşleştirmesi: Önce tam normalize başlık, sonra başlangıç tarihi
        let matchedCatalog = brochures.find(b => normalizeTurkish(b.title).includes(t.normTitle) || t.normTitle.includes(normalizeTurkish(b.title)));
        if (!matchedCatalog) {
            matchedCatalog = brochures.find(b => b.startDate === startDate);
        }

        // Zaten sistemde tam olarak var mı?
        if (matchedCatalog && matchedCatalog.isAlreadyStored) {
            console.log(`  ⏭️ [BİM] "${t.title}" kataloğu zaten mevcut (${matchedCatalog.existingProdCount} ürün), tarama atlandı.`);
            // Mevcut ürünleri koru
            const storedProds = existingProducts.filter(p => p.catalogId === matchedCatalog.id);
            allProducts.push(...storedProds);

            // Sayfaların productIds bağlantısını koru
            if (matchedCatalog.pages) {
                storedProds.forEach(p => {
                    const pageObj = matchedCatalog.pages.find(pg => pg.pageNumber === p.pageNumber);
                    if (pageObj && !pageObj.productIds.includes(p.id)) {
                        pageObj.productIds.push(p.id);
                    }
                });
            }
            continue;
        }

        // Yeni veya eksik katalog: Sayfayı tara
        console.log(`  🌐 [BİM] Yeni/eksik katalog taranıyor: "${t.title}"...`);
        try {
            const url = `https://www.bim.com.tr/Categories/100/aktuel-urunler.aspx?Bim_AktuelTarihKey=${t.key}`;
            const html = await fetchHtml(url);
            const blocks = html.split('<div class="inner">').slice(1);

            const catalogId = matchedCatalog ? matchedCatalog.id : `bim_${t.key}`;
            const pageCount = matchedCatalog ? (matchedCatalog.pages?.length || 1) : 1;
            const tabProducts = [];

            // Reklam olmayan geçerli ürünleri filtrele
            const validBlocks = [];
            blocks.forEach((b, idx) => {
                const imgMatch = b.match(/<img[^>]+src="([^"]+)"/i);
                const titleMatch = b.match(/<h2 class="title">([\s\S]*?)<\/h2>/i);
                const subTitleMatch = b.match(/<h2 class="subTitle">([\s\S]*?)<\/h2>/i);
                const gramajMatch = b.match(/<div class="gramajadet">([\s\S]*?)<\/div>/i);
                const idMatch = b.match(/data-id="(\d+)"/i);

                let price = null;
                const quantifyMatch = b.match(/<div class="text quantify">([\s\S]*?)<\/div>/i);
                const decMatch = b.match(/<span class="number">([\s\S]*?)<\/span>/i);
                if (quantifyMatch) {
                    const whole = quantifyMatch[1].replace(/[^\d]/g, '');
                    const dec = decMatch ? decMatch[1].replace(/[^\d]/g, '') : '00';
                    price = parseFloat(`${whole}.${dec}`);
                }

                if (imgMatch && titleMatch && price) {
                    validBlocks.push({ imgMatch, titleMatch, subTitleMatch, gramajMatch, idMatch, price });
                }
            });

            const itemsPerPage = Math.ceil(validBlocks.length / pageCount);

            validBlocks.forEach((vb, vIdx) => {
                let img = vb.imgMatch[1].trim();
                if (!img.startsWith('http')) img = 'https://cdn1.bim.com.tr' + img.replace(/^[.\/]+/, '/');
                const brand = vb.subTitleMatch ? vb.subTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
                const rawTitle = vb.titleMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
                const gramaj = vb.gramajMatch ? vb.gramajMatch[1].replace(/<[^>]+>/g, '').replace(/^[•\s]+/, '').trim() : '';
                const fullName = (brand ? `${brand} ` : '') + rawTitle + (gramaj ? ` ${gramaj}` : '');

                const rawId = vb.idMatch ? vb.idMatch[1] : `${t.key}_${vIdx + 1}`;
                const productId = `bim_p_${rawId}`;

                const assignedPage = pageCount > 1 ? Math.min(pageCount, Math.floor(vIdx / itemsPerPage) + 1) : 1;

                let inferredCategory = 'Gıda & Tüketim';
                const lowerFull = fullName.toLowerCase();
                if (lowerFull.includes('bilgisayar') || lowerFull.includes('laptop') || lowerFull.includes('oyuncu') || lowerFull.includes('kulaklık') || lowerFull.includes('televizyon') || lowerFull.includes('tv') || lowerFull.includes('telefon')) {
                    inferredCategory = 'Elektronik';
                } else if (lowerFull.includes('koltuk') || lowerFull.includes('masa') || lowerFull.includes('kitaplık') || lowerFull.includes('dolap') || lowerFull.includes('yatak') || lowerFull.includes('halı') || lowerFull.includes('yorgan') || lowerFull.includes('tava') || lowerFull.includes('tencere') || lowerFull.includes('bardak') || lowerFull.includes('fincan')) {
                    inferredCategory = 'Ev & Yaşam';
                }

                const productObj = {
                    id: productId,
                    catalogId: catalogId,
                    marketId: 'bim',
                    pageNumber: assignedPage,
                    name: fullName,
                    brand: brand || rawTitle.split(' ')[0],
                    price: vb.price,
                    originalPrice: null,
                    unit: gramaj || 'Adet',
                    category: inferredCategory,
                    imageUrl: img,
                    startDate: startDate,
                    endDate: endDate,
                    isPopular: vIdx < 2
                };

                tabProducts.push(productObj);

                if (matchedCatalog && matchedCatalog.pages) {
                    const pageObj = matchedCatalog.pages.find(p => p.pageNumber === assignedPage);
                    if (pageObj && !pageObj.productIds.includes(productId)) {
                        pageObj.productIds.push(productId);
                    }
                }
            });

            console.log(`  ✨ [BİM] "${t.title}": ${tabProducts.length} adet yeni ürün çekildi.`);
            allProducts.push(...tabProducts);
        } catch(err) {
            console.error(`  ❌ BİM Tab [${t.key}] hatası:`, err.message);
        }
    }

    return allProducts;
}

/**
 * Hem broşürleri hem ürünleri çeken BİM fonksiyonu (Akıllı Atlama destekli).
 */
async function getBimData(existingData = null) {
    const catalogs = await getBimBrochures(existingData);
    const products = await getBimProducts(catalogs, existingData);
    return { catalogs, products };
}

module.exports = { getBimBrochures, getBimProducts, getBimData, parseTurkishDateRange };
