async function debugArti() {
  const id = 'VqtTZGhtiFIwPAsM';
  const url = `https://rio.a101.com.tr/dbmk89vnr/CALL/poster/get/default/${id}?__culture=tr-TR`;
  
  const headersTests = [
    { name: 'Standard Browser', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'tr-TR,tr;q=0.9', 'Referer': 'https://www.a101.com.tr/afisler-arti' } },
    { name: 'Mobile App User-Agent', headers: { 'User-Agent': 'A101/3.4.1 (iPhone; iOS 17.5.1; Scale/3.00)', 'Accept': 'application/json' } },
    { name: 'X-Forwarded-For TR', headers: { 'User-Agent': 'Mozilla/5.0', 'X-Forwarded-For': '212.154.71.37', 'Accept-Language': 'tr-TR,tr;q=0.9' } },
    { name: 'With Cookie', headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': 'culture=tr-TR; __cf_bm=1', 'Referer': 'https://www.a101.com.tr/' } }
  ];

  for (const t of headersTests) {
    const res = await fetch(url, { headers: t.headers });
    console.log(`[${t.name}] Status: ${res.status}`);
    if (res.ok) {
      const d = await res.json();
      console.log(`   ✅ SUCCESS: ${d.pages?.length} pages`);
    }
  }
}
debugArti().catch(console.error);
