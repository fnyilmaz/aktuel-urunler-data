async function debugPlatforms() {
    const id = 'Mh6LZTkQmmuWjukh';
    const platforms = ['web', 'ios', 'android'];
    for (const p of platforms) {
        const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${id}?__culture=tr-TR&__platform=${p}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': p === 'android' ? 'okhttp/4.9.2' : (p === 'ios' ? 'A101/3.4.1 (iPhone; iOS 17.5.1)' : 'Mozilla/5.0'),
                'Accept': 'application/json'
            }
        });
        console.log(`Platform [${p}] Status: ${res.status}`);
        const body = await res.text();
        console.log(`  Body: ${body.slice(0, 100)}`);
    }
}

debugPlatforms().catch(console.error);
