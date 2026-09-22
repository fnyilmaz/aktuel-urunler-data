async function testNoPlatform() {
    const ids = ['Mh6LZTkQmmuWjukh', 'FXd2cv08vphACPVJ', 'VqtTZGhtiFIwPAsM'];
    for (const id of ids) {
        const url1 = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${id}?__culture=tr-TR`;
        const res1 = await fetch(url1, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        console.log(`[No platform] ${id} -> Status: ${res1.status}`);
        if (res1.ok) {
            const d = await res1.json();
            console.log(`   ✅ Sayfalar: ${d.pages?.length}`);
        }
    }
}

testNoPlatform().catch(console.error);
