const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); 
  const page = await browser.newPage();

  await page.goto('https://kanri.hitomgr.jp/lwf3/login');

  console.log("ログイン画面表示");

  // ここで少し待つ（重要）
  await page.waitForTimeout(5000);

  await browser.close();
})();
