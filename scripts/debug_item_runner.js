const sleep = ms => new Promise(r => setTimeout(r, ms));

async function debugIds() {
    const ids = ['Mh6LZTkQmmuWjukh', 'FXd2cv08vphACPVJ', 'VqtTZGhtiFIwPAsM', 'klmXtkTT9Y92HGon'];
    for (const id of ids) {
        const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${id}?__culture=tr-TR&__platform=web`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'tr-TR,tr;q=0.9',
                'Referer': 'https://www.a101.com.tr/',
                'Origin': 'https://www.a101.com.tr'
            }
        });
        console.log(`\n=== ID: ${id} === Status: ${res.status}`);
        console.log('Via:', res.headers.get('via'));
        console.log('X-Bdcdn-Cache-Status:', res.headers.get('x-bdcdn-cache-status'));
        console.log('X-Request-Ip:', res.headers.get('x-request-ip'));
        const body = await res.text();
        console.log('Body:', body.slice(0, 150));
        await sleep(4000);
    }
}

debugIds().catch(console.error);
