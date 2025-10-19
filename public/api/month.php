<?php
require_once __DIR__.'/../../src/db.php';
require_once __DIR__.'/../../src/response.php';

$pdo = pdo();
$PRICE = 5000;       // tarif kas/minggu (sesuaikan dg UI)
$TOTAL_WEEKS = 3;    // K1–K3

function week_date(int $year, int $month, int $w) {
  // K1=5, K2=12, K3=19 → bisa diubah sesuai aturanmu
  $d = [5,12,19][$w] ?? 5;
  return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  // ?year=YYYY&month=M
  $year  = (int)($_GET['year']  ?? 0);
  $month = (int)($_GET['month'] ?? 0);
  if (!$year || !$month) json_err('year & month wajib', 422);

  // siswa
  $rows = $pdo->query("SELECT id,name FROM students ORDER BY name")->fetchAll();
  $students = array_column($rows, 'name');
  $idByName = [];
  foreach ($rows as $r) $idByName[$r['name']] = (int)$r['id'];

  // income bulan ini (kas mingguan)
  $from = sprintf('%04d-%02d-01',$year,$month);
  $to   = date('Y-m-d', strtotime("$from +1 month -1 day"));

  $qInc = $pdo->prepare("
    SELECT student_id, trx_date
    FROM transactions
    WHERE type='income' AND trx_date BETWEEN ? AND ?
  ");
  $qInc->execute([$from,$to]);
  $inc = $qInc->fetchAll();

  // bangun weeks[name] = [bool,bool,bool]
  $weeks = [];
  foreach ($students as $name) $weeks[$name] = array_fill(0,$TOTAL_WEEKS,false);
  foreach ($inc as $t) {
    $sid = (int)$t['student_id'];
    // map trx_date ke week index (berdasarkan tanggal 5/12/19)
    for ($w=0;$w<$TOTAL_WEEKS;$w++) {
      if ($t['trx_date'] === week_date($year,$month,$w)) {
        // cari nama siswa dari id
        $name = array_search($sid, $idByName, true);
        if ($name !== false) $weeks[$name][$w] = true;
      }
    }
  }

  // expenses bulan ini
  $qExp = $pdo->prepare("
    SELECT id, trx_date AS date, description AS `desc`, note, amount
    FROM transactions
    WHERE type='expense' AND trx_date BETWEEN ? AND ?
    ORDER BY trx_date,id
  ");
  $qExp->execute([$from,$to]);
  $expenses = $qExp->fetchAll();

  // saldo total semua waktu
  $sum = $pdo->query("
    SELECT
      SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS ti,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS te
    FROM transactions
  ")->fetch();
  $saldoAll = (float)($sum['ti'] ?? 0) - (float)($sum['te'] ?? 0);

  json_ok([
    'students' => $students,
    'weeks'    => $weeks,     // { "Andi":[true,false,true], ... }
    'expenses' => $expenses,  // [{id,date,desc,note,amount},...]
    'saldoAll' => $saldoAll,
    'price'    => $PRICE,
    'totalWeeks'=> $TOTAL_WEEKS
  ]);
}

if ($method === 'POST') {
  // aksi: add_student | delete_student | toggle_payment | add_expense | delete_expense
  $action = $_POST['action'] ?? '';
  if ($action === '') json_err('action wajib',422);

  if ($action === 'add_student') {
    $name = trim($_POST['name'] ?? '');
    if ($name==='') json_err('Nama wajib',422);
    $st = $pdo->prepare("SELECT 1 FROM students WHERE name=? LIMIT 1");
    $st->execute([$name]);
    if ($st->fetch()) json_err('Nama sudah ada',409);
    $pdo->prepare("INSERT INTO students (name) VALUES (?)")->execute([$name]);
    json_ok(['id'=>$pdo->lastInsertId()],201);
  }

  if ($action === 'delete_student') {
    $name = trim($_POST['name'] ?? '');
    if ($name==='') json_err('Nama wajib',422);
    $pdo->prepare("DELETE FROM students WHERE name=?")->execute([$name]);
    json_ok();
  }

  if ($action === 'toggle_payment') {
    $name  = trim($_POST['name'] ?? '');
    $year  = (int)($_POST['year'] ?? 0);
    $month = (int)($_POST['month'] ?? 0);
    $week  = (int)($_POST['week'] ?? -1);
    if ($name==='' || !$year || !$month || $week<0 || $week>2) json_err('Param tidak lengkap',422);

    // dapatkan student_id
    $sid = $pdo->prepare("SELECT id FROM students WHERE name=? LIMIT 1");
    $sid->execute([$name]);
    $student_id = $sid->fetchColumn();
    if (!$student_id) json_err('Siswa tidak ditemukan',404);

    $date = week_date($year,$month,$week);
    // cek sudah ada income barisnya?
    $chk = $pdo->prepare("SELECT id FROM transactions
                          WHERE type='income' AND student_id=? AND trx_date=? LIMIT 1");
    $chk->execute([$student_id,$date]);
    $id = $chk->fetchColumn();

    if ($id) {
      // uncheck → hapus baris income
      $pdo->prepare("DELETE FROM transactions WHERE id=?")->execute([$id]);
      json_ok(['toggled'=>'off']);
    } else {
      // check → tambah baris income
      $desc = 'Kas Minggu '.($week+1);
      $pdo->prepare("INSERT INTO transactions (trx_date,type,student_id,description,amount)
                     VALUES (?,?,?,?,?)")
          ->execute([$date,'income',$student_id,$desc,5000]);
      json_ok(['toggled'=>'on','id'=>$pdo->lastInsertId()],201);
    }
  }

  if ($action === 'add_expense') {
    $desc = trim($_POST['desc'] ?? '');
    $note = trim($_POST['note'] ?? '');
    $amount = (float)($_POST['amount'] ?? 0);
    $date = $_POST['date'] ?? date('Y-m-d');
    if ($desc==='' || $amount<=0) json_err('Tujuan & nominal wajib',422);

    $pdo->prepare("INSERT INTO transactions (trx_date,type,description,note,amount)
                   VALUES (?,?,?,?,?)")
        ->execute([$date,'expense',$desc,$note,$amount]);
    json_ok(['id'=>$pdo->lastInsertId()],201);
  }

  if ($action === 'delete_expense') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) json_err('ID wajib',422);
    $pdo->prepare("DELETE FROM transactions WHERE id=? AND type='expense'")->execute([$id]);
    json_ok();
  }

  json_err('Aksi tidak dikenal',400);
}

json_err('Method not allowed',405);
