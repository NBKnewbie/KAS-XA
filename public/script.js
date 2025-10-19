// === KONFIG ===
const price = 5000;
const TOTAL_WEEKS = 3;

const tbody = document.getElementById("tbodyMain");
const tbodyExp = document.getElementById("tbodyExpenses");
const yearSel = document.getElementById("yearSelect");
const monthSel = document.getElementById("monthSelect");

let currentYear, currentMonth;
let studentsGlobal = [];
let monthWeeks = {};     // { [nama]: [bool,bool,bool] }
let monthExpenses = [];  // [{id,date,desc,note,amount}]
let saldoAll = 0;

// Inisialisasi dropdown tahun/bulan
function initSelectors() {
  const now = new Date();
  for (let y = 2024; y <= 2030; y++) {
    const o = document.createElement("option");
    o.value = y; o.textContent = y; yearSel.appendChild(o);
  }
  const bln = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  bln.forEach((b,i) => {
    const o = document.createElement("option");
    o.value = i+1; o.textContent = b; monthSel.appendChild(o);
  });
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  yearSel.value = currentYear;
  monthSel.value = currentMonth;
}

// Load data bulan dari API
async function loadMonth(year, month) {
  const res = await fetch(`api/month.php?year=${year}&month=${month}`, {credentials:'same-origin'});
  const j = await res.json();
  if (!j.ok) { alert(j.error || 'Gagal memuat'); return; }
  studentsGlobal = j.data.students;
  monthWeeks = j.data.weeks;
  monthExpenses = j.data.expenses;
  saldoAll = j.data.saldoAll ?? 0;
  renderStudents();
  renderExpenses();
}

// Render daftar siswa + ceklis K1–K3
function renderStudents() {
  tbody.innerHTML = "";
  studentsGlobal.forEach((name) => {
    const weeks = monthWeeks[name] || Array(TOTAL_WEEKS).fill(false);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      ${weeks.map((w,j)=>`<td><input type="checkbox" ${w?'checked':''} data-s="${name}" data-w="${j}"></td>`).join("")}
      <td>Rp ${(weeks.filter(Boolean).length * price).toLocaleString()}</td>
      <td><button class="btn-ghost btn-delete" data-del="${name}">Hapus</button></td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("totalStudents").textContent = `${studentsGlobal.length} siswa`;
  updateTotals();
}

// Toggle ceklis → POST toggle_payment
tbody.addEventListener("change", async (e) => {
  if (e.target.type === "checkbox") {
    const s = e.target.dataset.s, w = +e.target.dataset.w;
    const form = new FormData();
    form.append('action','toggle_payment');
    form.append('name', s);
    form.append('year', currentYear);
    form.append('month', currentMonth);
    form.append('week', w);
    const r = await fetch('api/month.php', { method:'POST', body: form });
    const j = await r.json();
    if (!j.ok) { alert(j.error || 'Gagal menyimpan'); e.target.checked = !e.target.checked; return; }
    await loadMonth(currentYear, currentMonth);
  }
});

// Hapus siswa
tbody.addEventListener("click", async (e) => {
  if (e.target.classList.contains("btn-delete")) {
    const name = e.target.dataset.del;
    if (!confirm(`Hapus siswa "${name}"?`)) return;
    const form = new FormData();
    form.append('action','delete_student');
    form.append('name', name);
    const r = await fetch('api/month.php', { method:'POST', body: form });
    const j = await r.json();
    if (!j.ok) return alert(j.error || 'Gagal menghapus');
    await loadMonth(currentYear, currentMonth);
  }
});

// Tambah siswa
document.getElementById("btnAdd").onclick = async () => {
  const nama = prompt("Nama siswa:");
  if (!nama) return;
  if (studentsGlobal.includes(nama)) return alert("Siswa sudah ada!");
  const form = new FormData();
  form.append('action','add_student');
  form.append('name', nama);
  const r = await fetch('api/month.php', { method:'POST', body: form });
  const j = await r.json();
  if (!j.ok) return alert(j.error || 'Gagal menambah siswa');
  await loadMonth(currentYear, currentMonth);
};

// Render pengeluaran
function renderExpenses() {
  tbodyExp.innerHTML = "";
  (monthExpenses||[]).forEach((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.date || "-"}</td>
      <td>${x.desc}</td>
      <td>${x.note || "-"}</td>
      <td>Rp ${(+x.amount).toLocaleString()}</td>
      <td><button data-expdel="${x.id}" class="btn-ghost">Hapus</button></td>`;
    tbodyExp.appendChild(tr);
  });
  updateTotals();
}

// Tambah pengeluaran
document.getElementById("btnAddExp").onclick = async () => {
  const desc = expDesc.value.trim();
  const note = expNote.value.trim();
  const amt  = +expAmount.value;
  const date = expDate.value;
  if (!desc || !amt) return alert("Isi tujuan dan nominal!");
  const form = new FormData();
  form.append('action','add_expense');
  form.append('desc', desc);
  form.append('note', note);
  form.append('amount', amt);
  if (date) form.append('date', date);
  const r = await fetch('api/month.php', { method:'POST', body: form });
  const j = await r.json();
  if (!j.ok) return alert(j.error || 'Gagal menambah');
  expDesc.value = expNote.value = expAmount.value = expDate.value = "";
  await loadMonth(currentYear, currentMonth);
};

// Hapus pengeluaran
tbodyExp.addEventListener("click", async (e) => {
  const id = e.target.dataset.expdel;
  if (!id) return;
  if (!confirm("Hapus pengeluaran ini?")) return;
  const form = new FormData();
  form.append('action','delete_expense');
  form.append('id', id);
  const r = await fetch('api/month.php', { method:'POST', body: form });
  const j = await r.json();
  if (!j.ok) return alert(j.error || 'Gagal menghapus');
  await loadMonth(currentYear, currentMonth);
});

// Hitung total
function updateTotals() {
  // Total pemasukan bulan = jumlah ceklis * price
  let income = 0;
  studentsGlobal.forEach((n) => {
    const w = monthWeeks[n] || Array(TOTAL_WEEKS).fill(false);
    income += w.filter(Boolean).length * price;
  });
  const out = (monthExpenses||[]).reduce((a,x)=>a + (+x.amount||0), 0);
  document.getElementById("totalIncome").textContent = "Rp " + income.toLocaleString();
  document.getElementById("totalExpense").textContent = "Rp " + out.toLocaleString();
  document.getElementById("saldoMonth").textContent = "Rp " + (income - out).toLocaleString();
  document.getElementById("saldoAll").textContent = "Rp " + (+saldoAll).toLocaleString();
}

// Ganti bulan/tahun
document.getElementById("btnLoad").onclick = () => {
  currentYear = +yearSel.value;
  currentMonth = +monthSel.value;
  loadMonth(currentYear, currentMonth);
};

// Init
(function init(){
  initSelectors();
  loadMonth(currentYear, currentMonth);
})();
