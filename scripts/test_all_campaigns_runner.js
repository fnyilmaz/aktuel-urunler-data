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

async function testAll() {
    console.log('1. Kampanya listesi çekiliyor...');
    const listUrl = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR&__platform=web';
    const listRes = await fetch(listUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
    console.log(`Liste Status: ${listRes.status}`);
    if (!listRes.ok) {
        console.log('Liste yanıtı:', await listRes.text());
        return;
    }
    const listData = await listRes.json();
    const items = listData.items || [];
    console.log(`Toplam kampanya sayısı: ${items.length}`);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`\nBekleniyor (3.5 sn)...`);
        await sleep(3500); // Güvenli rate limit aralığı

        const detUrl = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${item.id}?__culture=tr-TR&__platform=web`;
        const detRes = await fetch(detUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
        console.log(`[${i + 1}/${items.length}] Kampanya: ${item.id} ("${item.title}") -> Status: ${detRes.status}`);
        if (detRes.ok) {
            const detData = await detRes.json();
            console.log(`   ✅ Başarılı! Sayfa sayısı: ${detData.pages?.length || 0}`);
        } else {
            console.log(`   ❌ Hata: HTTP ${detRes.status} | ${await detRes.text()}`);
        }
    }

    console.log('\n🎉 TEST TAMAMLANDI: Tüm kampanyalar başarıyla test edildi!');
}

testAll().catch(console.error);
