console.log(`⏳ 【${acc.name}】CSV作成完了を監視します...`);

let loopCount = 1;
let targetRowLocator = null;

while (true) {
  const refreshBtn = page.locator('a:has-text("最新を表示する"), button:has-text("最新を表示する")').first();

  if (await refreshBtn.isVisible().catch(() => false)) {
    await refreshBtn.click().catch(() => {});
  } else {
    await page.reload().catch(() => {});
  }

  // 画面更新後の読み込み待ち
  await page.waitForTimeout(10000);

  // ヘッダーを除外するため tbody 内の tr を正確に取得
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  let found = false;

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    
    // ステータス列（左から3番目＝tdの2番目）と詳細列（左から4番目＝tdの3番目）を取得
    const statusText = await row.locator('td').nth(2).innerText().catch(() => "");
    const detailText = await row.locator('td').nth(3).innerText().catch(() => "");

    // ステータスが「完了」で、詳細に「.csv」の文字リンクが含まれているか
    if (statusText.includes("完了") && detailText.includes(".csv")) {
      console.log(`✅ 【${acc.name}】CSVの完成行を特定しました (上から ${i + 1} 行目)`);
      targetRowLocator = row;
      found = true;
      break;
    }
  }

  if (found) break;

  if (loopCount % 6 === 0) {
    const topRowText = await page.locator('table tbody tr').first().innerText().catch(() => "");
    console.log(`⏳ 【${acc.name}】CSV生成待ち... (${loopCount}回目) / 現在の1行目: ${topRowText.replace(/\n/g, ' ')}`);
  }

  loopCount++;
}

// ==========================================
// 4. CSVダウンロード処理
// ==========================================
// 特定した行の詳細列（tdの3番目）の中にある a タグをピンポイントで指定
const downloadLink = targetRowLocator.locator('td').nth(3).locator('a').first();

console.log(`📥 CSVのダウンロードリンクを確認中...`);
await downloadLink.waitFor({ state: 'visible', timeout: 15000 });

// ダウンロードイベントの待機を開始
const downloadPromise = page.waitForEvent('download', {
  timeout: 300000 // 最大5分
});

console.log(`📥 ダウンロードリンクをクリックします...`);
await page.waitForTimeout(1000);
await downloadLink.click({ force: true });

const download = await downloadPromise;
const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
await download.saveAs(downloadPath);
console.log(`💾 【${acc.name}】CSVダウンロードが完了しました: ${downloadPath}`);
