const { chromium } = require('playwright');

const accounts = [
  { name: 'A', id: process.env.HITOMGR_ID_M003, password: process.env.HITOMGR_PASSWORD_PASSU003 },
  { name: 'B', id: process.env.HITOMGR_ID_U003, password: process.env.HITOMGR_PASSWORD_PASSU003 }
];

async function runLogin(page, acc) {
  await page.goto('https://hitomgr.jp/b/login'); // 実際のURLに合わせて適宜変更してください

  await page.fill('input[type="text"]', acc.id);
  await page.fill('input[type="password"]', acc.password);

  await page.click('button[type="submit"]');

  await page.waitForTimeout(5000);

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
