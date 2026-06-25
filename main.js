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
  const now = new Date(); // 2026年ベース
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  
  return {
    hyphenToday: `${yyyy}/${now.getMonth() + 1}/${now.getDate()}`,
    flatToday: `${yyyy}${mm}${dd}`,
    future10Years: `${yyyy + 10}/${now.getMonth() + 1}/${now.getDate()}`
  };
}

function processCSVFile(filePath, accountName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 【${accountName}】ファイルが見つかりません: ${filePath}`);
    return { path1: null, path2: null };
  }

  console.log(`🛠️ 【${accountName}】CSVの加工処理を開始します...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) return { path1: null, path2: null };

  const headerLine = lines[0];
  const idxA = colNameToIndex('A');
  const idxB = colNameToIndex('B');
  const idxC = colNameToIndex('C');
  const idxD = colNameToIndex('D');
  const idxK = colNameToIndex('K');
  const idxGG = colNameToIndex('GG');
  const idxGH = colNameToIndex('GH');

  const filteredRows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(idxB, idxGG, idxGH)) continue;

    const valGG = row[idxGG].replace(/"/g, '');
    const valGH = row[idxGH].replace(/"/g, '');

    if (valGG !== '0' && valGG !== '') continue;
    if (valGH === '0' || valGH === '') continue;

    filteredRows.push(row);
  }

  filteredRows.sort((rowX, rowY) => {
    return new Date(rowX[idxB].replace(/"/g, '')) - new Date(rowY[idxB].replace(/"/g, ''));
  });

  const targetRows = filteredRows.slice(0, 3990);

  // パターン1生成（2019/2020/非掲載）
  const pattern1Rows = targetRows.map(orgRow => {
    const row = [...orgRow];
    const dateB = new Date(row[idxB].replace(/"/g, ''));
    if (!isNaN(dateB.getTime())) {
      row[idxB] = `2019/${dateB.getMonth() + 1}/${dateB.getDate()}`;
    }
    const dateC = new Date(row[idxC].replace(/"/g, ''));
    if (!isNaN(dateC.getTime())) {
      row[idxC] = `2020/${dateC.getMonth() + 1}/${dateC.getDate()}`;
    }
    row[idxD] = '非掲載';
    return row;
  });

  const path1 = filePath.replace('.csv', '_pattern1.csv');
  fs.writeFileSync(path1, [headerLine, ...pattern1Rows.map(toCSVLine)].join('\n'), 'utf8');
  console.log(`✅ 【${accountName}】パターン1 CSVを保存完了: ${path1}`);

  // パターン2生成（本日日付/10年先/掲載/K列ローテーション）
  const dates = getTargetDates();
  const pattern2BaseRows = targetRows.map(orgRow => {
    const row = [...orgRow];
    const currentA = row[idxA].replace(/"/g, '');
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
    console.log(`🔄 【${accountName}】K列（募集職種）のローテーション完了。`);
  }

  const path2 = filePath.replace('.csv', '_pattern2.csv');
  fs.writeFileSync(path2, [headerLine, ...pattern2BaseRows.map(toCSVLine)].join('\n'), 'utf8');
  console.log(`✅ 【${accountName}】パターン2 CSVを保存完了: ${path2}`);

  return { path1, path2 };
}

// 📤 取込予約へのアップロードを実行する関数
async function uploadCSVFile(page, acc, fileToUpload) {
  const importUrl = acc.url.replace('/login/', '/csv_import_queues');
  console.log(`👉 【${acc.name}】ファイル取込予約画面へ移動します: ${importUrl}`);
  await page.goto(importUrl, { waitUntil: 'networkidle' }).catch(() => {});
  
  console.log(`📤 【${acc.name}】CSVファイル（${path.basename(fileToUpload)}）を選択中...`);
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await fileInput.setInputFiles(fileToUpload);
  
  const uploadBtn = page.locator('button:has-text("取込"), input[value*="取込"], button:has-text("保存"), .btn:has-text("実行")').first();
  await uploadBtn.click();
  
  console.log(`🚀 【${acc.name}】取込リクエストを送信しました。`);
  await page.waitForTimeout(8000);
}

// ⏳ 🌟 取込予約一覧画面で「完了」かつ「成功」になるまで30秒おきに監視する関数
async function waitForImportSuccess(page, acc) {
  const queueUrl = acc.url.replace('/login/', '/csv_import_queues');
  console.log(`👉 【${acc.name}】取込状況を確認するため一覧画面へ移動します: ${queueUrl}`);
  await page.goto(queueUrl, { waitUntil: 'networkidle' });

  console.log(`⏳ 【${acc.name}】取込バッチの完了（ステータス: 完了 / 詳細: 成功）を監視中...`);
  let isImportCompleted = false;
  
  for (let i = 0; i < 120; i++) { // 最大60分間ループ
    const refreshBtn = page.locator('button:has-text("最新を表示する"), a:has-text("最新を表示する"), .btn:has-text("最新")').first();
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
    } else {
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    }
    await page.waitForTimeout(3000);

    // テーブルの1行目（最新のインポートレコード）を取得
    const firstRowText = await page.locator('table tr').nth(1).innerText().catch(() => '');
    
    // 画像の仕様に合わせ、「完了」かつ「成功」が含まれているか判定
    if (firstRowText.includes('完了') && firstRowText.includes('成功')) {
      console.log(`✅ 【${acc.name}】取込が正常に成功したことを画面で確認しました！`);
      console.log(`📋 確認データ内容: ${firstRowText.replace(/\s+/g, ' ')}`);
      isImportCompleted = true;
      break;
    } else {
      console.log(`⏳ 【${acc.name}】取込中... 30秒後に再確認します (${i + 1}/120)`);
    }
    
    await page.waitForTimeout(30000); // 仕様通り30秒待機
  }

  if (!isImportCompleted) {
    throw new Error("取込処理が時間内に『成功』ステータスになりませんでした。");
  }
}

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log(`💬 【${acc.name}】ダイアログ検出: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // 1. ログイン
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    const idInput = page.locator('input[type="text"], input[type="email"], input[name*="login"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await idInput.fill(acc.id);
    await passwordInput.fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    // 2. 募集管理（ファイル取出予約）
    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    // 3. 取出ファイル一覧で完了待機
    const queueUrl = acc.url.replace('/login/', '/csv_export_queues');
    await page.goto(queueUrl, { waitUntil: 'networkidle' });

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を待機中...`);
    let isCompleted = false;
    for (let i = 0; i < 100; i++) {
      const refreshBtn = page.locator('button:has-text("最新を表示する"), a:has-text("最新を表示する")').first();
      if (await refreshBtn.isVisible()) await refreshBtn.click();
      else await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(3000);

      const rowText = await page.locator('table tr').nth(1).innerText().catch(() => '');
      if (rowText.includes('完了')) {
        console.log(`✅ 【${acc.name}】CSV抽出が「完了」しました！`);
        isCompleted = true;
        break;
      }
      await page.waitForTimeout(30000);
    }

    if (!isCompleted) throw new Error("抽出タイムアウトしました。");

    // 4. CSVダウンロード
    const downloadLink = page.locator('table tr').nth(1).locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);

    // 5. データ内部加工
    const processedFiles = processCSVFile(downloadPath, acc.name);

    // 6. パターン1（非掲載化）ファイルをアップロード
    if (processedFiles.path1) {
      await uploadCSVFile(page, acc, processedFiles.path1);
    }

    // ⏳ 7. 取込予約一覧画面に移動し、30秒間隔で「完了：成功」になるまで完全監視
    await waitForImportSuccess(page, acc);

    // 8. パターン2（本日日付・掲載化・K列ローテーション）ファイルをアップロード
    if (processedFiles.path2) {
      console.log(`🔄 【${acc.name}】パターン1成功を確認したため、続いてパターン2をアップロードします。`);
      await uploadCSVFile(page, acc, processedFiles.path2);
    }

    console.log(`🎉 【${acc.name}】の全工程が正常終了しました。`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】エラー: ${error.message}`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  
  // Aアカウントの完全終了を待ってからBアカウントを開始（直列リレー）
  for (const acc of accounts) {
    console.log(`🚀 ==========================================`);
    console.log(`🚀 アカウント【${acc.name}】の処理を開始します`);
    console.log(`🚀 ==========================================`);
    try {
      await runLoginAndProcess(browser, acc);
    } catch (err) {
      console.log(`⚠️ アカウント【${acc.name}】でエラーが発生しました。次のアカウントへ移ります。`);
    }
  }

  await browser.close();
  console.log("🏁 すべての処理を終了しました。");
})();
