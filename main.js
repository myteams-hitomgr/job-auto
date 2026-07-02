// 🎯 「リクエスト日時」ヘッダーの真下の行だけをピンポイントで確実にとらえて監視するロジック
async function waitImportLatestSingleRow(page, acc, batchLabel, timeout = 24 * 60 * 60 * 1000) {
  const start = Date.now();
  let loopCount = 1;
  let lastDataFoundTime = Date.now(); 

  const moveToImportHistory = async () => {
    console.log(`🔄 【${acc.name}】[${batchLabel}] 画面の応答が確認できないため、メニューホバーから「取込ファイル一覧」を強制再読込します...`);
    await navigateViaMenuOrUrl(page, acc, "取込ファイル一覧", "rec_import_histories");
    lastDataFoundTime = Date.now(); 
  };

  console.log(`👉 【${acc.name}】[${batchLabel}] 上部メニューの矢印ボタンにマウスを乗せ、「取込ファイル一覧」へ移動します...`);
  await navigateViaMenuOrUrl(page, acc, "取込ファイル一覧", "rec_import_histories");
  console.log(`📄 【${acc.name}】[${batchLabel}] 監視を開始。「リクエスト日時」ヘッダーの真下の行の進捗を見守ります。`);

  while (true) {
    await page.waitForTimeout(5000);

    let row1Finished = false;
    let row1StatusText = "";
    let foundTargetRow = false;

    // 💡 全てのコンテキスト（メイン画面 + 全てのiframe）を走査対象にする
    const contexts = [page, ...page.frames()];
    
    for (const ctx of contexts) {
      try {
        // 1. 「リクエスト日時」というテキストを持つ th または td を探す
        const headerCell = ctx.locator('th:has-text("リクエスト日時"), td:has-text("リクエスト日時")').first();
        
        if (await headerCell.count() > 0 && await headerCell.isVisible()) {
          // 2. そのセルの親である「ヘッダー行(tr)」を取得
          const headerRow = ctx.locator('tr:has(th:has-text("リクエスト日時")), tr:has(td:has-text("リクエスト日時"))').first();
          
          // 3. 【確実な指定】ヘッダー行の「すぐ次の兄弟要素(tr)」＝あなたが仰る『リクエスト日時の下の行』をピンポイントで取得
          const targetRow = headerRow.locator('+ tr');
          
          if (await targetRow.count() > 0) {
            const cells = await targetRow.locator('td').all();
            
            // 該当行にデータが入っているかチェック（念のため日付形式か確認）
            if (cells.length >= 6) {
              const dateText = (await cells[0].innerText().catch(() => "")).trim();
              
              if (dateText.includes('/') || dateText.includes(':') || dateText.includes('2026')) {
                const status = (await cells[4].innerText().catch(() => "")).trim();
                const detail = (await cells[5].innerText().catch(() => "")).trim();
                
                if (status || detail) {
                  row1StatusText = `[${status}] ${detail}`;
                  foundTargetRow = true;
                }

                if (status.includes('キャンセル') || detail.includes('キャンセル')) {
                  throw new Error(`管理画面側で取込リクエストが「キャンセル」されました。`);
                }
                
                // ステータスが完了、または成功であればOK
                if (status === '完了' || status === '成功') {
                  row1Finished = true;
                }
                
                // 正しいターゲット行を処理できたので、このコンテキストでの探索を終了
                break;
              }
            }
          }
        }
      } catch (err) {
        // 要素が一時的に消えた場合などのエラーはログに流さずパスして次へ
      }
    }

    if (foundTargetRow) {
      lastDataFoundTime = Date.now();
    } else {
      if (Date.now() - lastDataFoundTime > 5 * 60 * 1000) {
        await moveToImportHistory();
        continue; 
      }
    }

    if (row1Finished) {
      console.log(`✅ 【${acc.name}】[${batchLabel}] 「リクエスト日時」の真下の行が「${row1StatusText}」になったため、正常終了します。`);
      break;
    }
    
    if (loopCount === 1 || loopCount % 6 === 0) {
      const log1 = row1StatusText || "データ同期中(ターゲット行をスキャンしています)";
      console.log(`⏳ 【${acc.name}】[${batchLabel}] リクエスト日時の真下の行を監視中... \n    └ 最新データ行: ${log1}`);
    }

    if (Date.now() - start > timeout) {
      throw new Error(`取込処理がタイムアウト（${timeout / 60000}分）しました。`);
    }

    loopCount++;
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}
