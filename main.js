async function uploadAndWatchSingleFile(page, acc, fileToUpload, label) {
  // ① 募集一覧画面へ移動
  console.log(`👉 【${acc.name}】[${label}] 募集一覧画面へ移動します...`);
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  // ② 『ファイル取込予約』ボタンをクリック
  console.log(`👉 【${acc.name}】[${label}] 『ファイル取込予約』をクリックします...`);
  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.waitFor({ state: 'visible', timeout: 30000 });
  await openModalBtn.click({ force: true });

  await page.waitForTimeout(3000); // モーダル表示待ち

  // ③ ファイル選択（★ここが修正ポイント）
  console.log(`📤 【${acc.name}】[${label}] ファイル選択ダイアログを起動中...`);

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 30000 }),
    page.click('text=ファイル選択, button:has-text("ファイル選択"), input[type="file"]', { force: true })
  ]);

  await fileChooser.setFiles(fileToUpload);

  await page.waitForTimeout(2000);

  // ④ 青色の『ファイル取込予約』実行ボタンをクリック
  console.log(`🚀 【${acc.name}】[${label}] 取込予約を実行します...`);

  const doUploadBtn = page.locator(
    '.modal-footer button:has-text("ファイル取込予約"), ' +
    '#cboxLoadedContent button:has-text("ファイル取込予約"), ' +
    'button:has-text("ファイル取込予約")'
  ).first();

  await doUploadBtn.waitFor({ state: 'visible', timeout: 30000 });
  await doUploadBtn.click({ force: true });

  console.log(`🚀 【${acc.name}】[${label}] 送信完了。8秒待機します...`);
  await page.waitForTimeout(8000);

  // ⑤ 取込ファイル一覧へ移動
  console.log(`👉 【${acc.name}】[${label}] 取込ファイル一覧へ移動します...`);
  await navigateViaMenuOrUrl(page, acc, "取込ファイル一覧", "rec_import_histories");

  // ⑥ 完了監視
  console.log(`⏳ 【${acc.name}】[${label}] 取込完了を監視中...`);

  let loopCount = 1;

  while (true) {
    await page.waitForTimeout(10000);

    const refreshBtn = page.locator('a:has-text("最新を表示する"), button:has-text("最新を表示する")').first();
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    const rows = await page.locator('table tr').all();
    let statusText = "";
    let detailText = "";

    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 5) {
        const dateCell = await cells[0].evaluate(el => el.textContent || "");
        if (dateCell.includes('2026') || dateCell.includes('/') || dateCell.includes(':')) {
          statusText = await cells[4].evaluate(el => el.textContent || "");
          detailText = await cells[5].evaluate(el => el.textContent || "");
          break;
        }
      }
    }

    if (statusText.includes('完了') &&
        (detailText.includes('成功') || detailText.includes('一部エラーあり'))) {
      console.log(`✅ 【${acc.name}】[${label}] 完了確認OK`);
      break;
    }

    if (loopCount % 3 === 0) {
      console.log(`⏳ 【${acc.name}】[${label}] 状態: [${statusText}] [${detailText}]`);
    }

    loopCount++;
  }
}
