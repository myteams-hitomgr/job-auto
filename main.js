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

async function navigateViaMenuOrUrl(page, acc, targetText, targetUrlSegment) {
  try {
    const menuHoverIcon = page.locator('li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)').first();
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
  } catch (err) {
    // ホバー失敗時は安全策として直URL遷移
  }
  const destinationUrl = acc.url.replace('/login/', `/${targetUrlSegment}`);
  await page.goto(destinationUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
}

// =========================================================
// 【新方式】修正版：input[type="file"]へのダイレクト注入方式
// =========================================================
async function uploadAndWatchSingleFile(page, acc, fileToUpload, label) {
  // ① 募集一覧画面へ移動
  console.log(`👉 【${acc.name}】[${label}] 募集一覧画面へ移動します...`);
  const recruitUrl = acc.url.replace('/login/', '/rec_recruitments');
  await page.goto(recruitUrl, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  // ② 『ファイル取込予約』ボタンをクリックしてモーダルを展開
  console.log(`👉 【${acc.name}】[${label}] 『ファイル取込予約』ボタンをクリックしてポップアップを開きます...`);
  const openModalBtn = page.locator('a:has-text("ファイル取込予約")').first();
  await openModalBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openModalBtn.click({ force: true });
  
  // モーダル展開およびinput要素配置の安定化を待機
  await page.waitForTimeout(3000);

  // ③ 隠れている input[type="file"] を捕捉してファイルを直接セットする
  console.log(`📤 【${acc.name}】[${label}] ファイル（${path.basename(fileToUpload)}）を直接セット中...`);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 10000 }); // DOM上に存在すればhiddenでもOK
  await fileInput.setInputFiles(fileToUpload);
  await page.waitForTimeout(2000);

  // ④ 青色の『ファイル取込予約』実行ボタンをクリック
  console.log(`🚀 【${acc.name}】[${label}] 青色の『ファイル取込予約』実行ボタンをクリックします...`);
  
  // モーダル（ポップアップ）内のフッターや特定のコンテナにある確定ボタンを優先的にターゲット
  const doUploadBtn = page.locator('.modal-footer button:has-text("ファイル取込予約"), #cboxLoadedContent button:has-text("ファイル取込予約"), div[class*="modal"] button:has-text("ファイル取込予約")').first();
  
  if (await doUploadBtn.count() === 0) {
    await page.locator('button:has-text("ファイル取込予約")').last().click({ force: true });
  } else {
    await doUploadBtn.click({ force: true });
  }
  
  console.log(`🚀 【${acc.name}】[${label}] 取込リクエスト送信完了。安全のため8秒待機します。`);
  await page.waitForTimeout(8000);

  // ⑤ 上部メニューの矢印から『取込ファイル一覧』画面へ移動
  console.log(`👉 【${acc.name}】[${label}] メニューの矢印から『取込ファイル一覧』へ移動します...`);
  await navigateViaMenuOrUrl(page, acc, "取込ファイル一覧", "rec_import_histories");

  // ⑥ ステータスが「完了」になるまでその場で監視ループ
  console.log(`⏳ 【${acc.name}】[${label}] 取込完了（ステータス: 完了...）を監視中...`);
  let loopCount = 1;
  while (true) { 
    await page.waitForTimeout(10000); // 10秒チェック

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
      if (cells.length >= 5) {
        const dateCell = await cells[0].evaluate(el => el.textContent || "");
        if (dateCell.includes('2026') || dateCell.includes('/') || dateCell.includes(':')) {
          statusText = await cells[4].evaluate(el => el.textContent || ""); // ステータス列
          detailText = await cells[5].evaluate(el => el.textContent || ""); // 詳細列
          break;
        }
      }
    }

    // 「完了」状態になったらループを抜け、次のファイルへ進む
    if (statusText.includes('完了') && (detailText.includes('成功') || detailText.includes('一部エラーあり'))) {
      console.log(`✅ 【${acc.name}】[${label}] 取込が正常に「${statusText.trim()}（${detailText.trim()}）」となりました。完了です！`);
      break;
    } else {
      if (loopCount % 3 === 0) {
        console.log(`⏳ 【${acc.name}】[${label}] 処理の完了を待っています... 現在の状態: [${statusText.trim()}] [${detailText.trim()}]`);
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
    // -------------------------------------------------------
    // 【前半：旧方式】ログイン ➔ 取出 ➔ 待記・ダウンロード ➔ 自動編集
    // -------------------------------------------------------
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
      throw new Error("CSVのダウンロードリンクを特定できませんでした。");
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

    // -------------------------------------------------------
    // 【後半：新方式】完全に1点ずつ「取込 ➔ 完了」を待って、次のファイルへ進む
    // -------------------------------------------------------
    
    // 【1枚目】 通常版：非掲載
    await uploadAndWatchSingleFile(page, acc, processed.normal.path1, '①通常版・非掲載');

    // 【2枚目】 通常版：掲載
    await uploadAndWatchSingleFile(page, acc, processed.normal.path2, '②通常版・掲載');
    
    // 【3枚目】 PV版：非掲載
    await uploadAndWatchSingleFile(page, acc, processed.pv.path1, '③PV版・非掲載');

    // 【4枚目】 PV版：掲載
    await uploadAndWatchSingleFile(page, acc, processed.pv.path2, '④PV版・掲載');

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
