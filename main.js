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

    // 💡 【大修正】ログイン用の iframe 自体が出現するまで最大10秒待ちます
    const frameElement = await page.waitForSelector('iframe', { timeout: 10000 });
    const loginFrame = await frameElement.contentFrame();

    if (!loginFrame) {
      throw new Error("ログイン枠（iframe）の読み込みに失敗しました。");
    }

    // 💡 枠の中の入力欄（input）が表示されるまで少し待機
    await loginFrame.waitForSelector('input', { timeout: 5000 });
    const inputs = loginFrame.locator('input');
    
    // ユーザーIDとパスワードを入力
    await inputs.nth(0).fill(acc.id);
    await inputs.nth(1).fill(acc.password);

    // ログインボタンを特定してクリック
    const submitButton = loginFrame.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first();
    await submitButton.click();

    // ログイン後の遷移・自動更新のための待機
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
