const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const accounts = [
  { 
    name: 'A', 
    url: 'https://kanri.hitomgr.jp/72s3/login/', 
    id: process.env.HITOMGR_ID_M003, 
    password: process.env.HITOMGR_PASSWORD_PASSU003 
  }
];

(async () => {
  console.log('🔍 原因特定用のデバッグ処理を開始します...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  const acc = accounts[0]; // Aアカウントで検証

  try {
    console.log('👉 ログイン中...');
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('👉 取出ファイル一覧画面へ直接移動します...');
    const targetUrl = acc.url.replace('/login/', '/rec_export_histories');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log('🔄 「最新を表示する」ボタンを一回クリックしてみます...');
    const refreshBtn = page.locator('a:has-text("最新を表示する"), button:has-text("最新を表示する"), .btn:has-text("最新を表示する")').first();
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click({ force: true });
      await page.waitForTimeout(3000);
    } else {
      console.log('⚠️ 「最新を表示する」ボタンが画面上に見つかりません。 URL直打ち画面が違う可能性があります。');
    }

    console.log('📸 現在の画面のスクリーンショットを保存中...');
    await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });

    console.log('📝 画面上のすべてのテーブル要素のテキストを抽出中...');
    
    // 画面上の全テーブル構造とテキストを全取得
    const reportData = await page.evaluate(() => {
      const results = [];
      const tables = document.querySelectorAll('table');
      
      tables.forEach((table, tIdx) => {
        results.push(`=========================================`);
        results.push(`【テーブル番号: ${tIdx + 1}】`);
        results.push(`=========================================`);
        
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, rIdx) => {
          const cells = row.querySelectorAll('th, td');
          const cellTexts = Array.from(cells).map((c, cIdx) => `[列${cIdx + 1}: ${c.textContent?.trim() || '(空)'}]`);
          results.push(`  行 ${rIdx + 1}: ${cellTexts.join(' | ')}`);
        });
      });
      
      return {
        bodyText: document.body.innerText,
        tableLog: results.join('\n'),
        html: document.body.innerHTML
      };
    });

    // ログ書き出し
    const logPath = path.join(__dirname, 'debug_page_source.txt');
    const finalOutput = [
      `◆ 調査日時: ${new Date().toLocaleString()}`,
      `◆ 現在のURL: ${page.url()}`,
      `\n--- [画面上の全テキスト] ---`,
      reportData.bodyText,
      `\n--- [検出されたテーブル構造詳細] ---`,
      reportData.tableLog,
      `\n--- [HTMLソース (念のため最初の方だけ)] ---`,
      reportData.html.substring(0, 5000)
    ].join('\n');

    fs.writeFileSync(logPath, finalOutput, 'utf8');
    
    console.log(`\n✅ 調査完了しました！`);
    console.log(`📁 同じフォルダに以下のファイルができています。`);
    console.log(`  1. debug_page_source.txt  <-- テーブルの中身がどう見えているかのテキスト`);
    console.log(`  2. debug_screenshot.png    <-- Playwrightが実際に見ている画面の画像`);
    console.log(`\nこの「debug_page_source.txt」の中身をコピペするか、スクショを見せていただければ一撃で原因を潰せます。`);

  } catch (err) {
    console.log(`❌ デバッグ実行中にエラー: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
