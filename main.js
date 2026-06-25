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

    // 💡 【超重要】ログインフォームが埋め込まれている透明な枠（iframe）を探して特定します
    const loginFrame = page.frame({ url: /.*\/auth\/.*/ }) || page.frames().find(f => f.name().includes('login') || f.url().includes('auth')) || page.mainFrame();

    // 枠の中にある「1番目の入力欄（ユーザーID）」と「2番目の入力欄（パスワード）」に入力
    const inputs = loginFrame.locator('input');
    await inputs.nth(0).fill(acc.id);
    await inputs.nth(1).fill(acc.password);

    // 枠の中にある「ログインボタン」を確実にクリック
    // 青いボタンの文字やクラス名に対応
    const submitButton = loginFrame.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first();
    await submitButton.click();

    // ログイン後の処理や遷移を待つ
    await page.waitForTimeout(7000);

    // 成功時のスクショを保存
    await page.screenshot({ path: `${acc.name}_success.png`, fullPage: true });
    console.log(`📸 【${acc.name}】ログイン後の画面スクショを保存しました！`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】エラーが発生しました。現在の画面を保存します。`);
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
