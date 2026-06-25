const { chromium } = require('playwright');

const accounts = [
  { name: 'A', id: process.env.HITOMGR_ID_M003, password: process.env.HITOMGR_PASSWORD_PASSU003 },
  { name: 'B', id: process.env.HITOMGR_ID_U003, password: process.env.HITOMGR_PASSWORD_PASSU003 }
];

async function runLogin(page, acc) {
  // ログイン画面へ移動
  await page.goto('https://hitomgr.jp/b/login', { waitUntil: 'networkidle' }); 

  // 💡 【超強力修正】名前に頼らず、画面内の「1番目の入力欄」と「2番目の入力欄」を直接指定します
  const inputs = page.locator('input');
  
  // 1番目の入力欄にIDを入力
  await inputs.nth(0).fill(acc.id);
  // 2番目の入力欄にパスワードを入力
  await inputs.nth(1).fill(acc.password);

  // ログインボタン（または送信タイプのボタン）をクリック
  const submitButton = page.locator('button, input[type="submit"], input[type="image"]').first();
  await submitButton.click();

  await page.waitForTimeout(5000);

  // スクショを保存
  await page.screenshot({ path: `${acc.name}.png`, fullPage: true });
  console.log(`📸 スクショ保存完了: ${acc.name}`);

  await page.waitForTimeout(3000);
}

(async () => {
  const browser = await chromium.launch();

  for (const acc of accounts) {
    const page = await browser.newPage();

    console.log(`ログイン開始: ${acc.name}`);

    try {
      await runLogin(page, acc);
    } catch (error) {
      // エラーが起きても途中で止めず、何が起きたかスクショを撮って残す
      console.log(`⚠️ エラーが発生しました。現在の画面を保存します: ${acc.name}`);
      await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
      throw error;
    }

    await page.close();
    console.log(`完了: ${acc.name}`);
  }

  // ログ出力用コード
  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
