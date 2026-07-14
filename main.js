const { chromium } = require('playwright');

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
  const acc = accounts[0];

  try {
    console.log('👉 ログイン中...');
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('👉 取出ファイル一覧画面へ直接移動...');
    const targetUrl = acc.url.replace('/login/', '/rec_export_histories');
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // 描画待ち

    console.log('📸 スクショ保存...');
    await page.screenshot({ path: 'check_view.png', fullPage: true });

    console.log('📝 画面上の全テーブル構造をログへ直接出力します...');
    
    // --- ここから追加ロジック ---
    // メインページおよびすべての iframe を含めて走査対象にする
    const allFrames = page.frames();
    console.log(`ℹ️ 検出されたフレーム総数: ${allFrames.length}`);

    for (let fIdx = 0; fIdx < allFrames.length; fIdx++) {
      const frame = allFrames[fIdx];
      const frameName = frame.name() || `index:${fIdx}`;
      const frameUrl = frame.url();
      
      console.log(`\n==================================================`);
      console.log(`🖼️ 【フレーム】 Name: ${frameName} | URL: ${frameUrl}`);
      console.log(`==================================================`);

      // 指定フレーム内のすべての <table> 要素を取得
      const tables = await frame.$$('table');
      console.log(`📊 検出されたテーブル数: ${tables.length}`);

      if (tables.length === 0) {
        console.log('（このフレーム内に table タグはありません）');
        continue;
      }

      for (let tIdx = 0; tIdx < tables.length; tIdx++) {
        console.log(`\n--- 📥 [テーブル番号: ${tIdx + 1}] ---`);
        
        // 行（tr）をすべて取得
        const rows = await tables[tIdx].$$('tr');
        if (rows.length === 0) {
          console.log('  (行が存在しません)');
          continue;
        }

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          // 行内の セル（th または td）をすべて取得
          const cells = await rows[rIdx].$$('th, td');
          let rowTextParts = [];

          for (let cIdx = 0; cIdx < cells.length; cIdx++) {
            const rawText = await cells[cIdx].innerText();
            // ログの視認性を上げるため、改行やトリムを処理
            const cleanText = rawText.replace(/\r?\n/g, ' ').trim() || '(空文字)';
            rowTextParts.push(`[列${cIdx + 1}: ${cleanText}]`);
          }

          // 「テーブル番号」「行番号」「列番号：テキスト内容」を一列に並べて出力
          console.log(`  [T${tIdx + 1}][行${rIdx + 1}] ${rowTextParts.join(' | ')}`);
        }
      }
    }
    // --- ここまで追加ロジック ---

    console.log(`\n============== 調査終了 ==============`);
  } catch (err) {
    console.log(`❌ エラー: ${err.message}`);
  } finally {
    await browser.close();
  }
})();
