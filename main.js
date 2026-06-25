const { chromium } = require('playwright');

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
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`【${acc.name}】処理開始 - URL: ${acc.url}`);

  try {
    // ログイン画面へ移動
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 

    // 💡 ユーザーIDとパスワードの入力欄（隠し属性ではないもの）が表示されるまで待機
    await page.waitForSelector('input[type="text"], input[type="email"], input:not([type="hidden"])', { timeout: 15000 });

    // 💡 ユーザーID入力欄とパスワード入力欄をそれぞれ個別にピンポイント特定
    const idInput = page.locator('input[type="text"], input[type="email"], input[name*="login"], input[name*="id"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    // 値を流し込む
    await idInput.fill(acc.id);
    await passwordInput.fill(acc.password);

    // 青い「ログイン」ボタンをクリック
    const submitButton = page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first();
    await submitButton.click();

    // ログイン処理のための待機
    await page.waitForTimeout(7000);

    // 成功時のスクショを保存
    await page.screenshot({ path: `${acc.name}_success.png`, fullPage: true });
    console.log(`📸 【${acc.name}】ログイン成功！画面スクショを保存しました。`);

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
    console.log("処理中にエラーを検出しましたが、ファイル一覧を出力します。");
  }

  // ログ出力用コード
  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
