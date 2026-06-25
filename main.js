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

  // ダイアログが出たら自動で承諾（OK）する
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
    await page.waitForLoadState('networkidle').catch(() => {});

    // 2. 直接「募集管理（求人案件一覧）」URLへジャンプして予約ボタンを狙う
    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    console.log(`👉 【${acc.name}】募集管理画面へ直接移動します: ${recruitUrl}`);
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    // 画面が正しく開けたかスクショ
    await page.screenshot({ path: `${acc.name}_recruit_page.png`, fullPage: true });

    // 3. 画像に写っていた青い「ファイル取出予約」ボタンをクリック
    console.log(`👉 【${acc.name}】「ファイル取出予約」ボタンを探しています...`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約"), .btn:has-text("ファイル取出予約")').first();
    
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    console.log(`👉 【${acc.name}】「ファイル取出予約」ボタンをクリックして抽出を開始させます`);
    await exportBtn.click({ force: true });
    
    // 予約実行後の処理の合間として少し長めに待機
    await page.waitForTimeout(8000);

    // 4. 進捗を確認するため「取出ファイル一覧」URLへジャンプ
    const queueUrl = acc.url.replace('/login/', '/csv_export_queues');
    console.log(`👉 【${acc.name}】進捗を確認するためファイル一覧画面へ移動します: ${queueUrl}`);
    await page.goto(queueUrl, { waitUntil: 'networkidle' });

    // 5. ステータスが「完了」になるまでループ待機（約30分〜最大50分）
    console.log(`⏳ 【${acc.name}】CSVファイルの作成完了を待機中（※処理完了まで約30分かかります）...`);
    let isCompleted = false;
    const maxAttempts = 100; // 30秒 × 100回 ＝ 最大50分待機

    for (let i = 0; i < maxAttempts; i++) {
      // 「最新を表示する」ボタンがあればクリック、無ければページ再読み込み
      const refreshBtn = page.locator('button:has-text("最新を表示する"), a:has-text("最新を表示する"), input[value*="最新"], .btn:has-text("最新")').first();
      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();
      } else {
        await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      }
      await page.waitForTimeout(3000);

      // テーブルの1行目（最新のリクエスト）をチェック
      const firstRow = page.locator('table tr').nth(1);
      if (await firstRow.isVisible()) {
        const rowText = await firstRow.innerText();
        
        if (rowText.includes('完了')) {
          console.log(`✅ 【${acc.name}】ファイルの作成が「完了」しました！`);
          isCompleted = true;
          break;
        } else {
          const elapsedMinutes = Math.floor((i * 30) / 60);
          console.log(`⏳ 【${acc.name}】現在ステータス: 待機中/処理中...（約${elapsedMinutes}分経過）再確認します (${i + 1}/${maxAttempts})`);
        }
      }
      
      // 30秒待機
      await page.waitForTimeout(30000); 
    }

    if (!isCompleted) {
      throw new Error("50分待機しましたが、ファイルの作成が完了しませんでした。");
    }

    await page.screenshot({ path: `${acc.name}_queue_ready.png`, fullPage: true });

    // 6. 完了したCSVファイルのダウンロードを実行
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
