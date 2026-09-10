// ============================================================
// 案件管理ツール（発注書）- GASテンプレート
// ============================================================
// 【使い方】
// 1. 新しいGoogleスプレッドシートを作成する
// 2. メニュー「拡張機能」→「Apps Script」を開く
// 3. デフォルトで入っているコードを全部消し、このファイルの中身を
//    全部貼り付けて保存する（フロッピーアイコン、またはCtrl+S）
// 4. 右上の「デプロイ」→「新しいデプロイ」をクリック
//    - 種類の選択：歯車アイコン→「ウェブアプリ」
//    - 説明：任意（例：発注書2026）
//    - 次のユーザーとして実行：自分
//    - アクセスできるユーザー：全員
//    →「デプロイ」をクリック
// 5. 初回のみ権限の承認を求められるので許可する
//    （「このアプリは Google で確認されていません」と出た場合は
//     「詳細」→「安全ではないページに移動」で進めて問題ありません。
//     これはGoogle公式の審査を受けていない個人のスクリプトを
//     実行する際に必ず表示される、Google側の定型的な確認です。
//     コードの中身はこのファイルで全文確認できます。
//     「エラー 401: invalid_client」が表示された場合は、
//     そのエラー画面を閉じてから、もう一度「アクセスを承認」を
//     押し直すと解消することがあります）
// 6. スプレッドシートを開き直すと「設定」「登録リスト」タブが
//    自動的に作られます。まず「設定」タブに自社名などを入力してください
//    （自社名は必須、他の項目は未入力でも初期値のまま動きます）。
//    「登録リスト」タブに部署名候補・担当者一覧（担当者名/電話/メール）を
//    入力しておくと、発注書作成フォームで選択できるようになります
// 7. 表示された「ウェブアプリのURL」を、発注書ツール（ホーム画面）の
//    接続設定に貼り付ける。社内で使う全員が同じURLを使います
//
// コードを更新した場合は、既存のデプロイに対して
// 「デプロイを管理」→「新バージョン」で反映させてください
// （コードの保存だけでは、公開中のURLには反映されません）。
//
// 発注書の作成・自動転記はこのツール（HTML）から行います。
// 「到着（会社への荷受）」「受渡（担当者への引き渡し）」の記録は、
// ツール（HTML）の「一覧」画面の「到着待ち（荷受チェック）」
// 「受渡待ち（受渡チェック）」タブからワンクリックで行えます。
// スプレッドシートを直接編集する必要はありません。
//
// 見積書ツールとは完全に独立した別のスプレッドシート・別のウェブアプリ
// として運用します（データの自動連携はありません）。
// ============================================================

const SHEET_CONFIG = '設定';
const SHEET_LISTS = '登録リスト';
const SHEET_HEADER = '発注ヘッダー';
const SHEET_DETAIL = '発注明細';

const HEADER_COLS = ['書類番号', '発行日', '取引先名', '先方担当者名', '自社名', '部署名', '担当者名', '連絡先', '納品場所', '支払条件', '備考', 'フリー項目値', '初回印刷日時'];
const DETAIL_COLS = ['書類番号', '行番号', '品番', '品名', '数量', '単価', '税率', '金額', '納期', '着荷日', '受渡日'];

const H = {};
HEADER_COLS.forEach(function (c, i) { H[c] = i; });
const D = {};
DETAIL_COLS.forEach(function (c, i) { D[c] = i; });

// [項目, 初期値, 説明]
const CONFIG_DEFAULTS = [
  ['自社名', '', '発注書に印字される発行者名（必須）'],
  ['部署名入力方式', '自由入力', '「自由入力」または「選択式」。選択式の場合は登録リストタブの部署名候補から選びます'],
  ['フリー項目ラベル', '備考2', '⑦の追加項目のラベル名（例：プロジェクトキー）。入力欄は自由入力（過去の入力値を候補表示）です'],
  ['フリー項目印字有無', '印字する', '「印字する」または「印字しない」。社内管理用に記録だけして客先向け書類には出さない場合は「印字しない」'],
  ['書類番号prefix', 'P', '例：P-202609-001 のように使われます（見積・発注で別々に設定）'],
  ['デフォルト税率(%)', '10', '明細行の税率欄に入る初期値（行ごとに上書き可）'],
  ['消費税端数処理', '四捨五入', '「切り捨て」「切り上げ」「四捨五入」のいずれか。税率ごとの小計に対して1回だけ適用します'],
  ['支払条件デフォルト値', '', '発注書作成フォームの支払条件欄に自動入力する文言（空欄可。例：納品後月末締め翌月末払い）'],
  ['受渡待ち滞留日数のしきい値', '1', '到着（着荷日）からこの日数以上経過しても担当者へ受渡されていない品目を、「受渡待ち（受渡チェック）」タブで強調表示します']
];

// ---------------- エントリーポイント ----------------

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'ping') return jsonOut({ ok: true });
    if (action === 'getInitData') return jsonOut(getInitData());
    if (action === 'getDashboardData') return jsonOut(getDashboardData());
    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'submitOrder') return jsonOut(submitOrder(body));
    if (action === 'checkPrint') return jsonOut(checkPrint(body));
    if (action === 'markArrived') return jsonOut(markArrived(body));
    if (action === 'markHandedOver') return jsonOut(markHandedOver(body));
    if (action === 'undoMark') return jsonOut(undoMark(body));
    return jsonOut({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  ensureSheetsExist();
  SpreadsheetApp.getUi().createMenu('案件管理ツール（発注）')
    .addItem('🔄 データ検証・書式を再設定', 'reapplyValidation')
    .addToUi();
}

// ---------------- 初期化 ----------------

function ensureSheetsExist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureConfigSheet_(ss);
  ensureListsSheet_(ss);
  ensureHeaderSheet_(ss);
  ensureDetailSheet_(ss);
}

function ensureConfigSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_CONFIG);
  if (sh) {
    syncConfigDefaults_(sh);
    applyConfigValidation_(sh);
    return sh;
  }
  sh = ss.insertSheet(SHEET_CONFIG);
  sh.setFrozenRows(2);
  sh.getRange(1, 1, 1, 3).merge().setValue('👇「値」列を入力してください（自社名は必須、他は空欄のままでも初期値で動きます）').setFontWeight('bold').setFontColor('#ffffff');
  sh.getRange(1, 1, 1, 3).setBackground('#2563eb');
  sh.getRange(2, 1, 1, 3).setValues([['項目', '値', '説明']]).setFontWeight('bold');
  sh.getRange(2, 1, 1, 3).setBackground('#e2e5ea');
  sh.getRange(3, 1, CONFIG_DEFAULTS.length, 3).setValues(CONFIG_DEFAULTS);
  sh.getRange(3, 3, CONFIG_DEFAULTS.length, 1).setFontColor('#6b7280').setWrap(true);
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 420);
  applyConfigValidation_(sh);
  return sh;
}

// 既存の「設定」タブに対し、CONFIG_DEFAULTSにあってシートにまだ無い項目だけを
// 末尾に追記する（コード更新でCONFIG_DEFAULTSに項目が増えた場合の反映用）。
// 既存の値は一切上書きしない
function syncConfigDefaults_(sh) {
  const last = sh.getLastRow();
  const existing = {};
  if (last >= 3) {
    sh.getRange(3, 1, last - 2, 1).getValues().forEach(function (r) {
      if (r[0]) existing[String(r[0]).trim()] = true;
    });
  }
  const missing = CONFIG_DEFAULTS.filter(function (row) { return !existing[row[0]]; });
  if (missing.length === 0) return;
  const startRow = Math.max(last, 2) + 1;
  sh.getRange(startRow, 1, missing.length, 3).setValues(missing);
  sh.getRange(startRow, 3, missing.length, 1).setFontColor('#6b7280').setWrap(true);
}

// 項目名（列Aの実際のラベル文字列）から行番号を探す。
// CONFIG_DEFAULTSの配列インデックスをそのまま行番号に使うと、既存シートに
// 後から項目を追記した際の並び順のズレで誤った行に書式を適用しかねないため、
// 常にラベル文字列で照合する
function findConfigRow_(sh, key) {
  const last = sh.getLastRow();
  if (last < 3) return -1;
  const labels = sh.getRange(3, 1, last - 2, 1).getValues();
  for (let i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === key) return i + 3;
  }
  return -1;
}

// 選択式の項目は「値」列にプルダウン（データ検証）を設定し、
// 誤字での入力ミスを防ぐ
function applyConfigValidation_(sh) {
  const CONFIG_CHOICES = {
    '部署名入力方式': ['自由入力', '選択式'],
    'フリー項目印字有無': ['印字する', '印字しない'],
    '消費税端数処理': ['切り捨て', '切り上げ', '四捨五入']
  };
  Object.keys(CONFIG_CHOICES).forEach(function (key) {
    const rowNum = findConfigRow_(sh, key);
    if (rowNum === -1) return;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG_CHOICES[key], true).setAllowInvalid(false).build();
    sh.getRange(rowNum, 2).setDataValidation(rule);
  });

  // 数値のみを求める項目："10%"のような単位付き文字入力をデータ検証で拒否しつつ、
  // 表示形式（カスタム書式）で単位を自動表示し、単位を手入力する動機自体を減らす
  const CONFIG_NUMBER_FIELDS = {
    'デフォルト税率(%)': '%',
    '受渡待ち滞留日数のしきい値': '日'
  };
  Object.keys(CONFIG_NUMBER_FIELDS).forEach(function (key) {
    const rowNum = findConfigRow_(sh, key);
    if (rowNum === -1) return;
    const cell = sh.getRange(rowNum, 2);
    const rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build();
    cell.setDataValidation(rule);
    cell.setNumberFormat('0"' + CONFIG_NUMBER_FIELDS[key] + '"');
  });
}

function ensureListsSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_LISTS);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET_LISTS);
  sh.setFrozenRows(2);
  sh.getRange(1, 1, 1, 5).merge().setValue('👇 部署名候補・担当者一覧を入力してください（発注書作成フォームの選択肢になります）').setFontWeight('bold').setFontColor('#ffffff');
  sh.getRange(1, 1, 1, 5).setBackground('#2563eb');
  sh.getRange(2, 1).setValue('部署名候補').setFontWeight('bold');
  sh.getRange(2, 3, 1, 3).setValues([['担当者名', '電話', 'メール']]).setFontWeight('bold');
  sh.getRange(2, 1, 1, 5).setBackground('#e2e5ea');
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 24);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 200);
  return sh;
}

function ensureHeaderSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_HEADER);
  if (!sh) {
    sh = ss.insertSheet(SHEET_HEADER);
    sh.setFrozenRows(1);
  }
  sh.getRange(1, 1, 1, HEADER_COLS.length).setValues([HEADER_COLS]).setFontWeight('bold');
  sh.getRange(1, 1, 1, HEADER_COLS.length).setBackground('#e2e5ea');
  return sh;
}

function ensureDetailSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_DETAIL);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DETAIL);
    sh.setFrozenRows(1);
  }
  sh.getRange(1, 1, 1, DETAIL_COLS.length).setValues([DETAIL_COLS]).setFontWeight('bold');
  sh.getRange(1, 1, 1, DETAIL_COLS.length).setBackground('#e2e5ea');
  applyDetailAlertFormat_(sh);
  return sh;
}

function colLetter_(colNum1based) {
  let s = '', n = colNum1based;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 納期超過（納期が過ぎている＋未着荷）を発注明細シート上でハイライトする。
// 発注明細は納期・着荷日とも同一シート内にあるため、見積書のような
// 別シート参照の回避策（参照列）は不要でシンプルに完結する。
function applyDetailAlertFormat_(sh) {
  // 固定行数（2000行等）を指定すると、新規作成直後でまだ行数が少ないシートで
  // 「範囲がシートの最大行数を超えている」エラーになるため、実際の最大行数を使う
  const lastRow = Math.max(sh.getMaxRows(), 2);
  const range = sh.getRange(2, 1, lastRow - 1, DETAIL_COLS.length);
  const dueCol = '$' + colLetter_(D['納期'] + 1) + '2';
  const arrivedCol = '$' + colLetter_(D['着荷日'] + 1) + '2';
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(' + dueCol + '<>"",' + dueCol + '<TODAY(),' + arrivedCol + '="")')
    .setBackground('#fce8e6')
    .setRanges([range])
    .build();
  sh.setConditionalFormatRules([rule]);
}

// ---------------- 設定・登録リストの読み出し ----------------

function getConfigMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureConfigSheet_(ss);
  const last = sh.getLastRow();
  const map = {};
  if (last >= 3) {
    const vals = sh.getRange(3, 1, last - 2, 2).getValues();
    vals.forEach(function (r) { if (r[0]) map[String(r[0]).trim()] = r[1]; });
  }
  return map;
}

function getConfig_() {
  const m = getConfigMap_();
  function s(key, def) {
    const v = m[key];
    return (v === undefined || v === null || v === '') ? def : String(v);
  }
  return {
    companyName: s('自社名', ''),
    deptMode: s('部署名入力方式', '自由入力'),
    freeLabel: s('フリー項目ラベル', '備考2'),
    freePrint: s('フリー項目印字有無', '印字する'),
    prefix: s('書類番号prefix', 'P'),
    taxDefault: Number(s('デフォルト税率(%)', '10')) || 10,
    roundMode: s('消費税端数処理', '四捨五入'),
    termsDefault: s('支払条件デフォルト値', ''),
    staleDays: Number(s('受渡待ち滞留日数のしきい値', '1')) || 1
  };
}

function getLists_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureListsSheet_(ss);
  const last = sh.getLastRow();
  const depts = [];
  const staff = [];
  if (last >= 3) {
    const vals = sh.getRange(3, 1, last - 2, 5).getValues();
    vals.forEach(function (r) {
      if (r[0]) depts.push(String(r[0]));
      if (r[2]) staff.push({ name: String(r[2]), tel: r[3] ? String(r[3]) : '', email: r[4] ? String(r[4]) : '' });
    });
  }
  return { depts: depts, staff: staff };
}

// ---------------- 作成フォーム用の初期データ ----------------

function getInitData() {
  ensureSheetsExist();
  const config = getConfig_();
  const lists = getLists_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hSh = ss.getSheetByName(SHEET_HEADER);
  const hLast = hSh.getLastRow();
  const clients = {};
  const freeValues = {};
  if (hLast >= 2) {
    const vals = hSh.getRange(2, 1, hLast - 1, HEADER_COLS.length).getValues();
    vals.forEach(function (r) {
      const c = r[H['取引先名']]; if (c) clients[String(c)] = true;
      const f = r[H['フリー項目値']]; if (f) freeValues[String(f)] = true;
    });
  }
  return {
    ok: true,
    config: config,
    depts: lists.depts,
    staff: lists.staff,
    clients: Object.keys(clients).sort(),
    freeValues: Object.keys(freeValues).sort()
  };
}

// ---------------- 書類番号の採番 ----------------

function generateDocNo_(prefix) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_HEADER);
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const ym = Utilities.formatDate(new Date(), tz, 'yyyyMM');
  const base = prefix + '-' + ym + '-';
  let maxSeq = 0;
  const last = sh.getLastRow();
  if (last >= 2) {
    const vals = sh.getRange(2, H['書類番号'] + 1, last - 1, 1).getValues();
    vals.forEach(function (r) {
      const v = String(r[0] || '');
      if (v.indexOf(base) === 0) {
        const seq = parseInt(v.slice(base.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }
  const next = maxSeq + 1;
  return base + ('000' + next).slice(-3);
}

function parseDate_(str) {
  if (!str) return '';
  const parts = String(str).split('-');
  if (parts.length !== 3) return '';
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d);
}

// ---------------- 発注書の登録（自動転記） ----------------

// body = {
//   action:'submitOrder', client, clientContact, dept, staff, deliveryPlace, terms, memo, freeValue,
//   items:[{pin, name, qty, unitPrice, taxRate, dueDate, memo}, ...]
// }
function submitOrder(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    ensureSheetsExist();
    const config = getConfig_();
    const lists = getLists_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hSh = ss.getSheetByName(SHEET_HEADER);
    const dSh = ss.getSheetByName(SHEET_DETAIL);
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';

    const docNo = generateDocNo_(config.prefix);
    const now = new Date();

    let contact = '';
    const staffMatch = lists.staff.filter(function (s) { return s.name === body.staff; })[0];
    if (staffMatch) contact = [staffMatch.tel, staffMatch.email].filter(Boolean).join(' / ');

    const headerRow = [];
    headerRow[H['書類番号']] = docNo;
    headerRow[H['発行日']] = now;
    headerRow[H['取引先名']] = body.client || '';
    headerRow[H['先方担当者名']] = body.clientContact || '';
    headerRow[H['自社名']] = config.companyName;
    headerRow[H['部署名']] = body.dept || '';
    headerRow[H['担当者名']] = body.staff || '';
    headerRow[H['連絡先']] = contact;
    headerRow[H['納品場所']] = body.deliveryPlace || '';
    headerRow[H['支払条件']] = body.terms || '';
    headerRow[H['備考']] = body.memo || '';
    headerRow[H['フリー項目値']] = body.freeValue || '';
    headerRow[H['初回印刷日時']] = '';

    hSh.getRange(hSh.getLastRow() + 1, 1, 1, HEADER_COLS.length).setValues([headerRow]);
    const hRowNum = hSh.getLastRow();
    hSh.getRange(hRowNum, H['発行日'] + 1).setNumberFormat('yyyy-mm-dd');

    const items = body.items || [];
    const rows = items.map(function (it, i) {
      const qty = Number(it.qty) || 0;
      const price = Number(it.unitPrice) || 0;
      const amount = qty * price;
      const row = [];
      row[D['書類番号']] = docNo;
      row[D['行番号']] = i + 1;
      row[D['品番']] = it.pin || '';
      row[D['品名']] = it.name || '';
      row[D['数量']] = qty;
      row[D['単価']] = price;
      row[D['税率']] = Number(it.taxRate) || 0;
      row[D['金額']] = amount;
      row[D['納期']] = parseDate_(it.dueDate);
      row[D['着荷日']] = '';
      row[D['受渡日']] = '';
      return row;
    });

    if (rows.length > 0) {
      const startRow = dSh.getLastRow() + 1;
      dSh.getRange(startRow, 1, rows.length, DETAIL_COLS.length).setValues(rows);
      applyDetailValidation_(dSh, startRow, rows.length);
    }

    return { ok: true, docNo: docNo, issueDate: Utilities.formatDate(now, tz, 'yyyy-MM-dd'), spreadsheetUrl: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function applyDetailValidation_(sh, startRow, numRows) {
  sh.getRange(startRow, D['納期'] + 1, numRows, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(startRow, D['着荷日'] + 1, numRows, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(startRow, D['受渡日'] + 1, numRows, 1).setNumberFormat('yyyy-mm-dd');
}

// ---------------- 二重発注防止（初回印刷日時の記録） ----------------

// body = { action:'checkPrint', docNo:'P-202609-001' }
// 初回：印刷日時を記録して { alreadyPrinted:false } を返す
// 2回目以降：記録済みの日時を上書きせず { alreadyPrinted:true, printedAt } を返す
function checkPrint(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hSh = ss.getSheetByName(SHEET_HEADER);
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
    const last = hSh.getLastRow();
    if (last < 2) return { ok: false, error: '書類が見つかりません' };
    const vals = hSh.getRange(2, 1, last - 1, HEADER_COLS.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i][H['書類番号']] === body.docNo) {
        const rowNum = i + 2;
        const existing = vals[i][H['初回印刷日時']];
        if (existing) {
          return { ok: true, alreadyPrinted: true, printedAt: Utilities.formatDate(existing, tz, 'yyyy-MM-dd HH:mm') };
        }
        const now = new Date();
        const cell = hSh.getRange(rowNum, H['初回印刷日時'] + 1);
        cell.setValue(now);
        cell.setNumberFormat('yyyy-mm-dd hh:mm');
        return { ok: true, alreadyPrinted: false };
      }
    }
    return { ok: false, error: '書類が見つかりません' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- 荷受チェック（到着・受渡の記録） ----------------

// 書類番号＋行番号で発注明細シート上の該当行を探す
function findDetailRow_(dSh, docNo, no) {
  const last = dSh.getLastRow();
  if (last < 2) return -1;
  const vals = dSh.getRange(2, 1, last - 1, DETAIL_COLS.length).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][D['書類番号']]) === String(docNo) && Number(vals[i][D['行番号']]) === Number(no)) {
      return i + 2;
    }
  }
  return -1;
}

// body = { action:'markArrived', docNo, no }
// 会社（荷受場）への到着を記録する。既に記録済みの場合は上書きしない
function markArrived(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dSh = ss.getSheetByName(SHEET_DETAIL);
    const rowNum = findDetailRow_(dSh, body.docNo, body.no);
    if (rowNum === -1) return { ok: false, error: '品目が見つかりません' };
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
    const cell = dSh.getRange(rowNum, D['着荷日'] + 1);
    if (cell.getValue()) {
      return { ok: true, already: true, date: fmtDate_(cell.getValue(), tz) };
    }
    const now = new Date();
    cell.setValue(now);
    cell.setNumberFormat('yyyy-mm-dd');
    return { ok: true, date: Utilities.formatDate(now, tz, 'yyyy-MM-dd') };
  } finally {
    lock.releaseLock();
  }
}

// body = { action:'markHandedOver', docNo, no }
// 担当者への受渡を記録する。この操作は「受渡待ち（受渡チェック）」タブからのみ
// 呼び出され、そのタブは着荷日が記録済みの品目しか表示しないため、
// 着荷日が未記録のまま呼ばれることは想定していない
function markHandedOver(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dSh = ss.getSheetByName(SHEET_DETAIL);
    const rowNum = findDetailRow_(dSh, body.docNo, body.no);
    if (rowNum === -1) return { ok: false, error: '品目が見つかりません' };
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
    const handedCell = dSh.getRange(rowNum, D['受渡日'] + 1);
    if (handedCell.getValue()) {
      return { ok: true, already: true, date: fmtDate_(handedCell.getValue(), tz) };
    }
    const now = new Date();
    handedCell.setValue(now);
    handedCell.setNumberFormat('yyyy-mm-dd');
    return { ok: true, date: Utilities.formatDate(now, tz, 'yyyy-MM-dd') };
  } finally {
    lock.releaseLock();
  }
}

// body = { action:'undoMark', docNo, no, field:'着荷日'|'受渡日' }
// 直前に記録した到着・受渡を取り消す（該当セルを空欄に戻す）
function undoMark(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dSh = ss.getSheetByName(SHEET_DETAIL);
    const rowNum = findDetailRow_(dSh, body.docNo, body.no);
    if (rowNum === -1) return { ok: false, error: '品目が見つかりません' };
    if (D[body.field] === undefined) return { ok: false, error: '不正な項目です' };
    dSh.getRange(rowNum, D[body.field] + 1).setValue('');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// 手作業で行を追加した等の理由で日付書式・条件付き書式が
// 崩れた場合に、既存データ全体へ再適用するためのメニュー用関数
function reapplyValidation() {
  ensureSheetsExist();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cSh = ss.getSheetByName(SHEET_CONFIG);
  if (cSh) applyConfigValidation_(cSh);
  const hSh = ss.getSheetByName(SHEET_HEADER);
  const dSh = ss.getSheetByName(SHEET_DETAIL);
  const hLast = hSh.getLastRow();
  if (hLast >= 2) {
    hSh.getRange(2, H['発行日'] + 1, hLast - 1, 1).setNumberFormat('yyyy-mm-dd');
    hSh.getRange(2, H['初回印刷日時'] + 1, hLast - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  const dLast = dSh.getLastRow();
  if (dLast >= 2) applyDetailValidation_(dSh, 2, dLast - 1);
  applyDetailAlertFormat_(dSh);
  SpreadsheetApp.getUi().alert('データ検証・書式を再設定しました。');
}

// ---------------- ダッシュボード用データ ----------------

function getDashboardData() {
  ensureSheetsExist();
  const config = getConfig_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const hSh = ss.getSheetByName(SHEET_HEADER);
  const dSh = ss.getSheetByName(SHEET_DETAIL);

  const hLast = hSh.getLastRow();
  const headers = [];
  if (hLast >= 2) {
    const vals = hSh.getRange(2, 1, hLast - 1, HEADER_COLS.length).getValues();
    vals.forEach(function (r) {
      const docNo = r[H['書類番号']];
      if (!docNo) return;
      headers.push({
        docNo: docNo,
        issueDate: fmtDate_(r[H['発行日']], tz),
        client: r[H['取引先名']] || '',
        clientContact: r[H['先方担当者名']] || '',
        company: r[H['自社名']] || '',
        dept: r[H['部署名']] || '',
        staff: r[H['担当者名']] || '',
        contact: r[H['連絡先']] || '',
        deliveryPlace: r[H['納品場所']] || '',
        terms: r[H['支払条件']] || '',
        memo: r[H['備考']] || '',
        freeValue: r[H['フリー項目値']] || ''
      });
    });
  }

  const dLast = dSh.getLastRow();
  const details = [];
  if (dLast >= 2) {
    const vals = dSh.getRange(2, 1, dLast - 1, DETAIL_COLS.length).getValues();
    vals.forEach(function (r) {
      const docNo = r[D['書類番号']];
      if (!docNo) return;
      details.push({
        docNo: docNo,
        no: r[D['行番号']],
        pin: r[D['品番']] || '',
        name: r[D['品名']] || '',
        qty: Number(r[D['数量']]) || 0,
        unitPrice: Number(r[D['単価']]) || 0,
        taxRate: Number(r[D['税率']]) || 0,
        amount: Number(r[D['金額']]) || 0,
        dueDate: fmtDate_(r[D['納期']], tz),
        arrivedDate: fmtDate_(r[D['着荷日']], tz),
        handedDate: fmtDate_(r[D['受渡日']], tz)
      });
    });
  }

  return { ok: true, config: config, headers: headers, details: details };
}

function fmtDate_(v, tz) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v);
}
