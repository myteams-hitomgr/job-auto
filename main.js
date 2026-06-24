const { chromium } = require('playwright');

const accounts = [
  {
    id: process.env.HITOMGR_ID_A,
    pass: process.env.HITOMGR_PASSWORD,
    name: "A"
  },
  {
    id: process.env.HITOMGR_ID_B,
    pass: process.env.HITOMGR_PASSWORD,
    name: "B"
  }
];

async function runLogin(page, acc) {
  await page.goto('https://kanri.hitomgr.jp/lwf3/login');

  // ID入力（ここは後で調整あり）
  await page.fill('input[name="login_id"]', acc.id);

  // パス入力
  await page.fill('input[name="password"]', acc.pass);

  // ログインボタン
  await page.click('button[type="submit"]');

  await page.waitForTimeout(5000);
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

  await browser.close();
})();
