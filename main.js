const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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

function parseCSVLine(line) {
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
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
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
    const rawB = row[idxB].replace(/"/g, '').trim();
    const partsB = rawB.split('/');
    if (partsB.length === 3) row[idxB] = `2019/${partsB[1]}/${partsB[2]}`;
    
    const rawC = row[idxC].replace(/"/g, '').trim();
    const partsC = rawC.split('/');
    if (partsC.length === 3) row[idxC] = `2020/${partsC[1]}/${partsC[2]}`;
    
    row[idxD] = '非掲載';
    return row;
  });

  const path1 = basePath.replace('.csv', `_${label}_pattern1.csv`);
  fs.writeFileSync(path1, [headerLine, ...pattern1Rows.map(toCSVLine)].join('\n'), 'utf8');
  console.log(`✅ 【${accountName}】【${label}】パターン1 CSV保存完了: ${path1}`);

  const dates = getTargetDates();
  const pattern2BaseRows = targetRows.map(orgRow => {
    const row = [...orgRow];
    const currentA = row[idxA].replace(/"/g, '').trim();
    row[idxA] = currentA.replace(/(RB\d{3})\d{8}/, `$1${dates.flatToday}`);
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
  fs.writeFileSync(path2, [headerLine, ...pattern2BaseRows.map(toCSVLine)].join('\n'), 'utf8');
  console.log(`✅ 【${accountName}】【${label}】パターン2 CSV保存完了: ${path2}`);

  return { path1, path2 };
}

function processCSVFile(filePath, accountName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 【${accountName}】ファイルが見つかりません: ${filePath}`);
    return null;
  }

  console.log(`🛠️ 【${accountName}】CSVの加工処理を開始します...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) return null;

  const headerLine = lines[0];
  const idxB = colNameToIndex('B');
  const idxGG = colNameToIndex('GG');
  const idxGH = colNameToIndex('GH');

  const allRows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(idxB, idxGG, idxGH)) continue;
    allRows.push(row);
  }

  const normalFiltered = allRows.filter(row => {
    const valGG = row[idxGG].replace(/"/g, '').trim();
    const valGH = row[idxGH].replace(/"/g, '').trim();
    if (valGG === '0' || valGG === '') return false;
    if (valGH === '0' || valGH === '') return false;
    return true;
  });

  normalFiltered.sort((x, y) => new Date(x[idxB].replace(/"/g, '').trim()) - new Date(y[idxB].replace(/"/g, '').trim()));
  const normalTargetRows = normalFiltered.slice(0, 3990);
  const normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');

  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH].replace(/"/g, '').trim()) || 0;
    const valY = parseFloat(y[idxGH].replace(/"/g, '').trim()) || 0;
    return valY - valX;
  });

  const pvSliced = pvSorted.slice(0, 3990);
  pvSliced.sort((x, y) => new Date(x[idxB].replace(/"/g, '').trim()) - new Date(y[idxB].replace(/"/g, '').trim()));
  const pvFiles = generatePatternFiles(headerLine, pvSliced, filePath, accountName, 'pv');

  return { normal: normalFiles, pv: pvFiles };
}

// 【全面書き換え】1枚目・2枚目の画像仕様に合わせたアップロード処理
async function uploadCSVFile(page, acc, fileToUpload) {
  console.log(`👉 【${acc.name}】募集一覧画面へ移動します...`);
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`👉 【${acc.name}】『ファイル取込予約』ボタンをクリックしてポップアップを開きます...`); // image_c8d1bf.png
  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.click();
  await page.waitForTimeout(2000);

  console.log(`📤 【${acc.name}】ポップアップ内でファイル（${path.basename(fileToUpload)}）を選択中...`); // image_c8d222.png
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 0 });
  await fileInput.setInputFiles(fileToUpload);
  await page.waitForTimeout(2000);
  
  console.log(`🚀 【${acc.name}】青色の『ファイル取込予約』実行ボタンをクリックします...`); // image_c8d222.png
  const doUploadBtn = page.locator('.modal-footer button:has-text("ファイル取込予約"), #cboxLoadedContent button:has-text("ファイル取込予約"), button:has-text("ファイル取込予約")').first();
  await doUploadBtn.click();
  
  console.log(`🚀 【${acc.name}】取込リクエストを送信しました。画面が落ち着くまで8秒待機します。`);
  await page.waitForTimeout(8000);
}

// 【全面書き換え】3枚目・4枚目の画像仕様に合わせた「取込ファイル一覧」での監視処理
async function goToImportListAndWatch(page, acc, label) {
  console.log(`👉 【${acc.name}】上部メニューの矢印（ドロップダウン）をクリックします...`); // image_c8d5a2.png
  const arrowMenu = page.locator('li.dropdown a:has(.fa-refresh), li a:has(img[src*="arrow"]), .nav-tabs li:nth-child(5) a').first();
  await arrowMenu.click();
  await page.waitForTimeout(1000);

  console.log(`👉 【${acc.name}】メニューから『取込ファイル一覧』を選択します...`); // image_c8d5a2.png
  await page.locator('a:has-text("取込ファイル一覧")').first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`⏳ 【${acc.name}】[${label}] の取込完了（ステータス: 完了 / 詳細: 成功...）を監視します。`); // image_c8d8e6.png
  
  let loopCount = 1;
  while (true) { 
    await page.waitForTimeout(10000); // 重い処理のため10秒おきにチェック

    // 画面にある「最新を表示する」ボタンがあれば押して最新状態にする
    const refreshBtn = page.locator('a:has-text("最新を表示する"), button:has-text("最新を表示する")').first();
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    const rows = await page.locator('table tr').all();
    let statusText = "";
    let detailText = "";

    // 1行目はヘッダーなので、2行目（データ最上段）をスキャン
    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 5) {
        const dateCell = await cells[0].evaluate(el => el.textContent || "");
        if (dateCell.includes('2026') || dateCell.includes('/') || dateCell.includes(':')) {
          statusText = await cells[4].evaluate(el => el.textContent || ""); // ステータス列
          detailText = await cells[5].evaluate(el => el.textContent || ""); // 詳細列
          break;
        }
      }
    }

    if (statusText.includes('完了') && (detailText.includes('成功') || detailText.includes('一部エラーあり'))) {
      console.log(`✅ 【${acc.name}】[${label}] 取込処理が正常に「${statusText.trim()}（${detailText.trim()}）」となりました！`); // image_c8d8e6.png
      break;
    } else {
      if (loopCount % 3 === 0) {
        console.log(`⏳ 【${acc.name}】[${label}] 処理の完了を待っています... 現在のステータス: [${statusText.trim()}] [${detailText.trim()}]`);
      }
    }
    loopCount++;
  }
}

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(0); // すべてのタイムアウト制限を解除

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
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').nth(0); // 1番目のボタン（取出）
    await exportBtn.waitFor({ state: 'visible', timeout: 0 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    // 取出ファイル一覧ページへ移動（上部ドロップダウン経由）
    const arrowMenu = page.locator('li.dropdown a:has(.fa-refresh), li a:has(img[src*="arrow"]), .nav-tabs li:nth-child(5) a').first();
    await arrowMenu.click();
    await page.waitForTimeout(1000);
    await page.locator('a:has-text("取出ファイル一覧")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中...（※30分以上かかる場合があります）`);
    let loopCount = 1;

    while (true) {
      await page.waitForTimeout(10000); // 10秒おきに確認

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
        if (cells.length >= 4) {
          const dateText = await cells[0].evaluate(el => el.textContent || "");
          if (dateText.includes('2026') || dateText.includes('/') || dateText.includes(':')) {
            statusText = await cells[2].evaluate(el => el.textContent || "");
            detailText = await cells[3].evaluate(el => el.textContent || "");
            break;
          }
        }
      }

      if (statusText.includes('完了') || statusText.includes('成功') || detailText.includes('rec_recruitments')) {
        console.log(`✅ 【${acc.name}】最新の取出行でCSVの生成完了を確認しました！`);
        break;
      }
      
      if (loopCount % 6 === 0) {
        console.log(`⏳ 【${acc.name}】CSV抽出の進行状況を確認中... 現在の状態: [${statusText.trim()}] ${detailText.trim()}`);
      }
      loopCount++;
    }

    await page.waitForTimeout(3000); 
    
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

    if (!downloadLink) throw new Error("CSVのダウンロードリンクを特定できませんでした。");

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

    // =========================================================
    // 4大タスクの連続アップロード処理（画像の手順を完全再現）
    // =========================================================
    
    // 【1番目】 通常版：非掲載
    console.log(`🔷 【${acc.name}】タスク① [通常版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path1);
    await goToImportListAndWatch(page, acc, '通常版・非掲載');

    // 【2番目】 通常版：掲載
    console.log(`🔷 【${acc.name}】タスク② [通常版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path2);
    await goToImportListAndWatch(page, acc, '通常版・掲載');
    
    // 【3番目】 PV版：非掲載
    console.log(`🔶 【${acc.name}】タスク③ [PV版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path1);
    await goToImportListAndWatch(page, acc, 'PV版・非掲載');

    // 【4番目】 PV版：掲載
    console.log(`🔶 【${acc.name}】タスク④ [PV版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path2);
    await goToImportListAndWatch(page, acc, 'PV版・掲載');

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
