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

(async () => {
  const browser = await chromium.launch();

  for (const acc of accounts) {
    const page = await browser.newPage();

    console.log(`ログイン開始: ${acc.name}`);

    await page.goto('https://kanri.hitomgr.jp/lwf3/login');

    await page.waitForTimeout(3000);

    await page.close();

    console.log(`完了: ${acc.name}`);
  }

  await browser.close();
})();
