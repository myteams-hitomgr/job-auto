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
  // 💡 アカウントごとに「完全に独立したクッキー・セッション環境（シークレット窓）」を作成
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`【${acc.name}】処理開始 - URL: ${acc.url}`);

  try {
    // ログイン画面へ移動
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 

    // 画面内の入力欄（input）をすべて取得
    const inputs = page.locator('input');
    
    // 1番目の入力欄にID、2番目の入力欄にパスワードを入力
    await inputs.nth(0).fill(acc.id);
    await inputs.nth(1).fill(acc.password);

    // ログインボタンをクリック
    const submitButton = page.locator('button, input[type="submit"], .btn, #login_btn').first();
    await submitButton.click();

    // ログイン後の遷移・自動更新のための待機（必要に応じて調整してください）
    await page.waitForTimeout(5000);

    // ログイン成功時のスクショを保存
    await page.screenshot({ path: `${acc.name}_success.png`, fullPage: true });
    console.log(`📸 【${acc.name}】スクショ保存完了`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】エラーが発生しました。現在の画面を保存します。`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
    throw error;
  } finally {
    // 処理が終わったらそのアカウントの環境を閉じる
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();

  // 💡 Promise.all を使い、アカウントAとBの処理を「完全に同時並行」で実行します！
  // これでお互いのログインを邪魔しません。
  try {
    await Promise.all(accounts.map(acc => runLoginAndProcess(browser, acc)));
  } catch (e) {
    console.log("一部のアカウントでエラーが発生しましたが、処理を終了します。");
  }

  // ログ出力用コード
  const fs = require('fs');
  console.log("=== 現在保存されているファイル一覧 ===");
  console.log(fs.readdirSync('.'));

  await browser.close();
})();
