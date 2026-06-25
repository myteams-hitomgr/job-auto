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
    // 1. ログイン画面へ移動
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 

    // ユーザーIDとパスワードの入力欄が表示されるまで待機
    await page.waitForSelector('input[type="text"], input[type="email"], input:not([type="hidden"])', { timeout: 15000 });

    const idInput = page.locator('input[type="text"], input[type="email"], input[name*="login"], input[name*="id"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    // 値を入力
    await idInput.fill(acc.id);
    await passwordInput.fill(acc.password);

    // ログインボタンをクリック
    const submitButton = page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first();
    await submitButton.click();

    console.log(`【${acc.name}】ログインボタンをクリックしました。トップページの読み込みを待機中...`);

    // 2. ログイン後のトップページ（募集管理ボタンがある画面）が表示されるのを待つ
    const recruitMenuLocator = page.locator('a:has-text("募集管理"), div:has-text("募集管理"), button:has-text("募集管理")').first();
    await recruitMenuLocator.waitFor({ state: 'visible', timeout: 30000 });

    // ログイン直後のスクショを保存
    await page.screenshot({ path: `${acc.name}_login_success.png`, fullPage: true });

    // 3. 募集管理をクリック！ (force: true を追加してポップアップの妨害を回避)
    console.log(`👉 【${acc.name}】「募集管理」をクリックします（妨害カバー回避モード）`);
    await recruitMenuLocator.click({ force: true });

    // 遷移後の読み込みを少し待つ
    await page.waitForTimeout(5000);

    // 「募集管理」クリック後の画面スクショを保存
    await page.screenshot({ path: `${acc.name}_recruit_page.png`, fullPage: true });
    console.log(`📸 【${acc.name}】「募集管理」画面のスクショを保存しました！`);

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

  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
