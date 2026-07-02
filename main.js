const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

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

function colNameToIndex(colName) {
  let index = 0;
  for (let i = 0; i < colName.length; i++) {
    index = index * 26 + (colName.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseCSVContentRobust(content) {
  const rows = [];
  let currentRawLine = '';
  let inQuotes = false;
  let isHeader = true;
  let headerLine = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    currentRawLine += char;
    
    if (char === '"') {
      inQuotes = !inQuotes;
    }
    
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[i + 1] === '\n') {
        currentRawLine += content[i + 1];
        i++;
      }
      
      const trimmedLine = currentRawLine.trim();
      if (trimmedLine) {
        if (isHeader) {
          headerLine = trimmedLine;
          isHeader = false;
        } else {
          const parsed = parseSingleCSVLine(trimmedLine);
          if (parsed.length > 0 && parsed[0] !== '') {
            rows.push(parsed);
          }
        }
      }
      currentRawLine = '';
    }
  }
  
  if (currentRawLine.trim() && !isHeader) {
    const parsed = parseSingleCSVLine(currentRawLine.trim());
    if (parsed.length > 0 && parsed[0] !== '') rows.push(parsed);
  }
  
  return { headerLine, rows };
}

function parseSingleCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function toCSVLine(arr) {
  return arr.map(val => {
    if (val && (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r'))) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val || '';
  }).join(',');
}

function getTargetDates() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  
  return {
    hyphenToday: `${yyyy}/${now.getMonth() + 1}/${now.getDate()}`,
    flatToday: `${yyyy}${mm}${dd}`,
    future10Years: `${yyyy + 10}/${now.getMonth() + 1}/${now.getDate()}`
  };
}

function generatePatternFiles(headerLine, targetRows, basePath, accountName, label) {
  const idxA = colNameToIndex('A');
  const idxB = colNameToIndex('B');
  const idxC = colNameToIndex('C');
  const idxD = colNameToIndex('D');
  const idxK = colNameToIndex('K');

  const pattern1Rows = targetRows.map(orgRow => {
    const row = [...orgRow];
    if (row[idxB]) {
      const rawB = row[idxB].replace(/"/g, '').trim();
      const partsB = rawB.split('/');
      if (partsB.length === 3) row[idxB] = `2019/${partsB[1]}/${partsB[2]}`;
    }
    
    if (row[idxC]) {
      const rawC = row[idxC].replace(/"/g, '').trim();
      const partsC = rawC.split('/');
      if (partsC.length === 3) row[idxC] = `2020/${partsC[1]}/${partsC[2]}`;
    }
    
    row[idxD] = '非掲載';
    return row;
  });

  const path1 = basePath.replace('.csv', `_${label}_pattern1.csv`);
  const content1 = [headerLine, ...pattern1Rows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path1, iconv.encode(content1, 'Shift_JIS'));
  console.log(`✅ 【${accountName}】【${label}】パターン1 CSV保存完了(Shift_JIS): ${path1}`);

  const dates = getTargetDates();
  const pattern2BaseRows = targetRows.map(orgRow => {
    const row = [...orgRow];
    if (row[idxA]) {
      const currentA = row[idxA].replace(/"/g, '').trim();
      row[idxA] = currentA.replace(/(RB\d{3})\d{8}/, `$1${dates.flatToday}`);
    }
    row[idxB] = dates.hyphenToday;
    row[idxC] = dates.future10Years;
    row[idxD] = '掲載';
    return row;
  });

  if (pattern2BaseRows.length > 1) {
    const lastKValue = pattern2BaseRows[pattern2BaseRows.length - 1][idxK];
    for (let i = pattern2BaseRows.length - 1; i > 0; i--) {
      pattern2BaseRows[i][idxK] = pattern2BaseRows[i - 1][idxK];
    }
    pattern2BaseRows[0][idxK] = lastKValue;
    console.log(`🔄 【${accountName}】【${label}】K列（募集職種）のローテーション完了。`);
  }

  const path2 = basePath.replace('.csv', `_${label}_pattern2.csv`);
  const content2 = [headerLine, ...pattern2BaseRows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path2, iconv.encode(content2, 'Shift_JIS'));
  console.log(`✅ 【${accountName}】【${label}】パターン2 CSV保存完了(Shift_JIS): ${path2}`);

  return { path1, path2 };
}

function processCSVFile(filePath, accountName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 【${accountName}】ファイルが見つかりません: ${filePath}`);
    return null;
  }

  console.log(`🛠️ 【${accountName}】CSVの加工処理を開始します...`);
  
  const buffer = fs.readFileSync(filePath);
  const content = iconv.decode(buffer, 'Shift_JIS');
  
  const idxB = colNameToIndex('B');
  const idxGG = colNameToIndex('GG');
  const idxGH = colNameToIndex('GH');

  const { headerLine, rows: allRows } = parseCSVContentRobust(content);

  if (allRows.length === 0) return null;

  const normalFiltered = allRows.filter(row => {
    const valGG = row[idxGG] ? row[idxGG].replace(/"/g, '').trim() : '';
    const valGH = row[idxGH] ? row[idxGH].replace(/"/g, '').trim() : '';
    const isBothActive = (valGG !== '0' && valGG !== '') && (valGH !== '0' && valGH !== '');
    return !isBothActive; 
  });

  normalFiltered.sort((x, y) => {
    const dateX = x[idxB] ? x[idxB].replace(/"/g, '').trim() : '';
    const dateY = y[idxB] ? y[idxB].replace(/"/g, '').trim() : '';
    return new Date(dateX) - new Date(dateY);
  });
  const normalTargetRows = normalFiltered.slice(0, 3990);
  const normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');

  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH] ? x[idxGH].replace(/"/g, '').trim() : 0) || 0;
    const valY = parseFloat(y[idxGH] ? y[idxGH].replace(/"/g, '').trim() : 0) || 0;
    return valY - valX;
  });

  const pvSliced = pvSorted.slice(0, 3990);
  pvSliced.sort((x, y) => {
    const dateX = x[idxB] ? x[idxB].replace(/"/g, '').trim() : '';
    const dateY = y[idxB] ? y[idxB].replace(/"/g, '').trim() : '';
    return new Date(dateX) - new Date(dateY);
  });
  const pvFiles = generatePatternFiles(headerLine, pvSliced, filePath, accountName, 'pv');

  return { normal: normalFiles, pv: pvFiles };
}

async function navigateViaMenuOrUrl(page, acc, targetText, targetUrlSegment) {
  try {
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
    if (await menuHoverIcon.count() > 0) {
      await menuHoverIcon.hover();
      await page.waitForTimeout(1000);
      const subMenuLink = page.locator(`a:has-text("${targetText}")`).first();
      if (await subMenuLink.count() > 0 && await subMenuLink.isVisible()) {
        await subMenuLink.click();
        await page.waitForLoadState('networkidle').catch(() => {});
        return;
      }
    }
  } catch (err) {
  }
  const destinationUrl = acc.url.replace('/login/', `/${targetUrlSegment}`);
  await page.goto(destinationUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function uploadSingleFileOnly(page, acc, fileToUpload, label) {
  console.log(`👉 【${acc.name}】[${label}] 募集一覧画面へ移動します...`);
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log(`👉 【${acc.name}】[${label}] 『ファイル取込予約』ボタンをクリックしてポップアップを開きます...`);
  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openModalBtn.click({ force: true });
  
  await page.waitForTimeout(2000);

  console.log(`📤 【${acc.name}】[${label}] アップロード要素を探索中...`);
  let targetInput = null;
  let activeFrame = null; 

  const mainInput = page.locator('input[type="file"]').first();
  if (await mainInput.count() > 0) {
    targetInput = mainInput;
  } else {
    console.log(`🔍 【${acc.name}】[${label}] メインDOMに見つからないため、iframe内をスキャンします...`);
    const frames = page.frames();
    for (const frame of frames) {
      const frameInput = frame.locator('input[type="file"]').first();
      if (await frameInput.count() > 0) {
        targetInput = frameInput;
        activeFrame = frame; 
        console.log(`💡 【${acc.name}】[${label}] iframe内で input[type="file"] を検出しました。`);
        break;
      }
    }
  }

  if (targetInput) {
    await targetInput.setInputFiles(fileToUpload);
    console.log(`✅ 【${acc.name}】[${label}] input要素へのファイル注入に成功しました。`);
  } else {
    console.log(`⚠️ 【${acc.name}】[${label}] inputが見つかりません。直接クリックを試みます...`);
    const customUploadBtn = page.locator('text=ファイルを選択, text=ファイル選択, button:has-text("選択"), .file-upload, .upload-area').first();
    if (await customUploadBtn.count() > 0) {
      await customUploadBtn.click({ force: true }).catch(() => {});
    }
    const retryInput = page.locator('input[type="file"]').first();
    if (await retryInput.count() > 0) {
      await retryInput.setInputFiles(fileToUpload).catch(() => {});
    }
  }
  
  await page.waitForTimeout(1500);

  console.log(`🚀 【${acc.name}】[${label}] 青色の『ファイル取込予約』実行ボタンを確定します...`);
  
  let targetClickBtn = null;
  const targetContext = activeFrame || page;

  const universalSelectors = [
    ':text("ファイル取込予約")',
    'a:has-text("ファイル取込予約")',
    '[class*="btn"]:has-text("ファイル取込予約")',
    'div:has-text("ファイル取込予約")',
    'button:has-text("ファイル取込予約")'
  ];

  for (const selector of universalSelectors) {
    const el = targetContext.locator(selector).last();
    if (await el.count() > 0) {
      targetClickBtn = el;
      console.log(`🎯 セレクター合致によりボタンを捕捉: ${selector}`);
      break;
    }
  }

  if (!targetClickBtn) {
    for (const f of page.frames()) {
      const el = f.locator(':text("ファイル取込予約")').last();
      if (await el.count() > 0) {
        targetClickBtn = el;
        break;
      }
    }
  }

  if (!targetClickBtn) {
    throw new Error("❌ 青い『ファイル取込予約』ボタンを画面上から特定できませんでした。");
  }

  console.log(`👆 【${acc.name}】[${label}] 青いエリアを物理クリック（強制）します...`);
  await targetClickBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await targetClickBtn.click({ force: true, timeout: 15000 });
  console.log(`🚀 【${acc.name}】[${label}] クリックイベントの送信完了。`);
  
  console.log(`💤 サーバー側のバッファ確保のため、30秒間待機します...`);
  await page.waitForTimeout(30000);
}

// 🎯 【ここだけ修正】「リクエスト日時」ヘッダーの真下にあるデータ行だけを狙い撃ちして監視（メイン&iframe両対応）
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

    // 💡 メイン画面とすべてのiframe枠を巡回して探す
    const contexts = [page, ...page.frames()];
    
    for (const ctx of contexts) {
      try {
        // 1. テーブルのヘッダーから「リクエスト日時」セルを検索
        const headerCell = ctx.locator('th:has-text("リクエスト日時"), td:has-text("リクエスト日時")').first();
        
        if (await headerCell.count() > 0 && await headerCell.isVisible()) {
          // 2. 「リクエスト日時」を持つ行(tr)を取得
          const headerRow = ctx.locator('tr:has(th:has-text("リクエスト日時")), tr:has(td:has-text("リクエスト日時"))').first();
          
          // 3. その行のすぐ次にあるデータ行（+ tr）をピンポイント指定
          const targetRow = headerRow.locator('+ tr');
          
          if (await targetRow.count() > 0) {
            const cells = await targetRow.locator('td').all();
            
            if (cells.length >= 6) {
              const dateText = (await cells[0].innerText().catch(() => "")).trim();
              
              // 有効な日付が入っているか確認
              if (dateText.includes('/') || dateText.includes(':')) {
                const status = (await cells[4].innerText().catch(() => "")).trim();
                const detail = (await cells[5].innerText().catch(() => "")).trim();
                
                if (status || detail) {
                  row1StatusText = `[${status}] ${detail}`;
                  foundTargetRow = true;
                }

                if (status.includes('キャンセル') || detail.includes('キャンセル')) {
                  throw new Error(`管理画面側で取込リクエストが「キャンセル」されました。`);
                }
                
                // ステータスが完了または成功であれば完了フラグを立てる
                if (status === '完了' || status === '成功') {
                  row1Finished = true;
                }
                
                break; // 正しいターゲット行を特定できたので走査終了
              }
            }
          }
        }
      } catch (err) {
        // エラーは無視してループ継続
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

async function runLoginAndProcess(browser, acc) {
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

    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します（全求人対象）`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    console.log(`👉 【${acc.name}】上部メニューの矢印ボタンにマウスを乗せます...`);
    await navigateViaMenuOrUrl(page, acc, "取出ファイル一覧", "rec_export_histories");

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中...`);
    let loopCount = 1;
    const watchStartTime = Date.now(); 

    while (true) {
      await page.waitForTimeout(5000);

      const rows = await page.locator('table tr').all();
      let statusText = "";
      let detailText = "";

      for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length >= 4) {
          const dateText = await cells[0].evaluate(el => el.textContent || "");
          if (dateText.includes('2026') || dateText.includes('/') || dateText.includes(':')) {
            statusText = await cells[2].evaluate(el => el.textContent || "");
            detailText = await cells[3].evaluate(el => el.textContent || "");
            break;
          }
        }
      }

      if (statusText.length > 0 && (statusText.includes('キャンセル') || detailText.includes('キャンセル'))) {
        throw new Error(`管理画面側でリクエストが「キャンセル」されました。`);
      }

      if (statusText.includes('完了') || statusText.includes('成功') || detailText.includes('rec_recruitments')) {
        console.log(`✅ 【${acc.name}】最新の取出行でCSVの生成完了を確認しました！`);
        break;
      }
      
      if (loopCount === 1 || loopCount % 6 === 0) {
        const displayStatus = statusText.trim() || "読み込み中";
        let displayDetail = detailText.trim() || "...";
        
        const match = displayDetail.match(/(\d+)\s*\/\s*(\d+)件/);
        if (match) {
          const currentCount = parseInt(match[1], 10);
          const totalCount = parseInt(match[2], 10);
          
          if (currentCount > 0 && totalCount > 0) {
            const elapsed = (Date.now() - watchStartTime) / 1000;
            const percent = ((currentCount / totalCount) * 100).toFixed(1);
            const estimatedTotalTime = (elapsed / currentCount) * totalCount;
            const remaining = Math.max(0, estimatedTotalTime - elapsed);
            
            const rMin = Math.floor(remaining / 60);
            const rSec = Math.floor(remaining % 60);
            
            displayDetail = `${currentCount}/${totalCount}件出力中 残り約${rMin}分${rSec}秒 (${percent}%)`;
          }
        }
        
        console.log(`⏳ 【${acc.name}】自動更新を待ちながら生成状況をチェック中... 現在の状態: [${displayStatus}] ${displayDetail}`);
      }
      loopCount++;
    }

    console.log(`👉 【${acc.name}】画面の切り替わりを2秒待機したあと、ダウンロードリンクを捕捉します...`);
    await page.waitForTimeout(2000); 
    
    const finalRows = await page.locator('table tr').all();
    let downloadLink = null;
    
    for (const row of finalRows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 4) {
        const dateText = await cells[0].evaluate(el => el.textContent || "");
        if (dateText.includes('2026') || dateText.includes('/') || dateText.includes(':')) {
          downloadLink = row.locator('a[href*=".csv"], a:has-text("ダウンロード"), td a, td button').first();
          break;
        }
      }
    }

    if (!downloadLink) {
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

    // ====== 📦 【通常版セット投入】 ======
    console.log(`📦 【${acc.name}】[通常版] 2ファイル連続アップロード（30秒インターバル）を実行します。`);
    await uploadSingleFileOnly(page, acc, processed.normal.path1, '①通常版・非掲載（先）');
    await uploadSingleFileOnly(page, acc, processed.normal.path2, '②通常版・掲載（後）');
    
    await waitImportLatestSingleRow(page, acc, '通常版セット（最終行待ち）');

    // ====== 📦 【PV版セット投入】 ======
    console.log(`📦 【${acc.name}】[PV版] 2ファイル連続アップロード（30秒インターバル）を実行します。`);
    await uploadSingleFileOnly(page, acc, processed.pv.path1, '③PV版・非掲載（先）');
    await uploadSingleFileOnly(page, acc, processed.pv.path2, '④PV版・掲載（後）');
    
    await waitImportLatestSingleRow(page, acc, 'PV版セット（最終行待ち）');

    console.log(`🎉 【${acc.name}】通常版・PV版を含む全 4 タスクの工程が正常終了しました。`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】処理中にエラーが発生: ${error.message}`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
  } finally {
    await context.close(); 
  }
}

(async () => {
  const browser = await chromium.launch();
  console.log("🏁 4大タスク一括・交互連続ループを開始します。(停止は Ctrl+C)");
  
  while (true) {
    for (const acc of accounts) {
      console.log(`🚀 ==========================================`);
      console.log(`🚀 アカウント【${acc.name}】通常・PV（計4タスク）を開始`);
      console.log(`🚀 ==========================================`);
      
      try {
        await runLoginAndProcess(browser, acc);
      } catch (err) {
        console.log(`⚠️ アカウント【${acc.name}】で例外エラー。次のアカウントへリレーします。`);
      }
      
      console.log(`💤 セッション競合防止のため、30秒間のインターバルを挟みます...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
})();
