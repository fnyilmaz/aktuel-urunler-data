const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function fetchWithRetry(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                return await res.json();
            }
            console.log(`      ⚠️ HTTP ${res.status} (Deneme ${attempt}) - 5 sn bekleniyor...`);
            await sleep(5000);
        } catch (e) {
            console.log(`      ⚠️ Hata (Deneme ${attempt}): ${e.message} - 5 sn bekleniyor...`);
            await sleep(5000);
        }
    }
    return null;
}

async function testAll() {
    console.log('1. Kampanya listesi çekiliyor...');
    const listUrl = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR&__platform=web';
    const listData = await fetchWithRetry(listUrl);
    if (!listData || !listData.items) {
        console.error('Liste alınamadı!');
        return;
    }
    const items = listData.items || [];
    console.log(`Toplam kampanya sayısı: ${items.length}`);

    let successCount = 0;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`\nBekleniyor (4 sn)...`);
        await sleep(4000);

        const detUrl = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${item.id}?__culture=tr-TR&__platform=web`;
        const detData = await fetchWithRetry(detUrl);
        if (detData && detData.pages) {
            console.log(`[${i + 1}/${items.length}] Kampanya: ${item.id} ("${item.title}") -> ✅ Başarılı! (${detData.pages.length} sayfa)`);
            successCount++;
        } else {
            console.log(`[${i + 1}/${items.length}] Kampanya: ${item.id} ("${item.title}") -> ❌ Başarısız.`);
        }
    }

    console.log(`\n🎉 SONUÇ: ${successCount} / ${items.length} kampanya başarıyla çekildi!`);
}

testAll().catch(console.error);
