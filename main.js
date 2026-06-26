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
    future10Years: `${yyyy + 10}/${now.getMonth() + 1}/${now.getDate()}`,
    matchTodayStr: `${yyyy}/${mm}/${dd}`
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
    if (valGG !== '0' && valGG !== '') return false;
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

async function uploadCSVFile(page, acc, fileToUpload) {
  console.log(`👉 【${acc.name}】上部メニューの矢印ボタンにマウスを乗せます...`);
  const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
  await menuHoverIcon.hover();
  await page.waitForTimeout(1500);

  console.log(`👉 【${acc.name}】メニューから「取込ファイル一覧」をクリックします`);
  await page.locator('a:has-text("取込ファイル一覧")').first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  
  console.log(`📤 【${acc.name}】CSVファイル（${path.basename(fileToUpload)}）を選択中...`);
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await fileInput.setInputFiles(fileToUpload);
  
  const uploadBtn = page.locator('button:has-text("取込"), input[value*="取込"], button:has-text("保存"), .btn:has-text("実行")').first();
  await uploadBtn.click();
  
  console.log(`🚀 【${acc.name}】取込リクエスト送信完了。`);
  await page.waitForTimeout(8000);
}

async function waitForImportSuccess(page, acc, label) {
  console.log(`⏳ 【${acc.name}】[${label}] 取込完了を監視中...`);
  
  let loopCount = 1;
  const MAX_IMPORT_LOOPS = 20; // 最大20回（約10分）でタイムアウト制限
  
  while (loopCount <= MAX_IMPORT_LOOPS) { 
    console.log(`👉 取込状況を確認するため「取込ファイル一覧」を開きます... (状況確認: ${loopCount}回目)`);
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
    await menuHoverIcon.hover().catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('a:has-text("取込ファイル一覧")').first().click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});

    const bodyText = await page.innerText('body').catch(() => '');
    
    // 判定条件を「完了」だけで検知できるように少し緩和（「成功」の有無に関わらず安全に抜けるため）
    if (bodyText.includes('完了') || bodyText.includes('成功')) {
      console.log(`✅ 【${acc.name}】[${label}] 取込ステータス「完了」または「成功」を確認しました！`);
      return;
    } else {
      console.log(`⏳ 【${acc.name}】[${label}] まだ処理中のため、30秒待機します...`);
    }

    await page.waitForTimeout(30000); // 120秒から30秒へ短縮し効率化
    loopCount++;
  }
  
  throw new Error(`⚠️ 【${acc.name}】[${label}] 取込処理がタイムアウトしました。`);
}

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000); // 無限に待たないようデフォルトタイムアウトを設定

  page.on('dialog', async dialog => {
    console.log(`💬 【${acc.name}】ダイアログ検出: ${dialog.message()}`);
    await dialog.accept().catch(() => {});
  });

  try {
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    const listUrl = acc.url.replace('/login/', '/rec_recruitments').replace('rec_recruitments', 'export_files');
    await page.goto(listUrl, { waitUntil: 'networkidle' }).catch(() => {});
    
    const firstRow = page.locator('tr').nth(1);
    const firstRowText = await firstRow.innerText().catch(() => "");
    const timeMatchBefore = firstRowText.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/);
    const lastRequestTimeStr = timeMatchBefore ? timeMatchBefore[0] : "";
    console.log(`...`);

    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    console.log(`👉 【${acc.name}】上部メニューの矢印ボタンにマウスを乗せます...`);
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
    await menuHoverIcon.hover(); 
    await page.waitForTimeout(1500); 

    console.log(`👉 【${acc.name}】メニューから「取出ファイル一覧」をクリックします`);
    await page.locator('a:has-text("取出ファイル一覧")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    // CSV完成の監視ループ (無限ループ防止)
    console.log(`⏳ 【${acc.name}】CSV作成完了を監視します...`);
    const dates = getTargetDates();
    let loopCount = 1;
    const MAX_EXPORT_LOOPS = 20; // 最大20回（約10分）制限
    let finalDownloadLinkLocator = null;

    while (loopCount <= MAX_EXPORT_LOOPS) {
      const fullPageText = await page.innerText('body').catch(() => "");
      const rows = page.locator('tr');
      const rowCount = await rows.count().catch(() => 0);
      let foundTarget = false;

      for (let i = 1; i < rowCount; i++) {
        const rowText = await rows.nth(i).innerText().catch(() => "");

        if (rowText.includes(dates.matchTodayStr) && (rowText.includes("完了") || rowText.includes("成功")) && rowText.includes("rec_recruitments")) {
          const timeMatch = rowText.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/);
          if (timeMatch) {
            const currentIdxTimeStr = timeMatch[0];
            if (currentIdxTimeStr !== lastRequestTimeStr || i === 1) {
              console.log(`✅ 【${acc.name}】今回リクエストした完了CSV行を特定しました！ (日時: ${currentIdxTimeStr})`);
              finalDownloadLinkLocator = rows.nth(i).locator('a[href*="rec_recruitments"]').first();
              foundTarget = true;
              break;
            }
          }
        }
      }

      if (foundTarget) break;

      const progressMatch = fullPageText.match(/\d+\/\d+件出力中\s+残り約\d+分\d+秒/);
      const progressStr = progressMatch ? progressMatch[0] : (fullPageText.includes("進行中") ? "進行中" : "生成待ち...");
      console.log(`⏳ 【${acc.name}】CSV生成待ち... (ループ: ${loopCount}/${MAX_EXPORT_LOOPS}) / 状態: ${progressStr}`);

      await page.waitForTimeout(30000); // 120秒から30秒へ短縮

      const loopMenuIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
      await loopMenuIcon.hover().catch(() => {});
      await page.waitForTimeout(1000);
      await page.locator('a:has-text("取出ファイル一覧")').first().click({ force: true }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});

      loopCount++;
    }

    if (!finalDownloadLinkLocator) {
      throw new Error("❌ CSV生成がタイムアウト、または対象行が見つかりませんでした。");
    }

    console.log(`📥 最新CSVのダウンロードリンクを確認中...`);
    await finalDownloadLinkLocator.waitFor({ state: 'visible', timeout: 30000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 300000 });
    console.log(`📥 ダウンロードリンクをクリックします...`);
    await page.waitForTimeout(2000);
    await finalDownloadLinkLocator.click({ force: true });

    const download = await downloadPromise;
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);
    console.log(`💾 【${acc.name}】CSVダウンロード完了: ${downloadPath}`);

    const processed = processCSVFile(downloadPath, acc.name);
    if (!processed) throw new Error("CSVデータの加工に失敗しました。");

    console.log(`🔷 【${acc.name}】タスク① [通常版・非掲載] を開始`);
    await uploadCSVFile(page, acc, processed.normal.path1);
    await waitForImportSuccess(page, acc, '通常版・非掲載');

    console.log(`🔷 【${acc.name}】タスク② [通常版・掲載] を開始`);
    await uploadCSVFile(page, acc, processed.normal.path2);
    await page.waitForTimeout(5000); 
    
    console.log(`🔶 【${acc.name}】タスク③ [PV版・非掲載] を開始`);
    await uploadCSVFile(page, acc, processed.pv.path1);
    await waitForImportSuccess(page, acc, 'PV版・非掲載');

    console.log(`🔶 【${acc.name}】タスク④ [PV版・掲載] を開始`);
    await uploadCSVFile(page, acc, processed.pv.path2);
    await page.waitForTimeout(8000); 

    console.log(`🎉 【${acc.name}】全 4 タスクの工程が正常終了しました。`);

  } catch (error) {
    console.log(`❌ 【${acc.name}】例外エラーが発生: ${error.message}`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true }).catch(() => {});
    throw error; // エラーを上に投げて確実に検知させる
  } finally {
    await context.close(); 
  }
}

(async () => {
  const browser = await chromium.launch();
  console.log("🏁 4大タスク一括処理を開始します。");
  
  // GitHub Actionsでのゾンビ化を防ぐため、無限ループ(while(true))を撤廃し1回限りの実行に変更
  for (const acc of accounts) {
    console.log(`🚀 ==========================================`);
    console.log(`🚀 アカウント【${acc.name}】通常・PV（計4タスク）を開始`);
    console.log(`🚀 ==========================================`);
    
    try {
      await runLoginAndProcess(browser, acc);
    } catch (err) {
      console.log(`⚠️ アカウント【${acc.name}】でエラーが発生したため、スキップして次へ向かいます。`);
    }
    
    console.log(`💤 30秒間のインターバルを挟みます...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  console.log("🏁 全アカウントの処理工程が終了しました。ブラウザを閉じます。");
  await browser.close();
})();
