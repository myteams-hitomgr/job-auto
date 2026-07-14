const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const accounts = [
  { 
    name: 'B', 
    url: 'https://kanri.hitomgr.jp/lwf3/login/', 
    id: process.env.HITOMGR_ID_U003, 
    password: process.env.HITOMGR_PASSWORD_PASSU003 
  }
];

(async () => {
  console.log('🔍 [調査開始] なぜ「読み込み中」から進まないのか原因を特定します...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const acc = accounts[0]; // 今回ループで止まっているBアカウントで検証します

  try {
    console.log('👉 ログインしています...');
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('👉 取出ファイル一覧画面（履歴画面）へ直接移動します...');
    const targetUrl = acc.url.replace('/login/', '/rec_export_histories');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // 画面が完全に描画されるまで少し長めに待ちます

    console.log('📸 現在の画面の状態を「目で見るため」にパシャリと撮影します...');
    await page.screenshot({ path: 'check_view.png', fullPage: true });

    console.log('📝 画面上にあるすべての「表（テーブル）」の文字を丸裸にします...');
    
    const tableDump = await page.evaluate(() => {
      const report = [];
      const allTables = document.querySelectorAll('table');
      
      report.push(`【検証結果】画面内に合計 [ ${allTables.length} 個 ] のテーブルが見つかりました。\n`);
      
      allTables.forEach((table, tIdx) => {
        report.push(`--------------------------------------------------`);
        report.push(` 🏢 テーブル No.${tIdx + 1} (外側の文字やClass: ${table.className || 'なし'})`);
        report.push(`--------------------------------------------------`);
        
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, rIdx) => {
          const cells = row.querySelectorAll('th, td');
          const cellTexts = Array.from(cells).map((c, cIdx) => `[列${cIdx + 1}: ${c.textContent?.trim() || '(空文字)'}]`);
          
          if (cellTexts.length > 0) {
            report.push(`  └ 行 ${rIdx + 1}: ${cellTexts.join(' | ')}`);
          }
        });
        report.push(`\n`);
      });
      
      return report.join('\n');
    });

    // テキストファイルに書き出し
    const logPath = path.join(__dirname, 'check_result.txt');
    fs.writeFileSync(logPath, tableDump, 'utf8');
    
    console.log(`\n============== 調査完了 ==============`);
    console.log(`📁 同じフォルダに以下のファイルが書き出されました。`);
    console.log(`  1. check_result.txt  <-- 表の何行目に何の文字がいるかの全データ`);
    console.log(`  2. check_view.png    <-- Playwrightが本当に開いている画面の証拠スクショ`);
    console.log(`======================================`);
    console.log(`「check_result.txt」の最初の方だけでもコピペして見せていただければ、次こそ確実に「これのせいです」と言えます。`);

  } catch (err) {
    console.log(`❌ 特定コードの実行中にエラーが発生しました: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
