/**
 * ŞOK Aktüel Broşür, Fırsat & Ürün Çekici (ŞOK Scraper)
 * 
 * 1. ŞOK Market kurumsal web sitesinden Çarşamba ve Hafta Sonu afişlerini çeker.
 * 2. CepteŞok ve ŞOK Market online mağazasından kampanya ürünlerini izole fotoğraflarıyla çeker.
 * 
 * "Akıllı Atlama" (Skip Existing):
 * Mevcut haftanın Çarşamba ve Hafta Sonu katalogları veritabanında tamsa
 * web sayfalarını tekrar taramaz, doğrudan atlar.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function fetchHtml(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.text();
}

/**
 * ŞOK Resmi Web Sitesinden Güncel Kampanya ve Broşürleri Çeker.
 */
async function getSokBrochures(existingData = null) {
    console.log('🔍 ŞOK Resmi Fırsatlar Kontrol Ediliyor...');

    const catalogs = [];
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    const existingCatalogs = (existingData?.catalogs || []).filter(c => c.marketId === 'sok');
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'sok');

    // 1. Çarşamba Fırsatları
    try {
        const coverImg = 'https://kurumsal.sokmarket.com.tr/uploads/202303221113495303.jpg';

        const dayOfWeek = today.getDay();
        const diffToWed = (3 - dayOfWeek + 7) % 7;
        const wednesday = new Date(today);
        if (diffToWed !== 0) {
            wednesday.setDate(today.getDate() - ((dayOfWeek + 4) % 7));
        }
        const nextTue = new Date(wednesday);
        nextTue.setDate(wednesday.getDate() + 6);

        const startStr = wednesday.toISOString().split('T')[0];
        const endStr = nextTue.toISOString().split('T')[0];
        const startDay = wednesday.getDate();
        const endDay = nextTue.getDate();
        const monthName = monthNames[wednesday.getMonth()];

        const catalogId = `sok_carsamba_${startStr.replace(/-/g, '_')}`;
        const matchedExisting = existingCatalogs.find(c => c.id === catalogId || (c.startDate === startStr && c.title.includes('Çarşamba')));
        const existingProdCount = matchedExisting 
            ? existingProducts.filter(p => p.catalogId === matchedExisting.id).length 
            : 0;

        catalogs.push({
            id: matchedExisting ? matchedExisting.id : catalogId,
            marketId: 'sok',
            title: matchedExisting?.title || `${startDay} - ${endDay} ${monthName} ŞOK Fırsatları`,
            subtitle: matchedExisting?.subtitle || 'Çarşamba Başlayan Haftanın Fırsatları Kataloğu',
            badge: 'Aman Kaçırma!',
            startDate: startStr,
            endDate: endStr,
            coverImageUrl: coverImg,
            pdfUrl: 'https://kurumsal.sokmarket.com.tr/firsatlar/carsamba/',
            pageCount: 2,
            status: todayStr <= endStr ? 'ACTIVE' : 'EXPIRED',
            isFeatured: true,
            pages: [
                {
                    pageNumber: 1,
                    imageUrl: coverImg,
                    thumbnailUrl: coverImg,
                    productIds: []
                },
                {
                    pageNumber: 2,
                    imageUrl: 'https://kurumsal.sokmarket.com.tr/uploads/2026081412535734273.jpg',
                    thumbnailUrl: 'https://kurumsal.sokmarket.com.tr/uploads/2026081412535734273.jpg',
                    productIds: []
                }
            ],
            isAlreadyStored: !!(matchedExisting && existingProdCount >= 10),
            existingProdCount: existingProdCount
        });
    } catch (e) {
        console.warn('⚠️ ŞOK Çarşamba fırsatları uyarısı:', e.message);
    }

    // 2. Hafta Sonu Fırsatları
    try {
        const coverImg = 'https://kurumsal.sokmarket.com.tr/uploads/202303221114005332.jpg';

        const dayOfWeek = today.getDay();
        const diffToSat = (6 - dayOfWeek + 7) % 7;
        const saturday = new Date(today);
        if (diffToSat !== 0 && dayOfWeek < 6) {
            saturday.setDate(today.getDate() - (dayOfWeek + 1));
        }
        const nextTue = new Date(saturday);
        nextTue.setDate(saturday.getDate() + 3);

        const startStr = saturday.toISOString().split('T')[0];
        const endStr = nextTue.toISOString().split('T')[0];
        const startDay = saturday.getDate();
        const endDay = nextTue.getDate();
        const monthName = monthNames[saturday.getMonth()];

        const catalogId = `sok_haftasonu_${startStr.replace(/-/g, '_')}`;
        const matchedExisting = existingCatalogs.find(c => c.id === catalogId || (c.startDate === startStr && c.title.includes('Hafta Sonu')));
        const existingProdCount = matchedExisting 
            ? existingProducts.filter(p => p.catalogId === matchedExisting.id).length 
            : 0;

        catalogs.push({
            id: matchedExisting ? matchedExisting.id : catalogId,
            marketId: 'sok',
            title: matchedExisting?.title || `${startDay} - ${endDay} ${monthName} Hafta Sonu Fırsatları`,
            subtitle: matchedExisting?.subtitle || 'Cumartesi Başlayan ŞOK Hafta Sonu İndirimleri',
            badge: 'Hafta Sonu',
            startDate: startStr,
            endDate: endStr,
            coverImageUrl: coverImg,
            pdfUrl: 'https://kurumsal.sokmarket.com.tr/firsatlar/hafta-sonu/',
            pageCount: 1,
            status: todayStr <= endStr ? 'ACTIVE' : 'EXPIRED',
            isFeatured: false,
            pages: [
                {
                    pageNumber: 1,
                    imageUrl: coverImg,
                    thumbnailUrl: coverImg,
                    productIds: []
                }
            ],
            isAlreadyStored: !!(matchedExisting && existingProdCount >= 10),
            existingProdCount: existingProdCount
        });
    } catch (e) {
        console.warn('⚠️ ŞOK Hafta sonu fırsatları uyarısı:', e.message);
    }

    return catalogs;
}

/**
 * ŞOK online sayfalarından temiz izole ürünleri çeker.
 */
function parseSokProductsFromHtml(html, campaignLabel = '') {
    const cardBlocks = html.split('class="CProductCard-module_containerTop__').slice(1);
    const products = [];

    cardBlocks.forEach((block, idx) => {
        const imgMatch = block.match(/<img[^>]+src="([^"]+product-assets[^"]+)"/i);
        const titleMatch = block.match(/<h2[^>]*class="[^"]*CProductCard-module_title__[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
        const discPriceMatch = block.match(/data-testid="discountedPrice">([\s\S]*?)<\/span>/i);
        const origPriceMatch = block.match(/data-testid="price">([\s\S]*?)<\/span>/i);

        if (imgMatch && titleMatch) {
            const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            let img = imgMatch[1].replace(/width=\d+,height=\d+/, 'width=800,height=800');

            let price = null;
            let originalPrice = null;

            if (discPriceMatch) {
                const cleanD = discPriceMatch[1].replace(/<!--.*?-->/g, '').replace(/[^\d,]/g, '').replace(',', '.');
                price = parseFloat(cleanD) || null;
            }
            if (origPriceMatch) {
                const cleanO = origPriceMatch[1].replace(/<!--.*?-->/g, '').replace(/[^\d,]/g, '').replace(',', '.');
                const parsedO = parseFloat(cleanO) || null;
                if (parsedO && (!price || parsedO > price)) {
                    if (!price) price = parsedO;
                    else originalPrice = parsedO;
                }
            }

            if (rawTitle && price) {
                products.push({
                    name: rawTitle,
                    brand: rawTitle.split(' ')[0],
                    price: price,
                    originalPrice: originalPrice,
                    imageUrl: img,
                    campaign: campaignLabel
                });
            }
        }
    });

    return products;
}

/**
 * ŞOK kampanya sayfalarından ürünleri çeker (zaten kayıtlıysa doğrudan atlar).
 */
async function getSokProducts(catalogs = [], existingData = null) {
    const allExistingStored = catalogs.length > 0 && catalogs.every(c => c.isAlreadyStored);
    const existingProducts = (existingData?.products || []).filter(p => p.marketId === 'sok');

    if (allExistingStored) {
        console.log(`  ⏭️ [ŞOK] Güncel Çarşamba ve Hafta Sonu fırsatları zaten sistemde mevcut, tarama atlandı.`);
        catalogs.forEach(cat => {
            const prods = existingProducts.filter(p => p.catalogId === cat.id);
            if (cat.pages) {
                prods.forEach(p => {
                    const pageObj = cat.pages.find(pg => pg.pageNumber === p.pageNumber);
                    if (pageObj && !pageObj.productIds.includes(p.id)) {
                        pageObj.productIds.push(p.id);
                    }
                });
            }
        });
        return existingProducts;
    }

    console.log('  🌐 [ŞOK] Yeni/güncellenen kampanya ürünleri taranıyor (CepteŞok)...');
    const urls = [
        { label: 'Haftanın Fırsatları', url: 'https://www.sokmarket.com.tr/indirimli-urunler-cms-dp1' },
        { label: 'Kasa Arkası', url: 'https://www.sokmarket.com.tr/50-tl-ve-uzeri-indirimli-urunler-pgrp-11d42a6b-df28-4fe6-b1a3-7ad6b8d7f9a0' },
        { label: 'Win Fırsatları', url: 'https://www.sokmarket.com.tr/win-kazandiran-urunler-pgrp-f353cf31-f728-425e-a453-5774219a76b8' }
    ];

    const allProducts = [];
    const seenNames = new Set();

    const mainCatalog = catalogs.find(c => c.id.includes('carsamba')) || catalogs[0];
    const weekendCatalog = catalogs.find(c => c.id.includes('haftasonu'));

    for (const u of urls) {
        try {
            const html = await fetchHtml(u.url);
            const extracted = parseSokProductsFromHtml(html, u.label);

            extracted.forEach((item, idx) => {
                if (seenNames.has(item.name)) return;
                seenNames.add(item.name);

                let targetCatalog = mainCatalog;
                if (u.label === 'Kasa Arkası' && weekendCatalog) {
                    targetCatalog = weekendCatalog;
                }

                const catalogId = targetCatalog ? targetCatalog.id : 'sok_firsatlari';
                const pageCount = targetCatalog ? (targetCatalog.pages?.length || 1) : 1;
                const assignedPage = (idx % pageCount) + 1;

                const cleanIdName = item.name.toLowerCase().replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 30);
                const productId = `sok_p_${cleanIdName}_${idx + 1}`;

                const productObj = {
                    id: productId,
                    catalogId: catalogId,
                    marketId: 'sok',
                    pageNumber: assignedPage,
                    name: item.name,
                    brand: item.brand,
                    price: item.price,
                    originalPrice: item.originalPrice,
                    unit: 'Adet',
                    category: 'Süpermarket & Fırsat',
                    imageUrl: item.imageUrl,
                    startDate: targetCatalog ? targetCatalog.startDate : new Date().toISOString().split('T')[0],
                    endDate: targetCatalog ? targetCatalog.endDate : new Date(Date.now() + 6*86400000).toISOString().split('T')[0],
                    isPopular: idx < 3
                };

                allProducts.push(productObj);

                if (targetCatalog && targetCatalog.pages) {
                    const pageObj = targetCatalog.pages.find(p => p.pageNumber === assignedPage);
                    if (pageObj && !pageObj.productIds.includes(productId)) {
                        pageObj.productIds.push(productId);
                    }
                }
            });

            console.log(`  ✨ [ŞOK] "${u.label}": ${extracted.length} adet yeni ürün çekildi.`);
        } catch (e) {
            console.error(`  ❌ ŞOK [${u.label}] hatası:`, e.message);
        }
    }

    return allProducts;
}

/**
 * Hem broşürleri hem ürünleri çeken ŞOK fonksiyonu (Akıllı Atlama destekli).
 */
async function getSokData(existingData = null) {
    const catalogs = await getSokBrochures(existingData);
    const products = await getSokProducts(catalogs, existingData);
    return { catalogs, products };
}

module.exports = { getSokBrochures, getSokProducts, getSokData };
