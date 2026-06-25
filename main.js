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

  // 予約時などの確認ダイアログ（ポップアップ）が出た場合に自動で「OK」を押す設定
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
    const recruitMenuLocator = page.locator('a:has-text("募集管理"), div:has-text("募集管理"), button:has-text("募集管理")').first();
    await recruitMenuLocator.waitFor({ state: 'visible', timeout: 30000 });
    
    // ログイン直後のスクショ
    await page.screenshot({ path: `${acc.name}_login_success.png`, fullPage: true });
    
    // 募集管理をクリックし、完全にページ遷移（ネットワーク通信が落ち着くまで）を待つ
    console.log(`👉 【${acc.name}】「募集管理」をクリックして画面遷移します`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
      recruitMenuLocator.click({ force: true })
    ]);

    // 3. 募集管理画面のロードを待つ
    console.log(`👉 【${acc.name}】募集管理画面のコンテンツロードを待機中...`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約"), .btn:has-text("ファイル取出予約")').first();
    
    // ボタン要素が画面上にしっかりと現れるまで待機
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });

    // 募集管理画面のスクショ（ここにボタンが綺麗に映るはずです）
    await page.screenshot({ path: `${acc.name}_recruit_page.png`, fullPage: true });

    // 4. 「ファイル取出予約」ボタンをクリック
    console.log(`👉 【${acc.name}】「ファイル取出予約」をクリックします`);
    await exportBtn.click({ force: true });
    await page.waitForTimeout(5000); // 予約処理が走るのを少し待つ

    // 5. 取出ファイル一覧画面へ直接移動
    const queueUrl = acc.url.replace('/login/', '/csv_export_queues');
    console.log(`👉 【${acc.name}】ファイル一覧画面へ移動します: ${queueUrl}`);
    await page.goto(queueUrl, { waitUntil: 'networkidle' });

    // 6. ステータスが「完了」になるまで「最新を表示する」を押しつつループ待機
    console.log(`⏳ 【${acc.name}】CSVファイルの作成完了を待機中（最大5分）...`);
    let isCompleted = false;
    const maxAttempts = 20; // 15秒×20回 = 最大5分

    for (let i = 0; i < maxAttempts; i++) {
      // 最新を表示するボタンがあればクリックして画面更新
      const refreshBtn = page.locator('button:has-text("最新を表示する"), a:has-text("最新を表示する"), input[value*="最新"]').first();
      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();
        await page.waitForTimeout(3000);
      }

      // テーブルの1行目（最新のデータ行）のテキストを確認
      const firstRow = page.locator('table tr').nth(1);
      if (await firstRow.isVisible()) {
        const rowText = await firstRow.innerText();
        
        if (rowText.includes('完了')) {
          console.log(`✅ 【${acc.name}】ファイルの作成が「完了」しました！`);
          isCompleted = true;
          break;
        } else {
          console.log(`⏳ 【${acc.name}】現在ステータス: 待機中/処理中... 再確認します (${i + 1}/${maxAttempts})`);
        }
      }
      
      await page.waitForTimeout(15000); // 15秒待ってリトライ
    }

    if (!isCompleted) {
      throw new Error("ファイルの作成がタイムアウト、または完了しませんでした。");
    }

    // 最終準備完了状態のスクショ
    await page.screenshot({ path: `${acc.name}_queue_ready.png`, fullPage: true });

    // 7. CSVファイルのダウンロードを実行
    console.log(`📥 【${acc.name}】CSVファイルのダウンロードを開始します...`);
    const downloadLink = page.locator('table tr').nth(1).locator('a[href*=".csv"]').first();
    
    // ダウンロードイベントをリッスンしながらクリック
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadLink.click()
    ]);

    // リポジトリ直下に保存
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
    console.log("処理終了（エラー検知、または正常完了後のファイル一覧出力）");
  }

  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
