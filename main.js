async function downloadAndPrepareCSV(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(0); 

  page.on('dialog', async dialog => {
    console.log(`💬 【${acc.name}】ダイアログ検出: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    const recruitUrl = acc.url.replace(/\/login\/?$/, '') + '/rec_recruitments';
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します（全求人対象）`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    // アカウントごとに「取出ファイル一覧」の遷移先URLを出し分け
    const historySegment = (acc.name === 'B') ? "csv_export_queues" : "rec_export_histories";
    console.log(`👉 【${acc.name}】「取出ファイル一覧」画面へ移動します... (segment: ${historySegment})`);
    await navigateViaMenuOrUrl(page, acc, "取出ファイル一覧", historySegment);

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中...`);
    let loopCount = 1;
    const startTime = Date.now();
    const maxWaitTimeMs = 20 * 60 * 1000; // 20分で強制タイムアウト

    while (true) {
      if (Date.now() - startTime > maxWaitTimeMs) {
        throw new Error("⏳ CSV生成の監視が制限時間（20分）を超過したため強制終了しました。");
      }

      // 「最新を表示する」または「更新」ボタンをクリックして再読み込み
      const refreshBtn = page.locator('a:has-text("最新を表示する"), button:has-text("最新を表示する"), .btn:has-text("最新を表示する"), a:has-text("更新"), button:has-text("更新")').first();
      if (await refreshBtn.count() > 0) {
        await refreshBtn.click({ force: true });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(3000);
      }

      // テーブルの全行を再取得
      const tableRows = await page.locator('table tr').all();
      
      let rowTextCombined = "";
      let hasDownloadLink = false;

      if (tableRows.length > 1) {
        // 先頭データ行（ヘッダーの次）をターゲットにする
        const latestRow = tableRows[1]; 
        rowTextCombined = (await latestRow.textContent() || "").trim();
        
        // 該当行の中に「ダウンロード」リンクやCSVファイルへのリンク、aタグが存在するか直接確認
        const downloadElements = latestRow.locator('a[href*=".csv"], a:has-text("ダウンロード"), button:has-text("ダウンロード"), a[href*="download"]');
        const linkCount = await downloadElements.count();
        if (linkCount > 0) {
          hasDownloadLink = true;
        }
      }

      const cleanRowText = rowTextCombined.replace(/\s+/g, ' ');

      // キャンセルが走った場合の検知
      if (cleanRowText.includes('キャンセル')) {
        throw new Error(`管理画面側で最新のリクエストが「キャンセル」されました。`);
      }

      // 【超柔軟・列位置不問の完了判定】
      // 1. 行内に「完了」や「成功」が含まれる、または、実際にダウンロードリンクが存在する
      // 2. かつ、「作成中」「準備中」「処理中」「未処理」「読み込み中」などの処理中キーワードがどこにも含まれていない
      const isProcessing = /作成中|準備中|処理中|待機中|未処理|インポート中|読み込み中/.test(cleanRowText);
      const isSuccess = cleanRowText.includes('完了') || cleanRowText.includes('成功') || hasDownloadLink;

      if (isSuccess && !isProcessing) {
        console.log(`✅ 【${acc.name}】最新の取出行でCSVの生成完了を確認しました！ (行テキスト: [${cleanRowText}])`);
        break;
      }
      
      // 進行状況のログ出力
      if (loopCount === 1 || loopCount % 4 === 0) {
        console.log(`⏳ 【${acc.name}】生成状況を監視中... 現在の行状態: [${cleanRowText.slice(0, 80)}...]`);
      }
      loopCount++;
      await page.waitForTimeout(5000);
    }

    console.log(`👉 【${acc.name}】画面の切り替わりを2秒待機したあと、ダウンロードリンクを捕捉します...`);
    await page.waitForTimeout(2000); 
    
    // 最新行（1行目）からダウンロード可能なタグを100%見つけ出す
    const finalRows = await page.locator('table tr').all();
    let downloadLink = null;
    if (finalRows.length > 1) {
      const finalLatestRow = finalRows[1];
      // download属性やcsvリンク、もしくはテキストにダウンロードと入っているa/button/span要素をすべてフォールバック検索
      downloadLink = finalLatestRow.locator('a[href*=".csv"], a:has-text("ダウンロード"), button:has-text("ダウンロード"), a[href*="download"], a').first();
    }

    if (!downloadLink || await downloadLink.count() === 0) {
      throw new Error("CSV of download link cannot be specified.");
    }

    console.log(`👉 【${acc.name}】ダウンロードを開始します...`);
    const [download] = await Promise.all([
      page.waitForEvent('download'), 
      downloadLink.click({ force: true })
    ]);
    
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);
    console.log(`✅ 【${acc.name}】RAWデータのダウンロード・保存に成功しました！`);

    const processed = processCSVFile(downloadPath, acc.name);
    if (!processed) throw new Error("CSVデータの加工に失敗しました。");

    return { page, context, processed };
  } catch (error) {
    console.log(`⚠️ 【${acc.name}】準備処理中にエラーが発生: ${error.message}`);
    await page.screenshot({ path: `error_prepare_${acc.name}.png`, fullPage: true });
    await context.close();
    throw error;
  }
}
