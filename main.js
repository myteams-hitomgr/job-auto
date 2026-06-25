const { chromium } = require('playwright');

const accounts = [
  { name: 'A', id: process.env.HITOMGR_ID_M003, password: process.env.HITOMGR_PASSWORD_PASSU003 },
  { name: 'B', id: process.env.HITOMGR_ID_U003, password: process.env.HITOMGR_PASSWORD_PASSU003 }
];

async function runLogin(page, acc) {
  await page.goto('https://kanri.hitomgr.jp/lwf3/login');

  await page.fill('input[name="login_id"]', acc.id);
  await page.fill('input[name="password"]', acc.pass);

  await page.click('button[type="submit"]');

  // ❗ networkidleやめる（ここ修正）
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log(`ログイン後URL: ${url}`);

  if (url.includes('login')) {
    console.log(`❌ ログイン失敗の可能性: ${acc.name}`);
    return;
  }

  console.log(`✅ ログイン成功: ${acc.name}`);

  // 募集管理へ移動
  await page.goto('https://kanri.hitomgr.jp/recruitments');

  // ❗ 画面安定待ち
  await page.waitForTimeout(3000);

  // スクショ
  await page.screenshot({
    path: `recruitments_${acc.name}.png`,
    fullPage: true
  });

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

  await browser.close();
})();

// 👇 ここから3行を追加
  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close(); // 元からある行
})();
