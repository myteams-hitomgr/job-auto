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

// 日付文字列を安全にパースするヘルパー（### 対策）
function safeParseDate(dateStr) {
  const cleanStr = dateStr.replace(/"/g, '').trim();
  if (cleanStr.includes('#') || !cleanStr.includes('/')) {
    return new Date();
  }
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

// 💡 ここに進捗表示（残り時間計算）のロジックを復活させました！
function formatProgress(current, total, startTime) {
  const elapsed = (Date.now() - startTime) / 1000; // 経過秒数
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

  console.log(`⏳ 【${accountName}】【${label}】パターン1・2のデータ作成を開始します... (総数: ${targetRows.length}件)`);
  const startTime = Date.now();

  // パターン1の作成と進捗表示
  const pattern1Rows = [];
  for (let i = 0; i < targetRows.length; i++) {
    const row = [...targetRows[i]];
    const rawB = row[idxB].replace(/"/g, '').trim();
    const partsB = rawB.split('/');
    if (partsB.length === 3) row[idxB] = `2019/${partsB[1]}/${partsB[2]}`;
    
    const rawC = row[idxC].replace(/"/g, '').trim();
    const partsC = rawC.split('/');
    if (partsC.length === 3) row[idxC] = `2020/${partsC[1]}/${partsC[2]}`;
    
    row[idxD] = '非掲載';
    pattern1Rows.push(row);

    // 5000件ごとに進捗を出す
    if ((i + 1) % 5000 === 0 || i === targetRows.length - 1) {
      console.log(` 📝 パターン1加工: ${formatProgress(i + 1, targetRows.length, startTime)}`);
    }
  }

  const path1 = basePath.replace('.csv', `_${label}_pattern1.csv`);
  const content1 = [headerLine, ...pattern1Rows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path1, iconv.encode(content1, 'Shift_JIS'));

  // パターン2の作成と進捗表示
  const dates = getTargetDates();
  const pattern2BaseRows = [];
  const startTime2 = Date.now();

  for (let i = 0; i < targetRows.length; i++) {
    const row = [...targetRows[i]];
    const currentA = row[idxA].replace(/"/g, '').trim();
    row[idxA] = currentA.replace(/(RB\d{3})\d{8}/, `$1${dates.flatToday}`);
    row[idxB] = dates.hyphenToday;
    row[idxC] = dates.future10Years;
    row[idxD] = '掲載';
    pattern2BaseRows.push(row);

    if ((i + 1) % 5000 === 0 || i === targetRows.length - 1) {
      console.log(` 📝 パターン2加工: ${formatProgress(i + 1, targetRows.length, startTime2)}`);
    }
  }

  if (pattern2BaseRows.length > 1) {
    const lastKValue = pattern2BaseRows[pattern2BaseRows.length - 1][idxK];
    for (let i = pattern2BaseRows.length - 1; i > 0; i--) {
      pattern2BaseRows[i][idxK] = pattern2BaseRows[i - 1][idxK];
    }
    pattern2BaseRows[0][idxK] = lastKValue;
  }

  const path2 = basePath.replace('.csv', `_${label}_pattern2.csv`);
  const content2 = [headerLine, ...pattern2BaseRows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path2, iconv.encode(content2, 'Shift_JIS'));

  console.log(`✅ 【${accountName}】【${label}】ファイル保存完了。`);
  return { path1, path2 };
}

function processCSVFile(filePath, accountName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ 【${accountName}】ファイルが見つかりません: ${filePath}`);
    return null;
  }

  console.log(`🛠️ 【${accountName}】元のCSVを解析中...`);
  
  const buffer = fs.readFileSync(filePath);
  const content = iconv.decode(buffer, 'Shift_JIS');
  
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) return null;

  const headerLine = lines[0];
  const idxB = colNameToIndex('B');
  const idxGH = colNameToIndex('GH');

  const allRows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < Math.max(idxB, idxGH)) continue;
    allRows.push(row);
  }

  console.log(`📊 総データ数: ${allRows.length}件。並び替えと絞り込みを行います。`);

  const normalFiltered = [...allRows];
  normalFiltered.sort((x, y) => {
    const dateX = safeParseDate(x[idxB]);
    const dateY = safeParseDate(y[idxB]);
    return dateX - dateY;
  });
  const normalTargetRows = normalFiltered.slice(0, 3990);
  const normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');

  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH].replace(/"/g, '').trim()) || 0;
    const valY = parseFloat(y[idxGH].replace(/"/g, '').trim()) || 0;
    return valY - valX;
  });

  const pvSliced = pvSorted.slice(0, 3990);
  pvSliced.sort((x, y) => {
    const dateX = safeParseDate(x[idxB]);
    const dateY = safeParseDate(y[idxB]);
    return dateX - dateY;
  });
  const pvFiles = generatePatternFiles(headerLine, pvSliced, filePath, accountName, 'pv');

  return { normal: normalFiles, pv: pvFiles };
}

async function navigateViaMenuOrUrl(page, acc, targetText, targetUrlSegment) {
  try {
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5)').first();
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

    console.log(`🔍 【${acc.name}】[${label}] 取込状態確認中... [${result.status}]`);
    if (result.status === 'done') return true;
    if (Date.now() - start > timeout) throw new Error("タイムアウトしました。");
    await page.waitForTimeout(10000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

async function uploadAndWatchSingleFile(page, acc, fileToUpload, label) {
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(3000);

  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openModalBtn.click({ force: true });
  await page.waitForTimeout(4000);

  let targetInput = null;
  let activeFrame = null; 
  const mainInput = page.locator('input[type="file"]').first();
  if (await mainInput.count() > 0) {
    targetInput = mainInput;
  } else {
    for (const frame of page.frames()) {
      const frameInput = frame.locator('input[type="file"]').first();
      if (await frameInput.count() > 0) {
        targetInput = frameInput;
        activeFrame = frame; 
        break;
      }
    }
  }

  if (targetInput) await targetInput.setInputFiles(fileToUpload);
  await page.waitForTimeout(3000);

  let targetClickBtn = null;
  const targetContext = activeFrame || page;
  const universalSelectors = [':text("ファイル取込予約")', 'a:has-text("ファイル取込予約")', '[class*="btn"]:has-text("ファイル取込予約")'];
  for (const selector of universalSelectors) {
    const el = targetContext.locator(selector).last();
    if (await el.count() > 0) { targetClickBtn = el; break; }
  }

  if (!targetClickBtn) throw new Error("❌ ボタン特定不可");
  await targetClickBtn.click({ force: true });
  await page.waitForTimeout(5000);

  try {
    await page.waitForFunction(() => {
      return document.body.innerText.includes('取込ファイル一覧') && !window.location.href.includes('rec_recruitments');
    }, { timeout: 30000 });
  } catch (moveErr) {
    const historyUrl = acc.url.replace('/login/', '/rec_import_histories');
    await page.goto(historyUrl, { waitUntil: 'networkidle' }).catch(() => {});
  }

  await waitImportLatestRow(page, acc, label);
}

async function runLoginAndProcess(browser, acc) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(0); 
  page.on('dialog', async d => await d.accept());

  try {
    await page.goto(acc.url, { waitUntil: 'networkidle' }); 
    await page.locator('input[type="text"], input[type="email"]').first().fill(acc.id);
    await page.locator('input[type="password"]').first().fill(acc.password);
    await page.locator('button, input[type="submit"], a:has-text("ログイン")').first().click();

    const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
    await page.goto(recruitUrl, { waitUntil: 'networkidle' });

    const exportBtn = page.locator('a:has-text("ファイル取出予約")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    await exportBtn.click({ force: true });
    await page.waitForTimeout(8000);

    await navigateViaMenuOrUrl(page, acc, "取出ファイル一覧", "rec_export_histories");

    console.log(`⏳ 【${acc.name}】CSV抽出の完了を監視中...`);
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

      if (statusText.includes('完了') || statusText.includes('成功') || detailText.includes('rec_recruitments')) {
        console.log(`✅ 【${acc.name}】CSVの生成完了を確認しました！`);
        break;
      }
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    await page.waitForTimeout(2000); 
    const finalRows = await page.locator('table tr').all();
    let downloadLink = null;
    
    for (const row of finalRows) {
      const cells = await row.locator('td').all();
      if (cells.length >= 4) {
        const dateText = await cells[0].evaluate(el => el.textContent || "");
        if (dateText.includes('2026') || dateText.includes('/') || dateText.includes(':')) {
          downloadLink = row.locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
          break;
        }
      }
    }

    if (!downloadLink) throw new Error("DLリンク特定不可");
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click({ force: true })]);
    
    const downloadPath = path.join(__dirname, `${acc.name}_raw_data.csv`);
    await download.saveAs(downloadPath);

    const processed = processCSVFile(downloadPath, acc.name);
    if (!processed) throw new Error("加工失敗");

    await uploadAndWatchSingleFile(page, acc, processed.normal.path1, '①通常版・非掲載');
    await uploadAndWatchSingleFile(page, acc, processed.normal.path2, '②通常版・掲載');
    await uploadAndWatchSingleFile(page, acc, processed.pv.path1, '③PV版・非掲載');
    await uploadAndWatchSingleFile(page, acc, processed.pv.path2, '④PV版・掲載');

  } catch (error) {
    console.log(`⚠️ エラー: ${error.message}`);
  } finally {
    await context.close(); 
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const acc of accounts) {
    await runLoginAndProcess(browser, acc);
    await new Promise(r => setTimeout(r, 30000));
  }
  await browser.close();
  console.log("🎉 すべて完了しました");
})();
