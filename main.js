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

// 💡 日付文字列を安全にパースするヘルパー（### 対策）
function safeParseDate(dateStr) {
  const cleanStr = dateStr.replace(/"/g, '').trim();
  // 万が一セルの幅不足などで変な文字列になっていた場合のフォールバック
  if (cleanStr.includes('#') || !cleanStr.includes('/')) {
    return new Date(); // 本日の日付で代用してエラー落ちを防ぐ
  }
  const d = new Date(cleanStr);
  return isNaN(d.getTime()) ? new Date() : d;
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
  const content1 = [headerLine, ...pattern1Rows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path1, iconv.encode(content1, 'Shift_JIS'));
  console.log(`✅ 【${accountName}】【${label}】パターン1 保存完了: ${path1}`);

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
  }

  const path2 = basePath.replace('.csv', `_${label}_pattern2.csv`);
  const content2 = [headerLine, ...pattern2BaseRows.map(toCSVLine)].join('\r\n');
  fs.writeFileSync(path2, iconv.encode(content2, 'Shift_JIS'));
  console.log(`✅ 【${accountName}】【${label}】パターン2 保存完了: ${path2}`);

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

  // 💡 0件スキップの厳しい絞り込みを完全に無くし、すべての行を対象にします
  const normalFiltered = [...allRows];

  // 💡 ### 対策を施した安全なソート処理
  normalFiltered.sort((x, y) => {
    const dateX = safeParseDate(x[idxB]);
    const dateY = safeParseDate(y[idxB]);
    return dateX - dateY;
  });
  const normalTargetRows = normalFiltered.slice(0, 3990);
  const normalFiles = generatePatternFiles(headerLine, normalTargetRows, filePath, accountName, 'normal');

  // PV数順ソート
  const pvSorted = [...allRows].sort((x, y) => {
    const valX = parseFloat(x[idxGH].replace(/"/g, '').trim()) || 0;
    const valY = parseFloat(y[idxGH].replace(/"/g, '').trim()) || 0;
    return valY - valX;
  });

  const pvSliced = pvSorted.slice(0, 3990);
  // 開始日順に再ソート（### 対策付き）
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

    console.log(`🔍 【${acc.name}】[${label}] 状態チェック中... [${result.status}]`);
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
    await page.goto(acc.url, { waitUntil: 'networkidle'); 
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

    while (true) {
      await page.waitForTimeout(5000);
      const rows = await page.locator('table tr').all();
      let statusText = "";
      if (rows.length > 1) {
        const cells = await rows[1].locator('td').all();
        if (cells.length >= 3) statusText = await cells[2].evaluate(el => el.textContent || "");
      }
      if (statusText.includes('完了') || statusText.includes('成功')) break;
    }

    await page.waitForTimeout(2000); 
    const finalRows = await page.locator('table tr').all();
    let downloadLink = null;
    if (finalRows.length > 1) {
      downloadLink = finalRows[1].locator('a[href*=".csv"], a:has-text("ダウンロード")').first();
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
    await new Promise(r => setTimeout(r, 15000));
  }
  await browser.close();
  console.log("🎉 すべて完了しました");
})();
