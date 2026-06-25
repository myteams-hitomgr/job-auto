const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const accounts = [
  { 
    name: 'A', 
    url: 'https://kanri.hitomgr.jp/72s3/login/', 
    id: process.env.HITOMGR_ID_M003, 
    password: process.env.HITOMGR_PASSWORD_PASSU003 
  },
  { 
    name: 'B', 
    url: 'https://kanri.hitomgr.jp/lwf3/login/', 
    id: process.env.HITOMGR_ID_U003, 
    password: process.env.HITOMGR_PASSWORD_PASSU003 
  }
];

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log(`💬 【${acc.name}】ダイアログを検出: ${dialog.message()}`);
    await dialog.accept();
  });

  console.log(`【${acc.name}】処理開始 - URL: ${acc.url}`);

  try {
    // 1. ログイン画面へ移動
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 

    await page.waitForSelector('input[type="text"], input[type="email"], input:not([type="hidden"])', { timeout: 15000 });
    const idInput = page.locator('input[type="text"], input[type="email"], input[name*="login"], input[name*="id"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    await idInput.fill(acc.id);
    await passwordInput.fill(acc.password);

    const submitButton = page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first();
    await submitButton.click();

    console.log(`【${acc.name}】ログインボタンをクリックしました。`);

    // 2. ログイン後のトップページで「募集管理」をクリック
    const recruitMenuLocator = page.locator('a:has-text("募集管理"), div:has-text("募集管理"), button:has-text("募集管理"), [class*="menu"] :has-text("募集管理")').first();
    await recruitMenuLocator.waitFor({ state: 'visible', timeout: 30000 });
    
    await page.screenshot({ path: `${acc.name}_login_success.png`, fullPage: true });
    
    console.log(`👉 【${acc.name}】「募集管理」をクリックします`);
    await recruitMenuLocator.click({ force: true });

    // 画面遷移のための確実なディレイとロード待ち
    await page.waitForTimeout(7000); 
    await page.waitForLoadState('networkidle').catch(() => {});

    // 3. 募集管理画面のロード判定
    console.log(`👉 【${acc.name}】募集管理画面のコンテンツロードを待機中...`);
    
    const exportBtn = page.locator([
      'a:has-text("ファイル取出")',
      'button:has-text("ファイル取出")',
      'a:has-text("ファイル抽出")',
      'button:has-text("ファイル抽出")',
      'a:has-text("データ出力")',
      'button:has-text("データ出力")',
      '.btn:has-text("ファイル")'
    ].join(', ')).first();
    
    await exportBtn.waitFor({ state: 'attached', timeout: 30000 });

    await page.screenshot({ path: `${acc.name}_recruit_page.png`, fullPage: true });

    // 4. ボタンをクリック
    console.log(`👉 【${acc.name}】取出予約ボタンをクリックします`);
    await exportBtn.click({ force: true });
    await page.waitForTimeout(5000);

    // 5. 取出ファイル一覧画面へ直接移動
    const queueUrl = acc.url.replace('/login/', '/csv_export_queues');
    console.log(`👉 【${acc.name}】ファイル一覧画面へ移動します: ${queueUrl}`);
    await page.goto(queueUrl, { waitUntil: 'networkidle' });

    // 6. ステータスが「完了」になるまでループ待機（★30分以上の長期戦に対応）
    console.log(`⏳ 【${acc.name}】CSVファイルの作成完了を待機中（※約30分〜最大50分待ちます）...`);
    let isCompleted = false;
    const maxAttempts = 100; // 30秒 × 100回 ＝ 最大50分待機

    for (let i = 0; i < maxAttempts; i++) {
      const refreshBtn = page.locator('button:has-text("最新を表示する"), a:has-text("最新を表示する"), input[value*="最新"], .btn:has-text("最新")').first();
      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();
        await page.waitForTimeout(3000);
      }

      const firstRow = page.locator('table tr').nth(1);
      if (await firstRow.isVisible()) {
        const rowText = await firstRow.innerText();
        
        if (rowText.includes('完了')) {
          console.log(`✅ 【${acc.name}】ファイルの作成が「完了」しました！`);
          isCompleted = true;
          break;
        } else {
          // 30分かかるため、ログが埋まらないよう経過分数（目安）を出力
          const elapsedMinutes = Math.floor((i * 30) / 60);
          console.log(`⏳ 【${acc.name}】現在ステータス: 待機中/処理中...（約${elapsedMinutes}分経過）再確認します (${i + 1}/${maxAttempts})`);
        }
      }
      
      // サーバーに負荷をかけすぎないよう、チェック間隔を30秒に延長
      await page.waitForTimeout(30000); 
    }

    if (!isCompleted) {
      throw new Error("50分待機しましたが、ファイルの作成が完了しませんでした。");
    }

    await page.screenshot({ path: `${acc.name}_queue_ready.png`, fullPage: true });

    // 7. CSVファイルのダウンロードを実行
    console.log(`📥 【${acc.name}】CSVファイルのダウンロードを開始します...`);
    const downloadLink = page.locator('table tr').nth(1).locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
    
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadLink.click()
    ]);

    const downloadPath = path.join(__dirname, `${acc.name}_recruit_data.csv`);
    await download.saveAs(downloadPath);
    console.log(`🎉 【${acc.name}】CSVファイルを正常に保存しました: ${downloadPath}`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】エラーが発生しました: ${error.message}`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();

  try {
    await Promise.all(accounts.map(acc => runLoginAndProcess(browser, acc)));
  } catch (e) {
    console.log("処理終了（成否に関わらずファイル状態を出力します）");
  }

  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
