const { chromium } = require('playwright');

const accounts = [
  { name: 'A', id: process.env.HITOMGR_ID_M003, password: process.env.HITOMGR_PASSWORD_PASSU003 },
  { name: 'B', id: process.env.HITOMGR_ID_U003, password: process.env.HITOMGR_PASSWORD_PASSU003 }
];

async function runLogin(page, acc) {
  // ログイン画面へ移動
  await page.goto('https://hitomgr.jp/b/login'); 

  // 💡 ヒトマネジャーの実際の入力欄（name="login_id" と name="password"）に修正しました
  await page.fill('input[name="login_id"]', acc.id);
  await page.fill('input[name="password"]', acc.password);

  // ログインボタンをクリック
  await page.click('button[type="submit"]');

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

    await runLogin(page, acc);

    await page.close();

    console.log(`完了: ${acc.name}`);
  }

  // ログ出力用コード
  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
