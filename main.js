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

// 📄 【共通】3990件のデータからパターン1とパターン2のCSVを生成するコア関数
function generatePatternFiles(headerLine, targetRows, basePath, accountName, label) {
  const idxA = colNameToIndex('A');
  const idxB = colNameToIndex('B');
  const idxC = colNameToIndex('C');
  const idxD = colNameToIndex('D');
  const idxK = colNameToIndex('K');

  // --- パターン1生成（2019/2020/非掲載） ---
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

  // --- パターン2生成（本日日付/10年先/掲載/K列ローテーション） ---
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

// ⚙️ CSVの全行程加工を振り分けるメイン関数
function processCSVFile(filePath, accountName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 【${accountName}】ファイルが見つかりません: ${filePath}`);
    return null;
  }

  console.log(`🛠️ 【${accountName}】CSVの加工処理を開始します...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) return null;

  const headerLine = lines[0]; // 1行目の項目名をそのまま維持
  const idxB = colNameToIndex('B');
  const idxGG = colNameToIndex('GG');
  const idxGH = colNameToIndex('GH');

  // 全行を配列にパース
  const allRows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(idxB, idxGG, idxGH)) continue;
    allRows.push(row);
  }

  // ==========================================
  // 処理A：【通常版】のフィルタ・ソートロジック
  // ==========================================
  const normalFiltered = allRows.filter(row => {
    const valGG = row[idxGG].replace(/"/g, '').trim();
    const valGH = row[idxGH].replace(/"/g, '').trim();
    // GG列が「0または空白以外」を削除 ＆ GH列が「0または空白」を削除
    if (valGG !== '0' && valGG !== '') return false;
    if (valGH === '0' || valGH === '') return false;
    return true;
  });

  // B列（開始日）の古い順（昇順）にソート
  normalFiltered.sort((x, y) => new Date(x[idxB].replace(/"/g, '').trim()) - new Date(y[idxB].replace(/"/g, '').trim()));
  const normalTargetRows = normalFiltered.slice(0, 3990);
  const normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');

  // ==========================================
  // 処理B：【PV版】のソートロジック
  // ==========================================
  // 1. GH列（閲覧数_SMARTPHONE）を降順（大きい順）にソート
  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH].replace(/"/g, '').trim()) || 0;
    const valY = parseFloat(y[idxGH].replace(/"/g, '').trim()) || 0;
    return valY - valX;
  });

  // 2. 上から必ず3990件を切り出し
  const pvSliced = pvSorted.slice(0, 3990);

  // 3. 残った3990件をB列（開始日）の古い順（昇順）に再ソート
  pvSliced.sort((x, y) => new Date(x[idxB].replace(/"/g, '').trim()) - new Date(y[idxB].replace(/"/g, '').trim()));
  const pvFiles = generatePatternFiles(headerLine, pvSliced, filePath, accountName, 'pv');

  return { normal: normalFiles, pv: pvFiles };
}

async function uploadCSVFile(page, acc, fileToUpload) {
  const importUrl = acc.url.replace('/login/', '/csv_import_queues');
  console.log(`👉 【${acc.name}】ファイル取込予約画面へ移動: ${importUrl}`);
  await page.goto(importUrl, { waitUntil: 'networkidle' }).catch(() => {});
  
  console.log(`📤 【${acc.name}】CSVファイル（${path.basename(fileToUpload)}）を選択中...`);
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await fileInput.setInputFiles(fileToUpload);
  
  const uploadBtn = page.locator('button:has-text("取込"), input[value*="取込"], button:has-text("保存"), .btn:has-text("実行")').first();
  await uploadBtn.click();
  
  console.log(`🚀 【${acc.name}】取込リクエスト送信完了。`);
  await page.waitForTimeout(8000);
}

async function waitForImportSuccess(page, acc, label) {
  const queueUrl = acc.url.replace('/login/', '/csv_import_queues');
  console.log(`👉 【${acc.name}】取込状況を確認するため一覧画面へ移動: ${queueUrl}`);
  await page.goto(queueUrl, { waitUntil: 'networkidle' });

  console.log(`⏳ 【${acc.name}】[${label}] 取込完了（ステータス: 完了 / 詳細: 成功）を無限待機中（画面自動更新待ち）...`);
  
  let loopCount = 1;
  while (true) { 
    await page.waitForTimeout(5000); // 画面自体の自動リフレッシュを邪魔しないよう5秒おきにテキストチェック
    const firstRowText = await page.locator('table tr').nth(1).innerText().catch(() => '');
    
    if (firstRowText.includes('完了') && firstRowText.includes('成功')) {
      console.log(`✅ 【${acc.name}】[${label}] 取込が正常に「完了・成功」しました！`);
      break;
    } else {
      if (loopCount % 6 === 0) {
        console.log(`⏳ 【${acc.name}】[${label}] 自動更新中... 取込完了を待っています。`);
      }
    }
    loopCount++;
  }
}

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(0); // 監視用：Playwrightのタイムアウトを完全無効化

  page.on('dialog', async dialog => {
    console.log(`💬 【${acc.name}】ダイアログ検出: ${dialog.message()}`);
    await dialog.accept();
  });

  try {
    // 1. ログイン
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    // 2. 募集管理（ファイル取出予約）※全求人ダウンロード
    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します（全求人対象）`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    // 3. 取出ファイル一覧で完了まで無限待機
    const queueUrl = acc.url.replace('/login/', '/csv_export_queues');
    await page.goto(queueUrl, { waitUntil: 'networkidle' });

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を無限待機中（画面自動更新待ち）...`);
    let loopCount = 1;
    while (true) {
      await page.waitForTimeout(5000);
      const rowText = await page.locator('table tr').nth(1).innerText().catch(() => '');
      if (rowText.includes('完了')) {
        console.log(`✅ 【${acc.name}】CSV抽出が「完了」しました！`);
        break;
      }
      if (loopCount % 6 === 0) {
        console.log(`⏳ 【${acc.name}】自動更新中... 抽出完了を待っています。`);
      }
      loopCount++;
    }

    // 4. CSVダウンロード
    const downloadLink = page.locator('table tr').nth(1).locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);

    // 5. データ内部加工（通常版2つ、PV版2つの計4つを一撃で作成）
    const processed = processCSVFile(downloadPath, acc.name);
    if (!processed) throw new Error("CSVデータの加工に失敗しました。");

    // ========================================================
    // 🔥 パターンA：1周で【4つのタスク】をすべて実行するメインフェーズ
    // ========================================================
    
    // 【タスク①】通常版：非掲載求人のアップロード
    console.log(`🔷 【${acc.name}】タスク① [通常版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path1);
    await waitForImportSuccess(page, acc, '通常版・非掲載');

    // 【タスク②】通常版：掲載求人のアップロード
    console.log(`🔷 【${acc.name}】タスク② [通常版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.normal.path2);
    await page.waitForTimeout(5000); // アップロード直後の安定用
    
    // 【タスク③】PV版：非掲載求人のアップロード
    console.log(`🔶 【${acc.name}】タスク③ [PV版・非掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path1);
    await waitForImportSuccess(page, acc, 'PV版・非掲載');

    // 【タスク④】PV版：掲載求人のアップロード
    console.log(`🔶 【${acc.name}】タスク④ [PV版・掲載] を開始します`);
    await uploadCSVFile(page, acc, processed.pv.path2);
    await page.waitForTimeout(8000); // 最後のアップロード完了を確実にする待機

    console.log(`🎉 【${acc.name}】通常版・PV版を含む全4タスクの工程が正常終了しました。`);

  } catch (error) {
    console.log(`⚠️ 【${acc.name}】処理中にエラーが発生: ${error.message}`);
    await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
  } finally {
    await context.close(); // セッション完全クローズ
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
