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
    if (val && (
      val.includes(',') ||
      val.includes('"') ||
      val.includes('\n') ||
      val.includes('\r')
    )) {
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

      if (partsB.length === 3) {
        row[idxB] = `2019/${partsB[1]}/${partsB[2]}`;
      }
    }

    if (row[idxC]) {
      const rawC = row[idxC].replace(/"/g, '').trim();
      const partsC = rawC.split('/');

      if (partsC.length === 3) {
        row[idxC] = `2020/${partsC[1]}/${partsC[2]}`;
      }
    }

    row[idxD] = '非掲載';

    return row;
  });


  const path1 = basePath.replace(
    '.csv',
    `_${label}_pattern1.csv`
  );

  const content1 = [
    headerLine,
    ...pattern1Rows.map(toCSVLine)
  ].join('\r\n');

  fs.writeFileSync(
    path1,
    iconv.encode(content1, 'Shift_JIS')
  );

  console.log(
    `✅ 【${accountName}】【${label}】パターン1 CSV保存完了(Shift_JIS): ${path1}`
  );


  const dates = getTargetDates();

  const pattern2BaseRows = targetRows.map(orgRow => {

    const row = [...orgRow];

    if (row[idxA]) {

      const currentA =
        row[idxA].replace(/"/g, '').trim();

      row[idxA] =
        currentA.replace(
          /(RB\d{3})\d{8}/,
          `$1${dates.flatToday}`
        );
    }

    row[idxB] = dates.hyphenToday;
    row[idxC] = dates.future10Years;
    row[idxD] = '掲載';

    return row;
  });


  if (pattern2BaseRows.length > 1) {

    const lastKValue =
      pattern2BaseRows[
        pattern2BaseRows.length - 1
      ][idxK];

    for (
      let i = pattern2BaseRows.length - 1;
      i > 0;
      i--
    ) {
      pattern2BaseRows[i][idxK] =
        pattern2BaseRows[i - 1][idxK];
    }

    pattern2BaseRows[0][idxK] = lastKValue;

    console.log(
      `🔄 【${accountName}】【${label}】K列（募集職種）のローテーション完了。`
    );
  }


  const path2 = basePath.replace(
    '.csv',
    `_${label}_pattern2.csv`
  );

  const content2 = [
    headerLine,
    ...pattern2BaseRows.map(toCSVLine)
  ].join('\r\n');

  fs.writeFileSync(
    path2,
    iconv.encode(content2, 'Shift_JIS')
  );

  console.log(
    `✅ 【${accountName}】【${label}】パターン2 CSV保存完了(Shift_JIS): ${path2}`
  );


  return {
    path1,
    path2
  };
}
// Part2

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

  const { headerLine, rows: allRows } =
    parseCSVContentRobust(content);

  if (allRows.length === 0) return null;


  const normalFiltered = allRows.filter(row => {

    const valGG = row[idxGG]
      ? row[idxGG].replace(/"/g, '').trim()
      : '';

    const valGH = row[idxGH]
      ? row[idxGH].replace(/"/g, '').trim()
      : '';

    const isBothActive =
      (valGG !== '0' && valGG !== '') &&
      (valGH !== '0' && valGH !== '');

    return !isBothActive;
  });


  normalFiltered.sort((x, y) => {

    const dateX = x[idxB]
      ? x[idxB].replace(/"/g, '').trim()
      : '';

    const dateY = y[idxB]
      ? y[idxB].replace(/"/g, '').trim()
      : '';

    return new Date(dateX) - new Date(dateY);
  });


  const normalTargetRows =
    normalFiltered.slice(0, 3990);


  const normalFiles =
    generatePatternFiles(
      headerLine,
      normalTargetRows,
      filePath,
      accountName,
      'normal'
    );


  const pvSorted = [...allRows].sort((x, y) => {

    const valX = parseFloat(
      x[idxGH]
        ? x[idxGH].replace(/"/g, '').trim()
        : 0
    ) || 0;

    const valY = parseFloat(
      y[idxGH]
        ? y[idxGH].replace(/"/g, '').trim()
        : 0
    ) || 0;

    return valY - valX;
  });


  const pvSliced =
    pvSorted.slice(0, 3990);


  pvSliced.sort((x, y) => {

    const dateX = x[idxB]
      ? x[idxB].replace(/"/g, '').trim()
      : '';

    const dateY = y[idxB]
      ? y[idxB].replace(/"/g, '').trim()
      : '';

    return new Date(dateX) - new Date(dateY);
  });


  const pvFiles =
    generatePatternFiles(
      headerLine,
      pvSliced,
      filePath,
      accountName,
      'pv'
    );


  return {
    normal: normalFiles,
    pv: pvFiles
  };
}



async function navigateViaMenuOrUrl(
  page,
  acc,
  targetText,
  targetUrlSegment
) {

  try {

    const menuHoverIcon =
      page.locator(
        'li:has(a:has-text("面接カレンダー")) + li, ul.nav-tabs li:nth-child(5), .nav-tabs li a:has(img), li:has(.fa-refresh)'
      ).first();


    if (await menuHoverIcon.count() > 0) {

      await menuHoverIcon.hover();

      await page.waitForTimeout(1000);


      const subMenuLink =
        page.locator(
          `a:has-text("${targetText}")`
        ).first();


      if (
        await subMenuLink.count() > 0 &&
        await subMenuLink.isVisible()
      ) {

        await subMenuLink.click();

        await page.waitForLoadState(
          'networkidle'
        ).catch(() => {});

        return;
      }
    }

  } catch (err) {

  }


  const destinationUrl =
    acc.url.replace(
      '/login/',
      `/${targetUrlSegment}`
    );


  await page.goto(
    destinationUrl,
    {
      waitUntil: 'networkidle'
    }
  ).catch(() => {});


  await page.waitForTimeout(1500);
}




async function uploadSingleFileOnly(
  page,
  acc,
  fileToUpload,
  label
) {

  console.log(
    `👉 【${acc.name}】[${label}] 募集一覧画面へ移動します...`
  );


  const recruitUrl =
    acc.url.replace(
      '/login/',
      '/rec_recruitments'
    );


  await page.goto(
    recruitUrl,
    {
      waitUntil: 'domcontentloaded'
    }
  ).catch(() => {});



  console.log(
    `👉 【${acc.name}】[${label}] 『ファイル取込予約』ボタンをクリックしてポップアップを開きます...`
  );


  const openModalBtn =
    page.locator(
      'a:has-text("ファイル取込予約")'
    ).first();


  await openModalBtn.waitFor(
    {
      state: 'visible',
      timeout: 10000
    }
  );


  await openModalBtn.click(
    {
      force: true
    }
  );


  await page.waitForTimeout(2000);



  console.log(
    `📤 【${acc.name}】[${label}] アップロード要素を探索中...`
  );


  let targetInput = null;
  let activeFrame = null;


  const mainInput =
    page.locator(
      'input[type="file"]'
    ).first();


  if (
    await mainInput.count() > 0
  ) {

    targetInput = mainInput;

  } else {


    const frames =
      page.frames();


    for (
      const frame of frames
    ) {

      const frameInput =
        frame.locator(
          'input[type="file"]'
        ).first();


      if (
        await frameInput.count() > 0
      ) {

        targetInput = frameInput;
        activeFrame = frame;


        console.log(
          `💡 【${acc.name}】[${label}] iframe内で input[type="file"] を検出しました。`
        );


        break;
      }
    }
  }


  if (targetInput) {

    await targetInput.setInputFiles(
      fileToUpload
    );


    console.log(
      `✅ 【${acc.name}】[${label}] input要素へのファイル注入に成功しました。`
    );

  }


  await page.waitForTimeout(1500);


  console.log(
    `🚀 【${acc.name}】[${label}] 青色の『ファイル取込予約』実行ボタンを確定します...`
  );


  let targetClickBtn = null;


  const targetContext =
    activeFrame || page;


  const universalSelectors = [

    ':text("ファイル取込予約")',

    'a:has-text("ファイル取込予約")',

    '[class*="btn"]:has-text("ファイル取込予約")',

    'div:has-text("ファイル取込予約")',

    'button:has-text("ファイル取込予約")'

  ];


  for (
    const selector of universalSelectors
  ) {

    const el =
      targetContext.locator(selector).last();


    if (
      await el.count() > 0
    ) {

      targetClickBtn = el;

      break;
    }
  }


  if (!targetClickBtn) {

    throw new Error(
      "❌ 青い『ファイル取込予約』ボタンを画面上から特定できませんでした。"
    );
  }


  await targetClickBtn.click(
    {
      force: true,
      timeout: 15000
    }
  );


  console.log(
    `🚀 【${acc.name}】[${label}] クリックイベントの送信完了。`
  );


  await page.waitForTimeout(30000);
}
 // Part3

async function downloadAndPrepareCSV(browser, acc) {

  const context = await browser.newContext({
    viewport: {
      width: 1280,
      height: 800
    }
  });

  const page = await context.newPage();

  page.setDefaultTimeout(0);


  page.on('dialog', async dialog => {

    console.log(
      `💬 【${acc.name}】ダイアログ検出: ${dialog.message()}`
    );

    await dialog.accept();

  });



  try {


    await page.goto(
      acc.url,
      {
        waitUntil: 'networkidle'
      }
    );


    await page.locator(
      'input[type="text"], input[type="email"], input[name*="login"]'
    ).first().fill(acc.id);


    await page.locator(
      'input[type="password"]'
    ).first().fill(acc.password);


    await page.locator(
      'button, input[type="submit"], .btn, a:has-text("ログイン")'
    ).first().click();


    await page.waitForLoadState(
      'networkidle'
    ).catch(() => {});



    const recruitUrl =
      acc.url.replace(
        '/login/',
        '/rec_recruitments'
      );


    await page.goto(
      recruitUrl,
      {
        waitUntil: 'networkidle'
      }
    );



    console.log(
      `👉 【${acc.name}】「ファイル取出予約」を実行します（全求人対象）`
    );


    const exportBtn =
      page.locator(
        'a:has-text("ファイル取出予約"), button:has-text("ファイル取出予約")'
      ).first();


    await exportBtn.waitFor(
      {
        state: 'visible',
        timeout: 30000
      }
    );


    await exportBtn.click(
      {
        force: true
      }
    );


    await page.waitForTimeout(8000);



    const historySegment =
      acc.name === 'B'
        ? "csv_export_queues"
        : "rec_export_histories";


    console.log(
      `👉 【${acc.name}】「取出ファイル一覧」画面へ移動します... (${historySegment})`
    );


    await navigateViaMenuOrUrl(
      page,
      acc,
      "取出ファイル一覧",
      historySegment
    );



    console.log(
      `⏳ 【${acc.name}】CSV抽出の完了を監視中...`
    );


    const watchStartTime = Date.now();

    let lastLogTime = 0;



    while (true) {


      await page.waitForTimeout(1000);



      const rows =
        await page.locator(
          'table tr, .table tr, tbody tr'
        ).all();



      let statusText = "";
      let detailText = "";
      let isDataLoaded = false;



      if (rows.length > 1) {


        const latestRow = rows[1];


        const rowText =
          (
            await latestRow.textContent()
          || ""
          ).replace(/\s+/g, " ").trim();



        if (rowText) {


          isDataLoaded = true;


          const cells =
            await latestRow.locator('td').all();



          if (cells.length >= 3) {


            statusText =
              (
                await cells[2].textContent()
              || ""
              ).replace(/\s+/g, " ").trim();


          }


          if (cells.length >= 4) {


            detailText =
              (
                await cells[3].textContent()
              || ""
              ).replace(/\s+/g, " ").trim();

          } else {

            detailText = rowText;

          }

        }

      }



      const now =
        Date.now();



      // 10秒ごとに必ず進捗表示

      if (
        now - lastLogTime >= 10000
      ) {


        lastLogTime = now;



        let progressText = detailText;



        const match =
          detailText.match(
            /(\d+)\s*\/\s*(\d+)件/
          );



        if (match) {


          const current =
            Number(match[1]);


          const total =
            Number(match[2]);



          const percent =
            (
              current / total * 100
            ).toFixed(1);



          const elapsed =
            (
              Date.now() - watchStartTime
            ) / 1000;



          const totalTime =
            elapsed / current * total;



          const remain =
            Math.max(
              0,
              totalTime - elapsed
            );



          const min =
            Math.floor(
              remain / 60
            );


          const sec =
            Math.floor(
              remain % 60
            );



          progressText =
            `${current}/${total}件出力中 残り約${min}分${sec}秒 (${percent}%)`;

        }



        console.log(
          `⏳ 【${acc.name}】状態:[${statusText}] ${progressText}`
        );


      }



      const cleanStatus =
        statusText.replace(/\s+/g, "");



      const cleanDetail =
        detailText.replace(/\s+/g, "");



      if (
        cleanStatus.includes("キャンセル") ||
        cleanDetail.includes("キャンセル")
      ) {

        throw new Error(
          "管理画面側でリクエストがキャンセルされました"
        );

      }



      // 待機中 → 進行中 → 完了

      const isCompleted =
        cleanStatus.includes("完了") ||
        cleanStatus.includes("成功") ||
        cleanDetail.includes("rec_recruitments") ||
        cleanDetail.includes(".csv");



      if (
        isDataLoaded &&
        isCompleted
      ) {


        console.log(
          `✅ 【${acc.name}】CSV生成完了を確認しました`
        );


        break;

      }



      const refreshBtn =
        page.locator(
          'a:has-text("最新を表示する"), button:has-text("最新を表示する"), .btn:has-text("最新を表示する"), a:has-text("更新"), button:has-text("更新")'
        ).first();



      if (
        await refreshBtn.count() > 0
      ) {

        await refreshBtn.click(
          {
            force: true
          }
        ).catch(() => {});

      }


    }



    console.log(
      `👉 【${acc.name}】ダウンロードリンク確認`
    );


    await page.waitForTimeout(2000);



    const downloadLink =
      page.locator(
        'a[href*=".csv"], a:has-text("ダウンロード")'
      ).first();



    if (
      await downloadLink.count() === 0
    ) {

      throw new Error(
        "CSVダウンロードリンクがありません"
      );

    }



    const [download] =
      await Promise.all([

        page.waitForEvent(
          'download'
        ),

        downloadLink.click(
          {
            force:true
          }
        )

      ]);



    const downloadPath =
      path.join(
        __dirname,
        `${acc.name}_raw_data.csv`
      );



    await download.saveAs(
      downloadPath
    );



    console.log(
      `✅ 【${acc.name}】RAWデータ保存完了`
    );



    const processed =
      processCSVFile(
        downloadPath,
        acc.name
      );



    return {
      page,
      context,
      processed
    };

  } catch(error) {


    console.log(
      `⚠️ 【${acc.name}】準備処理中エラー: ${error.message}`
    );


    await context.close();


    throw error;

  }

}
