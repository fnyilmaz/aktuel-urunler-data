/**
 * ŞOK Resmi Aktüel Broşür & Yapay Zeka (Gemini Vision) Senkronizasyon Modülü
 * Kaynak: https://kurumsal.sokmarket.com.tr/ (ŞOK RESMİ KURUMSAL PORTALI)
 * 
 * Özellikler:
 * - Doğrudan resmi PDF kaynakları (/firsatlar/carsamba/ ve /firsatlar/hafta-sonu/) üzerinden çalışır.
 * - pdf-lib ile gerçek sayfa sayısını dinamik tespit eder.
 * - Afiş sayfalarını yüksek çözünürlüklü JPEG (1600px) olarak GitHub deposuna yükler.
 * - Ürün kırpmaları doğrudan bu hafif JPEG afişler üzerinden Weserv ile yapılır; böylece 504 Gateway Timeout önlenir ve tüm ürün resimleri anında açılır.
 * - Gemini Vision ile her sayfadaki ürünleri ve koordinat bazlı ürün görsellerini izole eder.
 */

const fs = require('fs');
const path = require('path');
const { callGeminiVisionMultiKey } = require('../ai_gemini_client');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const GITHUB_OWNER = 'fnyilmaz';
const GITHUB_REPO = 'aktuel-urunler-data';
const GITHUB_BRANCH = 'main';

function getGitHubToken() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', '..', 'github_automation', '.env')
    ];
    for (const ep of envPaths) {
        if (fs.existsSync(ep)) {
            const m = fs.readFileSync(ep, 'utf8').match(/GITHUB_TOKEN=([^\r\n]+)/);
            if (m) return m[1].trim();
        }
    }
    return null;
}

async function uploadPageImageToGitHub(pathInRepo, buffer) {
    const token = getGitHubToken();
    if (!token) return null;

    try {
        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AktuelUrunlerSync'
        };

        let sha = null;
        const check = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${pathInRepo}?ref=${GITHUB_BRANCH}`,
            { headers }
        );
        if (check.ok) {
            const d = await check.json();
            sha = d.sha;
        }

        const b64 = buffer.toString('base64');
        const putRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${pathInRepo}`,
            {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    message: `Upload page image: ${pathInRepo}`,
                    content: b64,
                    branch: GITHUB_BRANCH,
                    ...(sha ? { sha } : {})
                })
            }
        );

        if (putRes.ok) {
            return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${pathInRepo}`;
        } else {
            console.warn(`      ⚠️ GitHub afiş yükleme başarısız (${pathInRepo}):`, putRes.status);
        }
    } catch (e) {
        console.warn(`      ⚠️ GitHub görsel yükleme hatası:`, e.message);
    }
    return null;
}

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

        if (res.url && res.url.toLowerCase().endsWith('.pdf')) {
            return res.url;
        }

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

// Tanınmış markalar listesi (farklı markaların yanlış eşleşmesini engellemek için)
const MAJOR_BRANDS = [
    'ülker', 'eti', 'sütaş', 'pınar', 'içim', 'sek', 'orkid', 'kotex', 'sleepy',
    'fairy', 'finish', 'bingo', 'ariel', 'omo', 'persil', 'dove', 'nivea', 'pantene',
    'elidor', 'clear', 'colgate', 'signal', 'sensodyne', 'oral-b', 'balparmak',
    'nutella', 'torku', 'polonez', 'namet', 'cumhuriyet', 'şölen', 'nestle', 'mondelez',
    'şok', 'mis', 'piyale', 'deren', 'mintax', 'evyap', 'ebru', 'inci', 'vatan', 'bizim'
];

function normalizeTr(str) {
    return (str || '')
        .toLowerCase()
        .replace(/(\d+)[xX*](\d+)/g, '$1 $2')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/i̇/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function calcWordSimilarity(a, b) {
    const normA = normalizeTr(a);
    const normB = normalizeTr(b);
    const wordsA = new Set(normA.split(' ').filter(w => w.length > 1));
    const wordsB = new Set(normB.split(' ').filter(w => w.length > 1));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let matches = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) matches++;
    }
    return matches / Math.max(wordsA.size, wordsB.size);
}

function verifyBrandAndCompatibility(origName, origBrand, matchedName, score) {
    const normOrig = normalizeTr(origName);
    const normMatch = normalizeTr(matchedName);
    const normBrand = normalizeTr(origBrand);

    // Çapraz marka çakışmasını engelle (örn: Eti aranırken Ülker gelirse engelle)
    for (const b of MAJOR_BRANDS) {
        if (normBrand.includes(b) || normOrig.includes(b)) {
            for (const cb of MAJOR_BRANDS) {
                if (cb !== b && normMatch.includes(cb) && !normBrand.includes(cb) && !normOrig.includes(cb)) {
                    return false;
                }
            }
        }
    }

    if (normBrand && normBrand !== 'sok') {
        const brandTokens = normBrand.split(/\s+/).filter(t => t.length > 2);
        const hasBrandWord = brandTokens.some(t => normMatch.includes(t));
        if (!hasBrandWord && score < 0.60) {
            return false;
        }
    }

    return score >= 0.38;
}

async function searchSokOnlineProduct(prodName, brand) {
    try {
        const cleanName = prodName
            .replace(/\b(Çeşitleri|Çeşitli|Aroma)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        const queries = [];
        if (brand && brand !== 'ŞOK') {
            queries.push(`${brand} ${cleanName}`);
        }
        queries.push(cleanName);
        if (cleanName.includes('/')) {
            const firstPart = cleanName.split('/')[0].trim();
            queries.push(`${brand && brand !== 'ŞOK' ? brand + ' ' : ''}${firstPart}`);
        }
        const baseName = cleanName.replace(/\d+.*$/, '').trim();
        if (baseName.length > 3 && baseName !== cleanName) {
            queries.push(`${brand && brand !== 'ŞOK' ? brand + ' ' : ''}${baseName}`);
        }

        let allFound = [];
        for (const q of queries) {
            const url = `https://www.sokmarket.com.tr/arama?q=${encodeURIComponent(q)}`;
            try {
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'tr-TR,tr;q=0.9'
                    },
                    signal: AbortSignal.timeout(10000)
                });
                if (!res.ok) continue;
                const html = await res.text();
                const regexEscaped = /\\"name\\":\\"([^"\\]+)\\",(?:(?!\\"name\\").)*?\\"images\\":\[\{\\"host\\":\\"([^"\\]+)\\",\\"path\\":\\"([^"\\]+)\\"/g;
                let m;
                while ((m = regexEscaped.exec(html)) !== null) {
                    allFound.push({
                        name: m[1],
                        imageUrl: `${m[2]}/${m[3]}`
                    });
                }
                if (allFound.length > 0) break;
            } catch (err) {
                // Zaman aşımı durumunda sonraki sorguya geç
            }
        }

        if (allFound.length === 0) return null;

        let best = null;
        let maxScore = 0;
        for (const r of allFound) {
            const score = calcWordSimilarity(prodName, r.name);
            const valid = verifyBrandAndCompatibility(prodName, brand, r.name, score);
            if (valid && score > maxScore) {
                maxScore = score;
                best = r;
            }
        }

        if (best) {
            const cleanHostPath = best.imageUrl.replace(/^https?:\/\/images\.ceptesok\.com\//, '');
            return `https://images.ceptesok.com/cdn-cgi/image/width=600,height=600,fit=pad,quality=85,format=jpg/${cleanHostPath}`;
        }
        return null;
    } catch (e) {
        return null;
    }
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

        if (endDate < todayStr) {
            console.log(`   ⏭️ "${sec.title}" afişinin tarihi geçmiş (${startDate} - ${endDate} < ${todayStr}). Atlanıyor.`);
            continue;
        }

        const cleanFileName = pdfUrl.split('/').pop().replace(/\.[^.]+$/, '');
        const catalogId = `sok-resmi-${cleanFileName}`;

        // Akıllı Atlama Kontrolü (Smart Skip): Ürün görselleri de düzgünse atla
        const existingCat = currentData.catalogs.find(c => c.id === catalogId);
        const existingProds = currentData.products.filter(p => p.catalogId === catalogId);
        const hasGoodImages = existingProds.length >= 5 && existingProds.some(p => p.imageUrl && (p.imageUrl.includes('raw.githubusercontent.com') || p.imageUrl.includes('ceptesok.com')));

        if (existingCat && hasGoodImages && (existingCat.pageCount || 1) > 1 && !options.force) {
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

        // Eski kayıtları temizle
        currentData.products = currentData.products.filter(p => p.catalogId !== catalogId);
        currentData.catalogs = currentData.catalogs.filter(c => c.id !== catalogId);

        const cleanPdfUrl = pdfUrl.replace(/^https?:\/\//, '');
        const pages = [];
        let catalogTotalProds = 0;

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            const pageNum = pageIdx + 1;
            const fallbackImageUrl = `https://images.weserv.nl/?url=${cleanPdfUrl}&page=${pageIdx}&output=jpg&q=85`;
            const fallbackThumbUrl = `https://images.weserv.nl/?url=${cleanPdfUrl}&page=${pageIdx}&w=400&output=jpg&q=80`;

            console.log(`   ➡️ Sayfa ${pageNum}/${totalPages} işleniyor...`);

            let imgBuf = null;
            for (let retry = 1; retry <= 3; retry++) {
                try {
                    const imgRes = await fetch(fallbackImageUrl, {
                        headers: { 'User-Agent': USER_AGENT },
                        signal: AbortSignal.timeout(30000)
                    });
                    if (imgRes.ok) {
                        imgBuf = Buffer.from(await imgRes.arrayBuffer());
                        break;
                    }
                } catch (err) {
                    console.warn(`      ⏳ Sayfa ${pageNum} görsel indirme denemesi ${retry}/3: ${err.message}`);
                    await sleep(2000);
                }
            }

            if (!imgBuf) {
                console.warn(`   ⚠️ Sayfa ${pageNum} görseli indirilemedi.`);
                pages.push({
                    pageNumber: pageNum,
                    imageUrl: fallbackImageUrl,
                    thumbnailUrl: fallbackThumbUrl,
                    productIds: []
                });
                continue;
            }

            // 1600px genişliğinde yüksek kaliteli afiş JPEG'i üret
            const optPageBuf = await sharp(imgBuf)
                .resize({ width: 1600, withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer();
            const pageMeta = await sharp(optPageBuf).metadata();

            // Sayfa görselini GitHub'a yükle
            const repoPath = `images/sok/${cleanFileName}_p${pageNum}.jpg`;
            console.log(`      ☁️ Sayfa ${pageNum} görseli GitHub'a yükleniyor (${repoPath})...`);
            const uploadedUrl = await uploadPageImageToGitHub(repoPath, optPageBuf);
            const publicPageUrl = uploadedUrl || fallbackImageUrl;
            const publicThumbUrl = uploadedUrl || fallbackThumbUrl;

            // Gemini Vision için 1400px genişliğinde base64 hazırla
            const visionBuf = await sharp(optPageBuf)
                .resize({ width: 1400, withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
            const base64 = visionBuf.toString('base64');

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

            for (let pIdx = 0; pIdx < detectedProds.length; pIdx++) {
                const p = detectedProds[pIdx];
                if (!p.price || typeof p.price !== 'number' || p.price <= 0) continue;
                if (!p.name || p.name.trim().length < 2) continue;

                const prodId = `${catalogId}-p${pageNum}-${pIdx + 1}`;
                let img = null;

                // 1. Önce ŞOK online mağazasından (Cepte ŞOK) net stüdyo fotoğrafını ara
                try {
                    const onlineImg = await searchSokOnlineProduct(p.name, p.brand);
                    if (onlineImg) {
                        img = onlineImg;
                        console.log(`         ✨ [HD Stüdyo]: ${p.name}`);
                    }
                } catch (e) {
                    // Online arama hatasında kırpmaya geç
                }

                // 2. Online bulunamadıysa afiş üzerinden yüksek çözünürlüklü (w=600, q=85) kırp
                if (!img && p.box_2d && Array.isArray(p.box_2d)) {
                    let box = Array.isArray(p.box_2d[0]) ? p.box_2d[0] : p.box_2d;
                    if (box.length === 4) {
                        let [ymin, xmin, ymax, xmax] = box;
                        const left = Math.max(0, Math.round((xmin / 1000) * pageMeta.width));
                        const top = Math.max(0, Math.round((ymin / 1000) * pageMeta.height));
                        const width = Math.min(pageMeta.width - left, Math.round(((xmax - xmin) / 1000) * pageMeta.width));
                        const height = Math.min(pageMeta.height - top, Math.round(((ymax - ymin) / 1000) * pageMeta.height));

                        if (width > 20 && height > 20) {
                            const cleanSource = publicPageUrl.replace(/^https?:\/\//, '');
                            img = `https://images.weserv.nl/?url=${cleanSource}&crop=${width},${height},${left},${top}&w=600&output=jpg&q=85`;
                            console.log(`         ✂️ [HD Kırpma]: ${p.name}`);
                        }
                    }
                }

                if (!img) img = publicThumbUrl;

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
            }

            catalogTotalProds += pageProductIds.length;

            pages.push({
                pageNumber: pageNum,
                imageUrl: publicPageUrl,
                thumbnailUrl: publicThumbUrl,
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
                coverImageUrl: pages[0].imageUrl,
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
