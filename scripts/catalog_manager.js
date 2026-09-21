/**
 * Aktüel Ürünler - Veri ve Katalog Yönetim Aracı (Catalog Manager)
 * 
 * Bu araç, BİM, A101 ve ŞOK aktüel broşür & ürün verilerini doğrular,
 * yedekler ve GitHub üzerindeki canlı veri deposuna (fnyilmaz/aktuel-urunler-data)
 * anında yükler.
 * 
 * Kullanım:
 *   node scripts/catalog_manager.js status                 -> Mevcut verileri ve görsel sağlığını kontrol eder
 *   node scripts/catalog_manager.js validate               -> JSON şemasını ve ürün ilişkilerini doğrular
 *   node scripts/catalog_manager.js backup                 -> Mevcut verinin yedeğini 'backups/' klasörüne alır
 *   node scripts/catalog_manager.js publish [github_token] -> GitHub deposuna yükler ve canlıya alır
 *   node scripts/catalog_manager.js bump                   -> Veri sürüm numarasını 1 artırır ve tarihi günceller
 */

const fs = require('fs');
const path = require('path');

// Read .env if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    envLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...rest] = trimmed.split('=');
            if (key && rest.length > 0) {
                process.env[key.trim()] = rest.join('=').trim();
            }
        }
    });
}

const DATA_PATH = path.join(__dirname, '..', 'catalogs.json');
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'fnyilmaz';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aktuel-urunler-data';
const GITHUB_FILE_PATH = process.env.GITHUB_FILE_PATH || 'catalogs.json';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function readData(filePath = DATA_PATH) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Dosya bulunamadı: ${filePath}`);
        return null;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ JSON okuma hatası: ${filePath}`, err.message);
        return null;
    }
}

function writeData(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error(`❌ JSON yazma hatası: ${filePath}`, err.message);
        return false;
    }
}

function backupData() {
    const data = readData();
    if (!data) return false;
    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUPS_DIR, `catalogs_backup_v${data.version || 1}_${dateStr}.json`);
    writeData(backupFile, data);
    console.log(`💾 Veri yedeği başarıyla alındı: ${path.relative(process.cwd(), backupFile)}`);
    return true;
}

function bumpVersion() {
    const data = readData();
    if (!data) return false;
    data.version = (data.version || 1) + 1;
    data.lastUpdated = new Date().toISOString();
    writeData(DATA_PATH, data);
    console.log(`🔼 Sürüm yükseltildi: v${data.version} (${data.lastUpdated})`);
    return true;
}

function showStatus() {
    const data = readData();
    if (!data) return;

    console.log('\n======================================================');
    console.log('🛒 AKTÜEL ÜRÜNLER & MARKET KATALOĞU - VERİ DURUMU');
    console.log('======================================================');
    console.log(`📌 Veri Sürümü: v${data.version || 1}`);
    console.log(`🕒 Son Güncelleme: ${data.lastUpdated || 'Bilinmiyor'}`);
    console.log(`🏪 Toplam Market Sayısı: ${data.markets?.length || 0}`);
    console.log(`📚 Toplam Katalog Sayısı: ${data.catalogs?.length || 0}`);
    console.log(`🏷️ Toplam Ayrıştırılmış Ürün: ${data.products?.length || 0}`);
    console.log('------------------------------------------------------');
    
    console.log('\n[Marketler]:');
    (data.markets || []).forEach(m => {
        const catCount = (data.catalogs || []).filter(c => c.marketId === m.id).length;
        const prodCount = (data.products || []).filter(p => p.marketId === m.id).length;
        console.log(`  • ${m.name} (${m.id}): ${catCount} katalog, ${prodCount} ürün`);
    });

    console.log('\n[Kataloglar]:');
    (data.catalogs || []).forEach(c => {
        const prodCount = (data.products || []).filter(p => p.catalogId === c.id).length;
        console.log(`  • [${c.marketId.toUpperCase()}] ${c.title} (${c.status}) - ${c.pageCount} Sayfa, ${prodCount} Ürün [${c.startDate} / ${c.endDate}]`);
    });

    // Image health check (detect if any product thumbnail uses full brochure poster)
    const posterKeywords = ['uploads/afisler', '3840x3840', 'kurumsal.sokmarket.com.tr/uploads'];
    const faultyProducts = (data.products || []).filter(p => posterKeywords.some(kw => (p.imageUrl || '').includes(kw)));
    
    console.log('\n[Görsel Sağlığı Kontrolü]:');
    if (faultyProducts.length === 0) {
        console.log('  ✅ TÜM ürünler izole ve net ürün fotoğraflarına sahip! (Katalog afişi kullanılan ürün YOK)');
    } else {
        console.warn(`  ⚠️ UYARI: ${faultyProducts.length} adet üründe izole ürün fotoğrafı yerine katalog afişi tespit edildi:`);
        faultyProducts.forEach(fp => console.warn(`    - ${fp.id} (${fp.name})`));
    }
    console.log('======================================================\n');
}

function validateData() {
    const data = readData();
    if (!data) return false;

    console.log('\n🔍 Veri Bütünlüğü ve Şema Doğrulaması Yapılıyor...');
    let errors = 0;
    let warnings = 0;

    const KNOWN_MARKET_IDS = new Set(['bim', 'a101', 'sok', 'migros', 'carrefoursa']);
    const marketIds = new Set([
        ...KNOWN_MARKET_IDS,
        ...(data.markets || []).map(m => m.id)
    ]);
    const catalogIds = new Set((data.catalogs || []).map(c => c.id));
    const productIds = new Set();

    // 1. Check catalogs
    (data.catalogs || []).forEach(c => {
        if (!marketIds.has(c.marketId)) {
            console.error(`  ❌ HATA: Katalog '${c.id}' geçersiz marketId içeriyor: '${c.marketId}'`);
            errors++;
        }
        if (!c.coverImageUrl || !c.coverImageUrl.startsWith('http')) {
            console.warn(`  ⚠️ UYARI: Katalog '${c.id}' kapak görseli URL'i eksik veya hatalı.`);
            warnings++;
        }
        if (!c.pages || c.pages.length === 0) {
            console.warn(`  ⚠️ UYARI: Katalog '${c.id}' broşür sayfası içermiyor.`);
            warnings++;
        }
    });

    // 2. Check products
    (data.products || []).forEach(p => {
        if (productIds.has(p.id)) {
            console.error(`  ❌ HATA: Çiftleyen ürün ID tespit edildi: '${p.id}'`);
            errors++;
        }
        productIds.add(p.id);

        if (!marketIds.has(p.marketId)) {
            console.error(`  ❌ HATA: Ürün '${p.id}' geçersiz marketId içeriyor: '${p.marketId}'`);
            errors++;
        }
        if (!catalogIds.has(p.catalogId)) {
            console.error(`  ❌ HATA: Ürün '${p.id}' geçersiz catalogId içeriyor: '${p.catalogId}'`);
            errors++;
        }
        if (typeof p.price !== 'number' || p.price < 0) {
            console.error(`  ❌ HATA: Ürün '${p.id}' (${p.name}) geçersiz fiyata sahip: ${p.price}`);
            errors++;
        }
        if (!p.imageUrl || !p.imageUrl.startsWith('http')) {
            console.error(`  ❌ HATA: Ürün '${p.id}' görsel URL'i eksik veya geçersiz: '${p.imageUrl}'`);
            errors++;
        }
    });

    // 3. Check faulty poster images in products
    const posterKeywords = ['uploads/afisler', '3840x3840', 'kurumsal.sokmarket.com.tr/uploads'];
    const faulty = (data.products || []).filter(p => !p.imageUrl?.includes('crop=') && posterKeywords.some(kw => (p.imageUrl || '').includes(kw)));
    if (faulty.length > 0) {
        console.warn(`  ⚠️ UYARI: ${faulty.length} adet üründe izole fotoğraf yerine broşür afişi kullanılmış!`);
        warnings += faulty.length;
    }

    if (errors === 0) {
        console.log(`✅ Doğrulama Başarılı! 0 Hata, ${warnings} Uyarı.`);
        return true;
    } else {
        console.log(`❌ Doğrulama Başarısız! Toplam ${errors} hata tespit edildi.`);
        return false;
    }
}

async function publishToGitHub(tokenArg) {
    const token = tokenArg || process.env.GITHUB_TOKEN;
    const rawContent = fs.readFileSync(DATA_PATH, 'utf8');

    console.log('\n🚀 GitHub Canlı Veri Yayını (Publish)...');
    console.log(`Hedef Depo: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`);
    console.log(`Uzak Dosya: ${GITHUB_FILE_PATH} (Dal: ${GITHUB_BRANCH})`);

    if (!token) {
        console.log('\n⚠️ GitHub Token bulunamadı. Lütfen .env dosyasına GITHUB_TOKEN tanımlayın veya parametre olarak verin:');
        console.log('   node scripts/catalog_manager.js publish <GITHUB_TOKEN>\n');
        return;
    }

    try {
        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AktuelUrunlerManager'
        };

        // 1. Check if repo exists
        const repoCheckRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, { headers });
        if (repoCheckRes.status === 404) {
            console.log(`📦 '${GITHUB_REPO}' deposu henüz yok, otomatik oluşturuluyor...`);
            const createRepoRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: GITHUB_REPO,
                    description: 'Aktüel Ürünler ve Market Katalogları Canlı Veri Deposu',
                    private: false,
                    auto_init: true
                })
            });
            if (!createRepoRes.ok) {
                const errText = await createRepoRes.text();
                throw new Error(`Depo oluşturulamadı: ${errText}`);
            }
            console.log('✅ Depo başarıyla oluşturuldu!');
            await new Promise(r => setTimeout(r, 2000));
        }

        // 2. Obtain current file SHA
        let fileSha = null;
        const fileCheckRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`,
            { headers }
        );
        if (fileCheckRes.ok) {
            const fileData = await fileCheckRes.json();
            fileSha = fileData.sha;
        }

        // 3. Upload / Update
        const data = readData();
        const base64Content = Buffer.from(rawContent, 'utf8').toString('base64');
        const updatePayload = {
            message: `Katalog ve ürün verileri güncellendi (v${data?.version || 1})`,
            content: base64Content,
            branch: GITHUB_BRANCH
        };
        if (fileSha) {
            updatePayload.sha = fileSha;
        }

        const putRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`,
            {
                method: 'PUT',
                headers,
                body: JSON.stringify(updatePayload)
            }
        );

        if (putRes.ok) {
            console.log('🎉 TEBRİKLER! Veriler GitHub deposuna başarıyla yüklendi ve yayınlandı!');
            console.log(`Canlı Veri URL: https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}\n`);
        } else {
            const errJson = await putRes.json();
            console.error('❌ Yükleme sırasında hata:', errJson);
        }
    } catch (err) {
        console.error('❌ GitHub API Hatası:', err.message);
    }
}

// CLI Arg handler
function purgeExpired() {
    const data = readData();
    if (!data) return false;

    const todayStr = new Date().toISOString().split('T')[0];
    const initialCats = (data.catalogs || []).length;
    const initialProds = (data.products || []).length;

    data.catalogs = (data.catalogs || []).filter(c => !c.endDate || c.endDate >= todayStr);
    const activeIds = new Set(data.catalogs.map(c => c.id));
    data.products = (data.products || []).filter(p => activeIds.has(p.catalogId));

    (data.markets || []).forEach(m => {
        m.catalogCount = data.catalogs.filter(c => c.marketId === m.id).length;
    });

    const diffCats = initialCats - data.catalogs.length;
    const diffProds = initialProds - data.products.length;

    if (diffCats > 0 || diffProds > 0) {
        data.version = (data.version || 1) + 1;
        data.lastUpdated = new Date().toISOString();
        writeData(DATA_PATH, data);
        console.log(`🧹 Süresi dolmuş ${diffCats} katalog ve ${diffProds} ürün başarıyla temizlendi.`);
        console.log(`📌 Yeni sürüm: v${data.version}`);
    } else {
        console.log('✨ Süresi geçmiş katalog bulunamadı, tüm veriler güncel.');
    }
    return true;
}

if (require.main === module) {
    const command = process.argv[2] || 'status';
    const tokenArg = process.argv[3];

    switch (command) {
        case 'status':
            showStatus();
            break;
        case 'validate':
            validateData();
            break;
        case 'backup':
            backupData();
            break;
        case 'bump':
            bumpVersion();
            break;
        case 'purge':
            purgeExpired();
            break;
        case 'publish':
            publishToGitHub(tokenArg);
            break;
        default:
            console.log(`Bilinmeyen komut: ${command}`);
            console.log("Kullanılabilir komutlar: 'status', 'validate', 'backup', 'bump', 'purge', 'publish [token]'");
    }
}

module.exports = { readData, writeData, backupData, bumpVersion, validateData, publishToGitHub };
