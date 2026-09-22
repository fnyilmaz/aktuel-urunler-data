/**
 * ŞOK Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://kurumsal.sokmarket.com.tr/ (ŞOK RESMİ KURUMSAL PORTALI)
 * 
 * Özellikler:
 * - Doğrudan resmi PDF kaynakları (/firsatlar/carsamba/ ve /firsatlar/hafta-sonu/) üzerinden çalışır.
 * - pdf-lib ile gerçek sayfa sayısını dinamik tespit eder.
 * - Weserv CDN ile eğik mock-up yerine düz, 1928x2778 px kristal netliğinde afiş sayfaları üretir.
 * - Gemini Vision ile her sayfadaki ürünleri ve koordinat bazlı ürün görsellerini izole eder.
 */

const { callGeminiVisionMultiKey } = require('../ai_gemini_client');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SECTIONS = [
    {
        title: 'Haftanın Fırsatları',
        badge: 'Çarşamba Fırsatları',
        path: '/firsatlar/carsamba/'
    },
    {
        title: 'Hafta Sonu Fırsatları',
        badge: 'Hafta Sonu',
        path: '/firsatlar/hafta-sonu/'
    }
];

async function resolvePdfUrl(sectionPath) {
    const targetUrl = `https://kurumsal.sokmarket.com.tr${sectionPath}`;
    try {
        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(20000)
        });

        // Doğrudan PDF yönlendirmesi kontrolü
        if (res.url && res.url.toLowerCase().endsWith('.pdf')) {
            return res.url;
        }

        // HTML döndüyse içerisindeki .pdf linkini ara
        const html = await res.text();
        const pdfMatch = html.match(/\/uploads\/[^\s"'<>]+\.pdf/i) || html.match(/https?:\/\/[^\s"'<>]+\.pdf/i);
        if (pdfMatch) {
            let found = pdfMatch[0];
            if (!found.startsWith('http')) {
                found = `https://kurumsal.sokmarket.com.tr${found.startsWith('/') ? '' : '/'}${found}`;
            }
            return found;
        }
    } catch (e) {
        console.warn(`   ⚠️ ${sectionPath} bağlantısı çözümlenemedi:`, e.message);
    }
    return null;
}

async function syncSok(currentData, options = {}) {
    console.log('\n======================================================');
    console.log('🛒 ŞOK RESMİ AKTÜEL & YAPAY ZEKA SENKRONİZASYONU (PDF MOTORU)');
    console.log('======================================================');

    let updated = false;
    const todayStr = new Date().toISOString().split('T')[0];

    for (const sec of SECTIONS) {
        console.log(`\n🔍 ŞOK Bölümü Sorgulanıyor: ${sec.title} (${sec.path})...`);
        const pdfUrl = await resolvePdfUrl(sec.path);

        if (!pdfUrl) {
            console.log(`   ⚠️ ${sec.title} için geçerli PDF bağlantısı bulunamadı.`);
            continue;
        }

        console.log(`   🔗 Resmi PDF Bulundu: ${pdfUrl}`);

        // Tarih tespiti (/uploads/YYYYMMDD...)
        const fileMatch = pdfUrl.match(/\/uploads\/(\d{4})(\d{2})(\d{2})/);
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

        // Tarih kontrolü: Süresi geçmiş broşürleri atla
        if (endDate < todayStr) {
            console.log(`   ⏭️ "${sec.title}" afişinin tarihi geçmiş (${startDate} - ${endDate} < ${todayStr}). Atlanıyor.`);
            continue;
        }

        const cleanFileName = pdfUrl.split('/').pop().replace(/\.[^.]+$/, '');
        const catalogId = `sok-resmi-${cleanFileName}`;

        // Akıllı Atlama Kontrolü (Smart Skip): Sadece çok sayfalı ve tam taranmış olanları atla
        const existingCat = currentData.catalogs.find(c => c.id === catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === catalogId);

        if (existingCat && existingProds.length >= 5 && (existingCat.pageCount || 1) > 1 && !options.force) {
            console.log(`   ⏭️ "${sec.title}" afişi zaten taranmış (${existingCat.pageCount} sayfa, ${existingProds.length} ürün mevcut). Atlanıyor.`);
            continue;
        }

        console.log(`   📥 Resmi PDF indiriliyor ve sayfa analizi yapılıyor...`);
        let totalPages = 0;
        try {
            const pdfRes = await fetch(pdfUrl, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(30000)
            });
            if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status}`);
            const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
            const pdfDoc = await PDFDocument.load(pdfBuf);
            totalPages = pdfDoc.getPageCount();
            console.log(`   📄 PDF Başarıyla Okundu: Toplam ${totalPages} sayfa tespit edildi.`);
        } catch (e) {
            console.error(`   ❌ PDF okuma hatası:`, e.message);
            continue;
        }

        if (totalPages === 0) continue;

        // Bu kataloğa ait eski (veya yarım kalmış) ürünleri temizle
        currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
        currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

        const cleanPdfUrl = pdfUrl.replace(/^https?:\/\//, '');
        const pages = [];
        let catalogTotalProds = 0;

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            const pageNum = pageIdx + 1;
            const pageImageUrl = `https://images.weserv.nl/?url=${cleanPdfUrl}&page=${pageIdx}&output=jpg&q=85`;
            const pageThumbUrl = `https://images.weserv.nl/?url=${cleanPdfUrl}&page=${pageIdx}&w=400&output=jpg&q=80`;

            console.log(`   ➡️ Sayfa ${pageNum}/${totalPages} alınıyor ve taranıyor...`);

            let imgBuf = null;
            let meta = null;
            for (let retry = 1; retry <= 3; retry++) {
                try {
                    const imgRes = await fetch(pageImageUrl, {
                        headers: { 'User-Agent': USER_AGENT },
                        signal: AbortSignal.timeout(30000)
                    });
                    if (imgRes.ok) {
                        imgBuf = Buffer.from(await imgRes.arrayBuffer());
                        meta = await sharp(imgBuf).metadata();
                        break;
                    }
                } catch (err) {
                    console.warn(`      ⏳ Sayfa ${pageNum} görsel indirme denemesi ${retry}/3: ${err.message}`);
                    await sleep(2000);
                }
            }

            if (!imgBuf || !meta) {
                console.warn(`   ⚠️ Sayfa ${pageNum} görseli Weserv'den indirilemedi. Boş sayfa olarak ekleniyor.`);
                pages.push({
                    pageNumber: pageNum,
                    imageUrl: pageImageUrl,
                    thumbnailUrl: pageThumbUrl,
                    productIds: []
                });
                continue;
            }

            // Gemini Vision için görseli optimize et (1400px genişlik ile hızlı transfer ve sıfır timeout)
            let base64 = null;
            try {
                const visionBuf = await sharp(imgBuf)
                    .resize({ width: 1400, withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                base64 = visionBuf.toString('base64');
            } catch (err) {
                base64 = imgBuf.toString('base64');
            }

            const prompt = `Sen uzman bir süpermarket aktüel ürün analistisin. 
Bu görsel ŞOK resmi aktüel broşür sayfasıdır (Sayfa ${pageNum}/${totalPages}).
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

            console.log(`      🤖 Gemini Vision ile Sayfa ${pageNum} inceleniyor...`);
            let detectedProds = [];
            try {
                const visionRes = await callGeminiVisionMultiKey(prompt, base64);
                detectedProds = visionRes?.products || [];
                console.log(`      ✅ Gemini Vision: Sayfa ${pageNum}'de ${detectedProds.length} ürün tespit etti.`);
            } catch (vErr) {
                console.warn(`      ⚠️ Sayfa ${pageNum} Gemini Vision analiz hatası: ${vErr.message}`);
            }

            const pageProductIds = [];

            detectedProds.forEach((p, pIdx) => {
                if (!p.price || typeof p.price !== 'number' || p.price <= 0) return;
                if (!p.name || p.name.trim().length < 2) return;

                const prodId = `${catalogId}-p${pageNum}-${pIdx + 1}`;
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
                            img = `https://images.weserv.nl/?url=${cleanPdfUrl}&page=${pageIdx}&crop=${width},${height},${left},${top}&w=300&precrop&output=jpg`;
                        }
                    }
                }

                if (!img) img = pageImageUrl;

                currentData.products.push({
                    id: prodId,
                    catalogId: catalogId,
                    marketId: 'sok',
                    pageNumber: pageNum,
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

            catalogTotalProds += pageProductIds.length;

            pages.push({
                pageNumber: pageNum,
                imageUrl: pageImageUrl,
                thumbnailUrl: pageThumbUrl,
                productIds: pageProductIds
            });

            await sleep(1500);
        }

        if (pages.length > 0) {
            currentData.catalogs.push({
                id: catalogId,
                marketId: 'sok',
                title: `ŞOK ${sec.title}`,
                subtitle: `ŞOK ${sec.badge} Kataloğu`,
                badge: sec.badge,
                startDate: startDate,
                endDate: endDate,
                coverImageUrl: `https://images.weserv.nl/?url=${cleanPdfUrl}&page=0&output=jpg&q=85`,
                pageCount: pages.length,
                status: 'ACTIVE',
                isFeatured: true,
                pages: pages
            });

            console.log(`   🎉 ŞOK Kataloğu eklendi: ${sec.title} (${pages.length} sayfa, ${catalogTotalProds} ürün)`);
            updated = true;
        }
    }

    return updated;
}

module.exports = { syncSok };
