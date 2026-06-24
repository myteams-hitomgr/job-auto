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

  await page.fill('input[name="login_id"]', acc.id);
  await page.fill('input[name="password"]', acc.pass);

  await page.click('button[type="submit"]');

  // 🔽 ここ追加（重要）
  await page.waitForLoadState('networkidle');

  const url = page.url();
  console.log(`ログイン後URL: ${url}`);

  if (url.includes('login')) {
    console.log(`❌ ログイン失敗の可能性: ${acc.name}`);
  } else {
    console.log(`✅ ログイン成功: ${acc.name}`);
  }

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

  await browser.close();
})();
