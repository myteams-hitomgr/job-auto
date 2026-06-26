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
  console.log(`👉 【${acc.name}】取込状況を確認するため、メニューの矢印から「取込ファイル一覧」を再開きます...`);
  const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
  await menuHoverIcon.hover();
  await page.waitForTimeout(1500);
  await page.locator('a:has-text("取込ファイル一覧")').first().click();
  await page.waitForLoadState('networkidle').catch(() => {});

  console.log(`⏳ 【${acc.name}】[${label}] 取込完了（ステータス: 完了 / 詳細: 成功）を監視中...`);
  
  let loopCount = 1;
  while (true) { 
    await page.waitForTimeout(5000); 

    const rows = await page.locator('table tr').all();
    let statusText = "";
    let detailText = "";

    for (const row of rows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 4) {
        const firstCellText = await cells[0].evaluate(el => el.textContent || "");
        if (firstCellText.includes('2026') || firstCellText.includes('/') || firstCellText.includes(':')) {
          statusText = await cells[2].evaluate(el => el.textContent || "");
          detailText = await cells[3].evaluate(el => el.textContent || "");
          break;
        }
      }
    }

    if (statusText.includes('完了') && detailText.includes('成功')) {
      console.log(`✅ 【${acc.name}】[${label}] 取込が正常に「完了・成功」しました！`);
      break;
    } else {
      if (loopCount % 6 === 0) {
        console.log(`⏳ 【${acc.name}】[${label}] 画面の自動更新を待ちながら、完了ステータスを確認中... 現在の状態: [${statusText.trim()}] ${detailText.trim()}`);
      }
    }
    loopCount++;
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
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
    await menuHoverIcon.hover(); 
    await page.waitForTimeout(1500); 

    console.log(`👉 【${acc.name}】メニューから「取出ファイル一覧」をクリックします`);
    await page.locator('a:has-text("取出ファイル一覧")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中（有効なデータ行をスマートスキャン）...`);
    let loopCount = 1;

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
        throw new Error(`管理画面側でリクエストが「キャンセル」されました。履歴を確認してください。`);
      }

      if (statusText.includes('完了') || statusText.includes('成功') || detailText.includes('rec_recruitments')) {
        console.log(`✅ 【${acc.name}】最新の取出行でCSVの生成完了を確認しました！`);
        break;
      }
      
      if (loopCount % 6 === 0) {
        const displayStatus = statusText.trim() || "読み込み中";
        const displayDetail = detailText.trim() || "...";
        console.log(`⏳ 【${acc.name}】自動更新を待ちながら生成状況をチェック中... 現在の状態: [${displayStatus}] ${displayDetail}`);
      }
      loopCount++;
    }

    // 【大幅改善】DOM失効によるStaleエラーを防ぐため、ループ脱出後に最新のテーブルから「最初のデータ行」のダウンロードリンクを毎回ダイレクトに捕捉します
    console.log(`👉 【${acc.name}】ダウンロード用リンクを安全に再スキャン中...`);
    await page.waitForTimeout(2000); // 念のためリンクがDOMに描画されるのを2秒待つ
    
    const finalRows = await page.locator('table tr').all();
    let downloadLink = null;
    
    for (const row of finalRows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 4) {
        const dateText = await cells[0].evaluate(el => el.textContent || "");
        if (dateText.includes('2026') || dateText.includes('/') || dateText.includes(':')) {
          // 条件を満たす最初のデータ行の中にあるダウンロードリンクを直接取得
          downloadLink = row.locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
          break;
        }
      }
    }

    if (!downloadLink) {
      throw new Error("CSVのダウンロードリンクを再特定できませんでした。");
    }

    // リンクが表示されるのを待ってクリック
    await downloadLink.waitFor({ state: 'visible', timeout: 15000 });
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);

    // ⭐ ここで保存されたCSVに対して、ファイルの加工・編集処理（processCSVFile）が自動実行されます
    const processed = processCSVFile(downloadPath, acc.name);
    if (!processed) throw new Error("CSVデータの加工に失敗しました。");

    console.log(`🔷 【${acc.name}】タスク① [通常版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path1);
    await waitForImportSuccess(page, acc, '通常版・非掲載');

    console.log(`🔷 【${acc.name}】タスク② [通常版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path2);
    await page.waitForTimeout(5000); 
    
    console.log(`🔶 【${acc.name}】タスク③ [PV版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path1);
    await waitForImportSuccess(page, acc, 'PV版・非掲載');

    console.log(`🔶 【${acc.name}】タスク④ [PV版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path2);
    await page.waitForTimeout(8000); 

    console.log(`🎉 【${acc.name}】通常版・PV版を含む全4タスクの工程が正常終了しました。`);

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
