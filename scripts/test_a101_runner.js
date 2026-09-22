const fs = require('fs');

async function checkMyIp() {
    try {
        const res = await fetch('https://ipinfo.io/json');
        const data = await res.json();
        console.log(`🌐 Runner IP: ${data.ip} | Org: ${data.org} | Region: ${data.region} (${data.country})`);
    } catch (e) {
        console.log('IP kontrol hatası:', e.message);
    }
}

async function testFetch(label, url, headers = {}) {
    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        console.log(`[${label}] Status: ${res.status} | Body (first 100 chars): ${text.slice(0, 100)}`);
        return res.status === 200;
    } catch (e) {
        console.log(`[${label}] Error: ${e.message}`);
        return false;
    }
}

async function run() {
    console.log('========================================');
    console.log('🔍 A101 BAĞLANTI & ERİŞİM TESTİ');
    console.log('========================================');
    await checkMyIp();

    const targetUrl = 'https://rio.a101.com.tr/dbmk89vnr/CALL/poster/list/default?__culture=tr-TR&__platform=web';

    console.log('\n--- 1. Node.js Varsayılan Fetch ---');
    await testFetch('Node fetch default', targetUrl, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    });

    console.log('\n--- 2. Node.js Tam Tarayıcı Başlıkları (TR Referer & Accept-Language) ---');
    await testFetch('Node fetch Full Browser', targetUrl, {
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
    });

    console.log('\n--- 3. Curl Testleri ---');
    const { execSync } = require('child_process');
    try {
        const curlRes1 = execSync(`curl -s -L -i "${targetUrl}" -H "User-Agent: Mozilla/5.0" -H "Accept: application/json"`, { encoding: 'utf8' });
        console.log('[Curl Standard] Header/Body:\n', curlRes1.slice(0, 300));
    } catch (e) {
        console.log('[Curl Standard] Error:', e.message);
    }

    try {
        const curlRes2 = execSync(`curl -s -L -i --http2 "${targetUrl}" -H "User-Agent: Mozilla/5.0" -H "Accept-Language: tr-TR,tr;q=0.9" -H "Origin: https://www.a101.com.tr" -H "Referer: https://www.a101.com.tr/"`, { encoding: 'utf8' });
        console.log('[Curl HTTP/2 + Browser Headers] Header/Body:\n', curlRes2.slice(0, 300));
    } catch (e) {
        console.log('[Curl HTTP/2] Error:', e.message);
    }
}

run();
