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

// 2026年対応のために修正（2026年であればそのままパース、無効なら現在日時）
function safeParseDate(dateStr) {
  const cleanStr = dateStr.replace(/"/g, '').trim();
  if (cleanStr.includes('#') || !cleanStr.includes('/')) {
    return new Date();
  }
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatProgress(current, total, startTime) {
  const elapsed = (Date.now() - startTime) / 1000;
  const percent = ((current / total) * 100).toFixed(1);

  if (current === 0) return `${current}/${total}件完了 (${percent}%)`;

  const estimatedTotalTime = (elapsed / current) * total;
  const remaining = Math.max(0, estimatedTotalTime - elapsed);

  const rMin = Math.floor(remaining / 60);
  const rSec = Math.floor(remaining % 60);

  return `${current}/${total}件出力中 残り約${rMin}分${rSec}秒 (${percent}%)`;
}

function generatePatternFiles(headerLine, targetRows, basePath, accountName, label) {
  const idxA = colNameToIndex('A');
  const idxB = colNameToIndex('B');
  const idxC = colNameToIndex('C');
  const idxD = colNameToIndex('D');
  const idxK = colNameToIndex('K');

  console.log(`⚙️ 【${accountName}】【${label}】パターン1データ生成を開始 (総数: ${targetRows.length}件)...`);
  const startTime = Date.now();

  const pattern1Rows = [];
  for (let i = 0; i < targetRows.length; i++) {
    const row = [...targetRows[i]];

    // インデックス安全ガード
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
    pattern1Rows.push(row);

    if ((i + 1) % 5000 === 0 || i === targetRows.length - 1) {
      console.log(`  📝 パターン1: ${formatProgress(i + 1, targetRows.length, startTime)}`);
    }
  }

  const path1 = basePath.replace('.csv', `_${label}_pattern1.csv`);
  const content1 = [headerLine, ...pattern1Rows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path1, iconv.encode(content1, 'Shift_JIS'));
  console.log(`✅ 【${accountName}】【${label}】パターン1 CSV保存完了(Shift_JIS): ${path1}`);

  console.log(`⚙️ 【${accountName}】【${label}】パターン2データ生成を開始...`);
  const dates = getTargetDates();
  const pattern2BaseRows = [];
  const startTime2 = Date.now();

  for (let i = 0; i < targetRows.length; i++) {
    const row = [...targetRows[i]];
    if (row[idxA]) {
      const currentA = row[idxA].replace(/"/g, '').trim();
      row[idxA] = currentA.replace(/(RB\d{3})\d{8}/, `$1${dates.flatToday}`);
    }
    row[idxB] = dates.hyphenToday;
    row[idxC] = dates.future10Years;
    row[idxD] = '掲載';
    pattern2BaseRows.push(row);

    if ((i + 1) % 5000 === 0 || i === targetRows.length - 1) {
      console.log(`  📝 パターン2: ${formatProgress(i + 1, targetRows.length, startTime2)}`);
    }
  }

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
  console.log(`📊 [デバッグ] ${accountName} RAWファイルサイズ: ${buffer.length} バイト`);

  const content = iconv.decode(buffer, 'Shift_JIS');
  console.log(`📊 [デバッグ] ${accountName} デコード後の文字数: ${content.length} 文字`);

  const lines = content.split(/\r?\n|\r/).filter(line => line.trim() !== '');
  console.log(`📊 [デバッグ] ${accountName} 分割後の総行数: ${lines.length} 行`);

  if (lines.length <= 1) {
    console.log(`⚠️ 【${accountName}】CSVの中身がヘッダーのみ、または空です。処理を中断します。`);
    return null;
  }

  const headerLine = lines[0];
  const headerCols = parseCSVLine(headerLine);
  console.log(`📊 [デバッグ] ${accountName} ヘッダー解析列数: ${headerCols.length} 列`);

  const idxB = colNameToIndex('B');
  const idxGG = colNameToIndex('GG');
  const idxGH = colNameToIndex('GH');
  const requiredMaxIndex = Math.max(idxB, idxGG, idxGH);

  console.log(`📊 [デバッグ] 処理に必要な最大インデックス: ${requiredMaxIndex} (GG列:${idxGG}, GH列:${idxGH})`);

  const allRows = [];
  let skippedByLengthCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length <= requiredMaxIndex) {
      skippedByLengthCount++;
      continue;
    }
    allRows.push(row);
  }

  if (skippedByLengthCount > 0) {
    console.log(`⚠️ [デバッグ] 列数不足により ${skippedByLengthCount} 行がスキップされました。`);
  }

  console.log(`📊 【${accountName}】有効データ数: ${allRows.length}件`);

  if (allRows.length === 0) {
    console.log(`❌ 【${accountName}】有効な求人データが0件のため、パターンファイルの生成をスキップします。`);
    return null;
  }

  // --- 通常版フィルタリング ---
  const normalFiltered = allRows.filter(row => {
    const valGG = row[idxGG] ? row[idxGG].replace(/"/g, '').trim() : '';
    const valGH = row[idxGH] ? row[idxGH].replace(/"/g, '').trim() : '';
    if (valGG === '0' || valGG === '') return false;
    if (valGH === '0' || valGH === '') return false;
    return true;
  });

  console.log(`📊 【${accountName}】通常絞り込み後: ${normalFiltered.length}件。並び替えを行います。`);

  let normalFiles = null;
  if (normalFiltered.length > 0) {
    normalFiltered.sort((x, y) => safeParseDate(x[idxB]) - safeParseDate(y[idxB]));
    const normalTargetRows = normalFiltered.slice(0, 3990);
    normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');
  } else {
    console.log(`⚠️ 【${accountName}】通常絞り込み条件に一致するデータが0件のため、normalパターン生成をスキップ。`);
  }

  // --- PV版フィルタリング ---
  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH].replace(/"/g, '').trim()) || 0;
    const valY = parseFloat(y[idxGH].replace(/"/g, '').trim()) || 0;
    return valY - valX;
  });

  const pvSliced = pvSorted.slice(0, 3990);
  pvSliced.sort((x, y) => safeParseDate(x[idxB]) - safeParseDate(y[idxB]));

  console.log(`📊 【${accountName}】PV版対象データ数: ${pvSliced.length}件。パターン生成を行います。`);
  const pvFiles = generatePatternFiles(headerLine, pvSliced, filePath, accountName, 'pv');

  return { normal: normalFiles, pv: pvFiles };
}

async function navigateViaMenuOrUrl(page, acc, targetText, targetUrlSegment) {
  try {
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li().nth(5), .nav-tabs li a img, li .fa-refresh').first();
    if (await menuHoverIcon.count() > 0) {
      await menuHoverIcon.hover();
      await page.waitForTimeout(1500);
      const subMenuLink = page.locator(`a:has-text("${targetText}")`).first();
      if (await subMenuLink.count() > 0 && await subMenuLink.isVisible()) {
        await subMenuLink.click();
        await page.waitForLoadState('networkidle').catch(() => {});
        return;
      }
    }
  } catch (err) {}
  const destinationUrl = acc.url.replace('/login/', `/${targetUrlSegment}`);
  await page.goto(destinationUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function waitImportLatestRow(page, acc, label, timeout = 20 * 60 * 1000) {
  const start = Date.now();

  while (true) {
    const result = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const dataRows = rows.filter(r => r.innerText.includes(':'));

      const latest = dataRows[dataRows.length - 1];
      if (!latest) return { status: 'not_found' };

      const text = latest.innerText;

      if (text.includes('完了') || text.includes('一部エラー') || text.includes('エラー')) {
        return { status: 'done', text };
      }

      return { status: 'processing', text };
    });

    console.log(`  🔍 【${acc.name}】[${label}]取込状態チェック中... 現在の状態: [${result.status}]`);

    if (result.status === 'done') {
      console.log(`  ✅ 【${acc.name}】[${label}] 取込完了を確認: ${result.text.trim().replace(/\s+/g, ' ')}`);
      return true;
    }

    if (Date.now() - start > timeout) {
      throw new Error(`取込処理がタイムアウト（${timeout / 60000}分）しました。`);
    }

    await page.waitForTimeout(10000);
    console.log(`  🔄 【${acc.name}】[${label}]ページをリロードして再確認します...`);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

async function uploadAndWatchSingleFile(page, acc, fileToUpload, label) {
  if (!fileToUpload || !fs.existsSync(fileToUpload)) {
    console.log(`⏭️ 【${acc.name}】[${label}]アップロード対象ファイルが存在しないためスキップします。`);
    return;
  }

  console.log(`🚀 【${acc.name}】[${label}]アップロード処理を開始...`);
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);

  console.log(` 🔹 【${acc.name}】[${label}]『ファイル取込予約』ポップアップを開きます...`);
  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openModalBtn.click({ force: true });

  await page.waitForTimeout(4000);

  console.log(` 📤 【${acc.name}】[${label}]アップロード要素を探索中...`);
  let targetInput = null;
  let activeFrame = null;

  const mainInput = page.locator('input[type="file"]').first();
  if (await mainInput.count() > 0) {
    targetInput = mainInput;
  } else {
    const frames = page.frames();
    for (const frame of frames) {
      const frameInput = frame.locator('input[type="file"]').first();
      if (await frameInput.count() > 0) {
        targetInput = frameInput;
        activeFrame = frame;
        break;
      }
    }
  }

  if (targetInput) {
    await targetInput.setInputFiles(fileToUpload);
    console.log(` 📂 【${acc.name}】[${label}]ファイルの選択に成功しました。`);
  } else {
    const customUploadBtn = page.locator('text=ファイルを選択, text=ファイル選択, button("選択"), .file-upload, .upload-area').first();
    if (await customUploadBtn.count() > 0) {
      await customUploadBtn.click({ force: true }).catch(() => {});
    }
    const retryInput = page.locator('input[type="file"]').first();
    if (await retryInput.count() > 0) {
      await retryInput.setInputFiles(fileToUpload).catch(() => {});
    }
  }

  await page.waitForTimeout(3000);

  console.log(` 👆 【${acc.name}】[${label}]青色の『ファイル取込予約』確定ボタンをクリックします...`);
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
    throw new Error("❌ 青い『ファイル取込予約』ボタンを特定できませんでした。");
  }

  await targetClickBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await targetClickBtn.click({ force: true, timeout: 15000 });

  await page.waitForTimeout(5000);

  try {
    await page.waitForFunction(() => {
      return document.body.innerText.includes('取込ファイル一覧') && !window.location.href.includes('rec_recruitments');
    }, { timeout: 30000 });
  } catch (moveErr) {
    const historyUrl = acc.url.replace('/login/', '/rec_import_histories');
    await page.goto(historyUrl, { waitUntil: 'networkidle' }).catch(() => {});
  }

  console.log(` 📄 【${acc.name}】[${label}]『取込ファイル一覧』画面へ同期しました。`);
  await waitImportLatestRow(page, acc, label);
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
    console.log(`🌐 【${acc.name}】ログインページへアクセス中...`);
    await page.goto(acc.url, { waitUntil: 'networkidle' });
    await page.locator('input[type="text"], input[type="email"], input[name*="login"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], .btn, a:has-text("ログイン")').first().click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log(`🏃 【${acc.name}】求人一覧画面へ移動中...`);
    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    console.log(`👉 【${acc.name}】「ファイル取出予約」を実行します（全求人対象）`);
    const exportBtn = page.locator('a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    console.log(`📡 【${acc.name}】「取出ファイル一覧」へ移動しています...`);
    await navigateViaMenuOrUrl(page, acc, "取出ファイル一覧", "rec_export_histories");

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中...`);
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
        throw new Error(`管理画面側でリクエストが「キャンセル」されました。`);
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

    console.log(`👉 【${acc.name}】ダウンロードリンクを捕捉中...`);
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
      throw new Error("CSVのダウンロードリンクを特定できませんでした。");
    }

    console.log(`📥 【${acc.name}】CSVファイルをダウンロード中... (大容量のため1〜5分ほど反応が止まるように見えますが正常です)`);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 0 }),
      downloadLink.click({ force: true })
    ]);

    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);
    console.log(`💾 【${acc.name}】RAWデータのダウンロード・保存に成功しました！`);

    const processed = processCSVFile(downloadPath, acc.name);

    if (!processed) {
      console.log(`⏭️ 【${acc.name}】有効データが取得できなかったため、取込アップロード工程をスキップして終了します。`);
      return;
    }

    if (processed.normal) {
      await uploadAndWatchSingleFile(page, acc, processed.normal.path1, '①通常版・非掲載');
      await uploadAndWatchSingleFile(page, acc, processed.normal.path2, '②通常版・掲載');
    }
    if (processed.pv) {
      await uploadAndWatchSingleFile(page, acc, processed.pv.path1, '③PV版・非掲載');
      await uploadAndWatchSingleFile(page, acc, processed.pv.path2, '④PV版・掲載');
    }

    console.log(`🎉 【${acc.name}】通常版・PV版を含む全タスクの工程が正常終了しました。`);
  } catch (error) {
    console.log(`⚠️ 【${acc.name}】処理中にエラーが発生: ${error.message}`);
    try {
      await page.screenshot({ path: `error_${acc.name}.png`, fullPage: true });
    } catch (e) {}
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  console.log("🏁 4大タスク一括・交互連続ループを開始します。(停止は Ctrl+C)");

  while (true) {
    for (const acc of accounts) {
      console.log("🚀 ==========================================");
      console.log(`🚀 アカウント【${acc.name}】通常・PV（計4タスク）を開始`);
      console.log("🚀 ==========================================");

      try {
        await runLoginAndProcess(browser, acc);
      } catch (err) {
        console.log(`⚠️ アカウント【${acc.name}】で例外エラー。次のアカウントへリレーします。`);
      }

      console.log("💤 セッション競合防止のため、30秒間のインターバルを挟みます...");
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
})();
