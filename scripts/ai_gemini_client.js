/**
 * Gemini Vision Çoklu API Key Havuz İstemcisi
 * 
 * - Kullanıcının sağladığı 5 adet API anahtarını rasgele (random) seçerek yükü dağıtır.
 * - Kota limiti (429) veya hata durumunda diğer anahtarlara otomatik olarak (failover) geçer.
 * - Kesintisiz, hatasız ve yüksek hızlı analiz sağlar.
 */

const fs = require('fs');
const path = require('path');

// 1. Anahtarlar ortam değişkeninden (Secrets) veya .env dosyasından okunur
const DEFAULT_KEYS = [];

function getAllKeys() {
    const keys = new Set();

    // 1. Environment variable (GEMINI_API_KEYS: comma-separated)
    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
            if (!k.includes('FMTcoqy5')) keys.add(k);
        });
    }
    if (process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
            if (!k.includes('FMTcoqy5')) keys.add(k);
        });
    }

    // 2. Local .env file
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', '..', 'github_automation', '.env')
    ];
    for (const ep of envPaths) {
        if (fs.existsSync(ep)) {
            const lines = fs.readFileSync(ep, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('GEMINI_API_KEYS=')) {
                    trimmed.replace('GEMINI_API_KEYS=', '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
                        if (!k.includes('FMTcoqy5')) keys.add(k);
                    });
                } else if (trimmed.startsWith('GEMINI_API_KEY=')) {
                    trimmed.replace('GEMINI_API_KEY=', '').split(',').map(k => k.trim()).filter(Boolean).forEach(k => {
                        if (!k.includes('FMTcoqy5')) keys.add(k);
                    });
                }
            }
        }
    }

    // 3. Fallback to user's 5 official keys
    if (keys.size === 0) {
        DEFAULT_KEYS.forEach(k => keys.add(k));
    }

    return Array.from(keys);
}

const keyCooldowns = new Map(); // key -> cooldownUntil timestamp

function getAvailableRandomKey(allKeys) {
    const now = Date.now();
    const available = allKeys.filter(k => {
        const cd = keyCooldowns.get(k);
        return !cd || cd <= now;
    });

    // Eğer tüm anahtarlar soğumadaysa, en erken açılacak olanı al
    if (available.length === 0) {
        console.warn('⚠️ Tüm API anahtarları geçici soğuma modunda, rastgele biri deneniyor...');
        return allKeys[Math.floor(Math.random() * allKeys.length)];
    }

    // Rasgele seçim
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MODELS = [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash'
];

async function callGeminiVisionMultiKey(prompt, base64Image, options = {}) {
    const allKeys = getAllKeys();
    const maxRetries = options.maxRetries || Math.max(allKeys.length * 2, 6);
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const apiKey = getAvailableRandomKey(allKeys);
        const masked = apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
        const model = options.model || MODELS[(attempt - 1) % MODELS.length];

        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const r = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json"
                    }
                }),
                signal: AbortSignal.timeout(30000)
            });

            if (r.status === 429) {
                console.warn(`⏳ [Anahtar ${masked}] Kota doldu (429)! Diğer anahtara otomatik geçiliyor...`);
                keyCooldowns.set(apiKey, Date.now() + 30000); // 30 saniye soğuma
                await sleep(1000);
                continue;
            }

            if (!r.ok) {
                const errText = await r.text();
                console.warn(`⚠️ [Anahtar ${masked}] API Hatası (${r.status}): ${errText.slice(0, 100)}`);
                keyCooldowns.set(apiKey, Date.now() + 15000);
                await sleep(1000);
                continue;
            }

            const data = await r.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                console.warn(`⚠️ [Anahtar ${masked}] Boş yanıt döndü, başka anahtara geçiliyor...`);
                continue;
            }

            // Başarılı yanıt
            return JSON.parse(text);

        } catch (err) {
            lastError = err;
            console.warn(`❌ [Anahtar ${masked}] İstek hatası: ${err.message}. Başka anahtar deneniyor...`);
            keyCooldowns.set(apiKey, Date.now() + 15000);
            await sleep(1500);
        }
    }

    throw new Error(`Tüm API anahtarlarıyla yapılan denemeler başarısız oldu: ${lastError?.message}`);
}

module.exports = {
    getAllKeys,
    callGeminiVisionMultiKey
};
