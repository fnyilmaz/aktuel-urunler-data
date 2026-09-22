const sleep = ms => new Promise(r => setTimeout(r, ms));

async function testWithPacing() {
    const ids = ['Mh6LZTkQmmuWjukh', 'FXd2cv08vphACPVJ', 'VqtTZGhtiFIwPAsM'];
    for (const id of ids) {
        console.log(`\nBekleniyor (4 sn)...`);
        await sleep(4000);
        const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${id}?__culture=tr-TR`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'tr-TR,tr;q=0.9',
                'Referer': 'https://www.a101.com.tr/'
            }
        });
        console.log(`[Paced] ${id} -> Status: ${res.status}`);
        if (res.ok) {
            const d = await res.json();
            console.log(`   ✅ Başarılı! Sayfa sayısı: ${d.pages?.length}`);
        } else {
            console.log(`   ❌ Hata: ${await res.text()}`);
        }
    }
}

testWithPacing().catch(console.error);
