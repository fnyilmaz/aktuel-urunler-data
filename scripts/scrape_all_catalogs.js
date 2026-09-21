/**
 * Tüm Marketler Broşür & Ürün Senkronizasyon Motoru (AI Destekli)
 * 
 * Bu betik, GitHub Actions tarafından günde 2 kez çalıştırılır.
 * Gemini Vision AI vizyon motorunu ve akıllı kutu kırpma (Option A) sistemini devreye sokar.
 */

const { runAiSyncWorkflow } = require('./ai_sync_workflow');

async function main() {
    console.log('🚀 AI Destekli Market & Broşür Senkronizasyonu Başlatılıyor...');
    const hasChanges = await runAiSyncWorkflow();
    if (hasChanges) {
        console.log('🎉 Yeni veriler ve ürün görselleri başarıyla güncellendi!');
    } else {
        console.log('✨ Sistem zaten güncel, yeni veri tespit edilmedi.');
    }
}

main().catch(err => {
    console.error('Kritik Senkronizasyon Hatası:', err);
    process.exit(1);
});
