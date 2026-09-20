/**
 * A101 Aktüel Broşür, Afiş ve Ürün Çekici (A101 Scraper)
 * 
 * A101 RIO API servisleri üzerinden:
 * 1. Güncel afiş ve broşürleri (3840x3840 ultra yüksek çözünürlük)
 * 2. 'Aldın Aldın', 'Haftanın Yıldızları', '10 TL ve Üzeri', 'Tazenin Yıldızları'
 *    kampanyalarındaki tüm ürünleri izole fotoğraflarıyla (1024x1024) çeker.
 * 
 * "Akıllı Atlama" (Skip Existing):
 * Zaten sistemde kayıtlı olan ve ürünleri eksiksiz bulunan kampanyaların
 * 800+ ürünlük RIO sorgularını çalıştırmaz, doğrudan atlayarak süreyi kısaltır.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const MONTH_MAP = {
    'ocak': '01', 'subat': '02', 'şubat': '02', 'mart': '03',
    'nisan': '04', 'mayis': '05', 'mayıs': '05', 'haziran': '06',
    'temmuz': '07', 'agustos': '08', 'ağustos': '08', 'eylul': '09',
    'eylül': '09', 'ekim': '10', 'kasim': '11', 'kasım': '11', 'aralik': '12', 'aralık': '12'
};

const RIO_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Origin': 'https://www.a101.com.tr',
    'Referer': 'https://www.a101.com.tr/'
};

function parseTurkishDateRange(title, currentYear = new Date().getFullYear()) {
    const clean = title.toLowerCase().trim();
    let startDate = null;
    let endDate = null;

    const rangeMatch = clean.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([a-zçğıöşü]+)/i);
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

    const singleMatch = clean.match(/(\d{1,2})\s+([a-zçğıöşü]+)/i);
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
 * A101 RIO API üzerinden güncel afişleri kontrol eder.
 */
async function getA101Brochures(existingData = null) {
    console.log('🔍 A101 Resmi Afişler Kontrol Ediliyor (RIO API)...');
    const listUrl = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR&__platform=web';
    
    const res = await fetch(listUrl, { headers: RIO_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`A101 RIO list error: HTTP ${res.status}`);
    const listData = await res.json();
    const items = listData.items || [];

    const todayStr = new Date().toISOString().split('T')[0];
    const catalogs = [];

    const existingCatalogs = (existingData?.catalogs || []).filter(c => c.marketId === 'a101');
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'a101');

    for (const item of items) {
        try {
            const titleDate = item.title || 'A101 Aktüel';
            const seoTitle = item.seoTitle || '';
            const { startDate, endDate } = parseTurkishDateRange(titleDate);

            let badge = 'Aldın Aldın';
            if (titleDate.includes('-') || titleDate.includes('–')) {
                badge = 'Haftanın Yıldızları';
            }
            if (seoTitle.toLowerCase().includes('ekstra')) {
                badge = 'Aldın Aldın Ekstra';
            } else if (seoTitle.toLowerCase().includes('10 tl')) {
                badge = '10 TL ve Üzeri';
            } else if (seoTitle.toLowerCase().includes('tazenin')) {
                badge = 'Tazenin Yıldızları';
            }

            let status = 'ACTIVE';
            if (startDate > todayStr) {
                status = 'UPCOMING';
            } else if (endDate < todayStr) {
                status = 'EXPIRED';
            }

            const safeKey = `${titleDate}_${seoTitle}`.toLowerCase().replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 35);
            const catalogId = `a101_${safeKey}_${startDate.replace(/-/g, '_')}`;

            // Sistemde zaten var mı kontrolü
            const matchedExisting = existingCatalogs.find(c => 
                c.id === catalogId || 
                (c.startDate === startDate && (
                    c.title.toLowerCase().includes(titleDate.toLowerCase()) ||
                    (c.badge && c.badge.toLowerCase().includes(badge.toLowerCase())) ||
                    (badge && badge.toLowerCase().includes(c.badge?.toLowerCase()))
                ))
            );

            const existingProdCount = matchedExisting 
                ? existingProducts.filter(p => p.catalogId === matchedExisting.id).length 
                : 0;

            const isAlreadyStored = !!(matchedExisting && existingProdCount > 0);

            let pages = [];
            if (isAlreadyStored && matchedExisting.pages && matchedExisting.pages.length > 0) {
                // Zaten var, sayfa afişlerini tekrar çekmeye gerek yok
                pages = matchedExisting.pages;
            } else {
                // Yeni katalog, sayfalarını çek
                const detUrl = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${item.id}?__culture=tr-TR&__platform=web`;
                const detRes = await fetch(detUrl, { headers: RIO_HEADERS });
                if (detRes.ok) {
                    const detData = await detRes.json();
                    const pagesRaw = detData.pages || [];
                    pages = pagesRaw.map((p, pIdx) => {
                        let img = (p.image || '').replace(/_\d+x\d+\./, '_3840x3840.');
                        return {
                            pageNumber: pIdx + 1,
                            imageUrl: img,
                            thumbnailUrl: img.replace('_3840x3840.', '_1024x1024.'),
                            productIds: []
                        };
                    });
                }
            }

            if (pages.length === 0) continue;

            catalogs.push({
                id: matchedExisting ? matchedExisting.id : catalogId,
                marketId: 'a101',
                promotionCode: item.promotionId || null,
                title: matchedExisting?.title || `${titleDate} A101 ${seoTitle || badge}`,
                subtitle: matchedExisting?.subtitle || `${titleDate} Fırsatları & Kampanyalı Aktüel Ürün Kataloğu`,
                badge: badge,
                startDate: startDate,
                endDate: endDate,
                coverImageUrl: pages[0].imageUrl,
                pageCount: pages.length,
                status: status,
                isFeatured: status === 'ACTIVE' || status === 'UPCOMING',
                pages: pages,
                isAlreadyStored: isAlreadyStored,
                existingProdCount: existingProdCount
            });

        } catch (e) {
            console.error(`  ❌ A101 afiş detayı hatası (${item.id}):`, e.message);
        }
    }

    return catalogs;
}

/**
 * A101 RIO API Store search üzerinden kampanya ürünlerini çeker (zaten kayıtlı olanları doğrudan atlar).
 */
async function getA101Products(catalogs = [], existingData = null) {
    const promoCodes = [
        { code: 'Z110', label: 'Aldın Aldın' },
        { code: 'Z100', label: 'Haftanın Yıldızları' },
        { code: 'Z010', label: '10 TL ve Üzeri' },
        { code: 'ZP01', label: 'Tazenin Yıldızları' },
        { code: 'Z151', label: 'Aldın Aldın Ekstra' }
    ];

    const allProducts = [];
    const seenProductIds = new Set();
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'a101');

    for (const promo of promoCodes) {
        let matchedCatalog = catalogs.find(c => c.promotionCode === promo.code && (c.status === 'ACTIVE' || c.status === 'UPCOMING')) ||
                             catalogs.find(c => c.promotionCode === promo.code);
        if (!matchedCatalog) {
            matchedCatalog = catalogs.find(c => 
                (c.status === 'ACTIVE' || c.status === 'UPCOMING') &&
                (c.title.toLowerCase().includes(promo.label.toLowerCase()) || 
                 c.badge.toLowerCase().includes(promo.label.toLowerCase()))
            ) || catalogs.find(c => 
                c.title.toLowerCase().includes(promo.label.toLowerCase()) || 
                c.badge.toLowerCase().includes(promo.label.toLowerCase())
            ) || catalogs[0];
        }

        const todayStr = new Date().toISOString().split('T')[0];
        if (matchedCatalog && matchedCatalog.endDate < todayStr) {
            console.log(`  ⏭️ [A101] "${promo.label}" (${promo.code}) süresi dolmuş, tarama atlandı.`);
            continue;
        }

        // Zaten sistemde tam olarak var mı?
        const prodCountInMatched = matchedCatalog ? existingProducts.filter(p => p.catalogId === matchedCatalog.id).length : 0;
        if (matchedCatalog && (matchedCatalog.isAlreadyStored || prodCountInMatched > 0)) {
            console.log(`  ⏭️ [A101] "${promo.label}" (${promo.code}) kataloğu zaten mevcut (${prodCountInMatched} ürün), tarama atlandı.`);
            const storedProds = existingProducts.filter(p => p.catalogId === matchedCatalog.id);
            storedProds.forEach(p => {
                if (!seenProductIds.has(p.id)) {
                    seenProductIds.add(p.id);
                    allProducts.push(p);
                }
            });
            continue;
        }

        // Yeni veya eksik kampanya: RIO search API sorgusu yap
        console.log(`  🌐 [A101] Yeni/eksik kampanya taranıyor: "${promo.label}" (${promo.code})...`);
        const catalogId = matchedCatalog ? matchedCatalog.id : `a101_${promo.code.toLowerCase()}`;
        const pageCount = matchedCatalog ? (matchedCatalog.pages?.length || 1) : 1;
        const startDate = matchedCatalog ? matchedCatalog.startDate : new Date().toISOString().split('T')[0];
        const endDate = matchedCatalog ? matchedCatalog.endDate : new Date(Date.now() + 7*86400000).toISOString().split('T')[0];

        try {
            let from = 0;
            const limit = 100;
            let totalFetched = 0;
            let totalAvailable = 1;

            while (from < totalAvailable && from < 1000) {
                const payload = JSON.stringify({
                    channel: "SLOT",
                    filters: [{ field: "promotionCode", value: promo.code }],
                    from: from,
                    limit: limit
                });
                const b64 = Buffer.from(payload).toString('base64');
                const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/Store/search/VS032?v=3&__culture=tr-TR&__platform=web&data=${encodeURIComponent(b64)}&__isbase64=true`;

                const res = await fetch(url, { headers: RIO_HEADERS, signal: AbortSignal.timeout(10000) });
                if (!res.ok) break;
                const data = await res.json();

                totalAvailable = data.total || 0;
                const results = data.results || [];
                if (results.length === 0) break;

                results.forEach((item, idx) => {
                    const rawId = item.id;
                    const productId = `a101_p_${rawId}`;
                    if (seenProductIds.has(productId)) return;
                    seenProductIds.add(productId);

                    const attr = item.attributes || {};
                    const priceInfo = item.price || {};

                    const prodImgObj = (item.images || []).find(i => i.imageType === 'product') || (item.images || [])[0];
                    let imgUrl = prodImgObj ? prodImgObj.url : null;
                    if (imgUrl) {
                        imgUrl = imgUrl.replace(/_\d+x\d+\./, '_1024x1024.');
                    }

                    const discountedPrice = priceInfo.discounted ? (priceInfo.discounted / 100) : (priceInfo.normal ? priceInfo.normal / 100 : null);
                    const normalPrice = (priceInfo.normal && priceInfo.normal > (priceInfo.discounted || 0)) ? (priceInfo.normal / 100) : null;

                    if (attr.name && discountedPrice && imgUrl) {
                        const assignedPage = Math.min(pageCount, Math.floor(((totalFetched + idx) % (pageCount * 20)) / 20) + 1);

                        const productObj = {
                            id: productId,
                            catalogId: catalogId,
                            marketId: 'a101',
                            pageNumber: assignedPage,
                            name: attr.name.trim(),
                            brand: attr.brand ? attr.brand.trim() : attr.name.split(' ')[0],
                            price: discountedPrice,
                            originalPrice: normalPrice,
                            unit: attr.salesUnitOfMeasure || 'Adet',
                            category: item.categories?.[0]?.name || 'Gıda & Temel Tüketim',
                            imageUrl: imgUrl,
                            startDate: startDate,
                            endDate: endDate,
                            isPopular: (totalFetched + idx) < 3
                        };

                        allProducts.push(productObj);

                        if (matchedCatalog && matchedCatalog.pages) {
                            const pageObj = matchedCatalog.pages.find(p => p.pageNumber === assignedPage);
                            if (pageObj && !pageObj.productIds.includes(productId)) {
                                pageObj.productIds.push(productId);
                            }
                        }
                    }
                });

                totalFetched += results.length;
                from += limit;
            }

            console.log(`  ✨ [A101] "${promo.label}": ${totalFetched} adet yeni ürün çekildi.`);
        } catch (err) {
            console.error(`  ❌ A101 Promo [${promo.code}] hatası:`, err.message);
        }
    }

    return allProducts;
}

/**
 * Hem broşürleri hem ürünleri çeken A101 fonksiyonu (Akıllı Atlama destekli).
 */
async function getA101Data(existingData = null) {
    const catalogs = await getA101Brochures(existingData);
    const products = await getA101Products(catalogs, existingData);
    return { catalogs, products };
}

module.exports = { getA101Brochures, getA101Products, getA101Data, parseTurkishDateRange };
