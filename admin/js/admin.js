
import { db, auth } from "../../shared/js/firebase-app.js";
import { builtInAdmins, siteConfig } from "../../shared/js/firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const provider = new GoogleAuthProvider();

let activities = [];
let adminEmails = [];
let currentUser = null;
let regFields = [];
let fbQuestions = [];
let attachments = [];
let adminSearchText = "";
let unsubscribe = null;

const defaultFb = [
  "本次活動內容對我有幫助。",
  "活動安排與流程清楚。",
  "活動讓我有新的學習或體驗。",
  "整體而言，我對本次活動感到滿意。"
];

const likertOptions = ["非常滿意","滿意","普通","不滿意","非常不滿意"];

function val(id){ return $(id)?.value ?? ""; }
function checked(id){ return !!$(id)?.checked; }
function setVal(id, value){ const el = $(id); if(el) el.value = value ?? ""; }
function setChecked(id, value){ const el = $(id); if(el) el.checked = !!value; }
function setText(id, value){ const el = $(id); if(el) el.textContent = value ?? ""; }
function setHtml(id, value){ const el = $(id); if(el) el.innerHTML = value ?? ""; }

$("loginBtn").onclick = async () => {
  try { await signInWithPopup(auth, provider); }
  catch(e){ alert("登入失敗：" + e.message); }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if(!user){
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    return;
  }
  currentUser = user;
  await loadAdmins();
  if(!isAdmin(user.email)){
    alert("這個帳號沒有後台權限：" + user.email);
    await signOut(auth);
    return;
  }
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  setText("userInfo", user.email);
  resetForm();
  listenActivities();
});

async function loadAdmins(){
  const ref = doc(db, "settings", "admins");
  const snap = await getDoc(ref);
  adminEmails = snap.exists() ? (snap.data().emails || []) : [];

  for(const email of builtInAdmins){
    if(!adminEmails.includes(email)) adminEmails.push(email);
  }

  if(currentUser && builtInAdmins.includes(currentUser.email)){
    await setDoc(ref, { emails: adminEmails, updatedAt: serverTimestamp() }, { merge:true });
  }
  renderAdmins();
}

function isAdmin(email){
  return adminEmails.includes(email);
}

$("addAdminBtn").onclick = async () => {
  const email = val("adminEmailInput").trim();
  if(!email || !email.includes("@")) return alert("請輸入正確 Email");
  if(!adminEmails.includes(email)) adminEmails.push(email);
  await setDoc(doc(db, "settings", "admins"), { emails: adminEmails, updatedAt: serverTimestamp() }, { merge:true });
  setVal("adminEmailInput", "");
  renderAdmins();
};

function renderAdmins(){
  const box = $("adminEmailList");
  if(!box) return;
  box.innerHTML = adminEmails.map(email => `
    <div class="admin-email-item">
      <strong>${esc(email)}</strong>
      ${builtInAdmins.includes(email) ? "<span>內建</span>" : `<button class="ghost-btn" data-remove-admin="${esc(email)}">移除</button>`}
    </div>
  `).join("");
}

document.addEventListener("click", async (e) => {
  if(e.target.closest("[data-modal-close]") || e.target.id === "modal"){
    const modal = $("modal");
    if(modal) modal.classList.add("hidden");
    return;
  }
  const nav = e.target.closest(".nav-item");
  if(nav) return showView(nav.dataset.view);

  const edit = e.target.closest("[data-edit]");
  if(edit) return editActivity(edit.dataset.edit);

  const del = e.target.closest("[data-delete]");
  if(del) return deleteActivity(del.dataset.delete);

  const copy = e.target.closest("[data-copy]");
  if(copy) return copyLink(copy.dataset.copy);

  const qr = e.target.closest("[data-qr]");
  if(qr) return downloadQr(qr.dataset.qr, qr.dataset.name || "qr");

  const viewRegs = e.target.closest("[data-view-regs]");
  if(viewRegs) return viewRegistrations(viewRegs.dataset.viewRegs);

  const regs = e.target.closest("[data-export-regs]");
  if(regs) return exportRegistrations(regs.dataset.exportRegs);

  const fbs = e.target.closest("[data-export-fbs]");
  if(fbs) return exportFeedbacks(fbs.dataset.exportFbs);

  const word = e.target.closest("[data-export-word]");
  if(word) return exportFeedbackWord(word.dataset.exportWord);

  const removeAdmin = e.target.closest("[data-remove-admin]");
  if(removeAdmin){
    adminEmails = adminEmails.filter(x => x !== removeAdmin.dataset.removeAdmin);
    await setDoc(doc(db, "settings", "admins"), { emails: adminEmails, updatedAt: serverTimestamp() }, { merge:true });
    renderAdmins();
  }
});

function showView(view){
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $("view-" + view)?.classList.remove("hidden");
  setText("pageTitle", {dashboard:"儀表板",activities:"活動管理",settings:"系統設定"}[view] || "管理平台");
}

$("newActivityBtn").onclick = () => { showView("activities"); resetForm(); };
$("resetBtn").onclick = resetForm;
$("addRegisterFieldBtn").onclick = () => {
  regFields.push({ label:"新題目", type:"text", required:false, options:[] });
  renderRegFields();
};
$("addFeedbackQuestionBtn").onclick = () => {
  fbQuestions.push("新的滿意度題目");
  renderFbQuestions();
};
$("addAttachmentBtn").onclick = () => {
  attachments.push({name:"附件", url:""});
  renderAttachments();
};
function closeModal(){ $("modal")?.classList.add("hidden"); }
const closeModalBtn = $("closeModalBtn");
$("modal")?.addEventListener("click", (e) => { if(e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });
$("adminSearch").oninput = (e) => {
  adminSearchText = e.target.value.trim();
  renderLists();
};

function listenActivities(){
  if(unsubscribe) return;
  unsubscribe = onSnapshot(query(collection(db, "activities"), orderBy("date", "desc")), (snap) => {
    activities = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    updateStats();
    renderLists();
  });
}

function updateStats(){
  setText("statActivities", activities.length);
  setText("statFeedbacks", activities.reduce((s,a)=>s+Number(a.feedbackCount||0),0));
  setText("statOpenActivities", activities.filter(a => a.status === "open").length);
}

function renderLists(){
  const data = activities.filter(a => !adminSearchText || (a.title || "").includes(adminSearchText));
  const html = data.length ? data.map(card).join("") : '<div class="empty">目前沒有活動</div>';
  setHtml("activityList", html);
  setHtml("activityList2", html);
}

function card(a){
  const regUrl = siteConfig.baseUrl + "frontend/activity.html?id=" + a.id;
  const fbUrl = siteConfig.baseUrl + "frontend/feedback.html?id=" + a.id;
  const capText = Number(a.capacity || 0) > 0 ? `${a.registeredCount||0}/${a.capacity}` : `${a.registeredCount||0}/不限`;
  const fbOpen = a.feedbackOpenAt ? `｜回饋開放：${formatDateTime(a.feedbackOpenAt)}` : "";
  return `<article class="activity-admin-card">
    <div class="activity-card-main">
      <div class="activity-title-row">
        <h3>${esc(a.title)}</h3>
        <span class="badge">${statusText(a.status)}</span>
      </div>
      <div class="activity-info-grid">
        <div><strong>日期</strong><span>📅 ${esc(a.date||"")}</span></div>
        <div><strong>時間</strong><span>${esc(a.time||"")}</span></div>
        <div><strong>地點</strong><span>📍 ${esc(a.location||"")}</span></div>
        <div><strong>報名</strong><span>${capText}</span></div>
        <div><strong>回饋</strong><span>${a.feedbackCount||0} 份${esc(fbOpen)}</span></div>
      </div>
      ${a.description ? `<p class="activity-desc">${esc(a.description)}</p>` : ""}
    </div>
    <div class="activity-actions">
      <button class="ghost-btn" data-copy="${regUrl}">複製報名連結</button>
      <button class="ghost-btn" data-qr="${regUrl}" data-name="${esc(a.title)}_報名QR">報名QR</button>
      <button class="ghost-btn" data-copy="${fbUrl}">複製回饋連結</button>
      <button class="ghost-btn" data-qr="${fbUrl}" data-name="${esc(a.title)}_回饋QR">回饋QR</button>
      <button class="ghost-btn" data-view-regs="${a.id}">查看報名名單</button>
      <button class="ghost-btn" data-export-fbs="${a.id}">下載回饋資料</button>
      <button class="ghost-btn" data-export-word="${a.id}">下載成果Word</button>
      <button class="ghost-btn" data-edit="${a.id}">修改</button>
      <button class="ghost-btn danger-btn" data-delete="${a.id}">刪除</button>
    </div>
  </article>`;
}

function formatDateTime(v){
  if(!v) return "";
  return String(v).replace("T"," ");
}

function resetForm(){
  setVal("editId", "");
  setText("formTitle", "新增活動");
  setVal("title", "");
  const dateEl = $("date");
  if(dateEl) dateEl.valueAsDate = new Date();
  setVal("time", "");
  setVal("location", "");
  setVal("description", "");
  setVal("capacity", 0);
  setVal("status", "open");
  setChecked("published", true);
  setVal("feedbackOpenAt", "");
  setVal("feedbackMinWords", 30);
  regFields = [];
  fbQuestions = [...defaultFb];
  attachments = [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
}

function editActivity(id){
  const a = activities.find(x => x.id === id);
  if(!a) return;
  showView("activities");
  setVal("editId", id);
  setText("formTitle", "修改活動");
  setVal("title", a.title || "");
  setVal("date", a.date || "");
  setVal("time", a.time || "");
  setVal("location", a.location || "");
  setVal("description", a.description || "");
  setVal("capacity", a.capacity || 0);
  setVal("status", a.status || "open");
  setChecked("published", a.published !== false);
  setVal("feedbackOpenAt", a.feedbackOpenAt || "");
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = a.registerFields || [];
  fbQuestions = a.feedbackQuestions || [...defaultFb];
  attachments = a.attachments || [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
}


function renderAttachments(){
  const html = attachments.length ? attachments.map((f,i)=>`
    <div class="field-item">
      <div class="attach-row">
        <input class="field att-name" data-i="${i}" value="${esc(f.name || "")}" placeholder="附件名稱，例如 行程表">
        <input class="field att-url" data-i="${i}" value="${esc(f.url || "")}" placeholder="附件網址，例如 Google Drive / PDF 連結">
        <button type="button" class="ghost-btn att-remove" data-i="${i}">移除</button>
      </div>
    </div>`).join("") : '<div class="empty">目前沒有附件連結</div>';
  setHtml("attachmentsBox", html);
  bindFieldEvents();
}

function renderRegFields(){
  const html = regFields.length ? regFields.map((f,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field reg-label" data-i="${i}" value="${esc(f.label)}">
        <select class="field reg-type" data-i="${i}">
          <option value="text" ${f.type==="text"?"selected":""}>簡答</option>
          <option value="textarea" ${f.type==="textarea"?"selected":""}>段落</option>
          <option value="radio" ${f.type==="radio"?"selected":""}>單選</option>
        </select>
        <button type="button" class="ghost-btn reg-remove" data-i="${i}">移除</button>
      </div>
      <label><input type="checkbox" class="reg-required" data-i="${i}" ${f.required?"checked":""}> 必填</label>
      <input class="field reg-options" data-i="${i}" value="${esc((f.options||[]).join(','))}" placeholder="單選選項，用逗號分隔">
    </div>`).join("") : '<div class="empty">目前沒有自訂題目</div>';
  setHtml("registerFieldsBox", html);
  bindFieldEvents();
}

function renderFbQuestions(){
  setHtml("feedbackQuestionsBox", fbQuestions.map((q,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field fb-question" data-i="${i}" value="${esc(q)}">
        <span></span>
        <button type="button" class="ghost-btn fb-remove" data-i="${i}">移除</button>
      </div>
    </div>`).join(""));
  bindFieldEvents();
}

function bindFieldEvents(){
  document.querySelectorAll(".reg-label").forEach(el => el.oninput = () => regFields[Number(el.dataset.i)].label = el.value);
  document.querySelectorAll(".reg-type").forEach(el => el.onchange = () => regFields[Number(el.dataset.i)].type = el.value);
  document.querySelectorAll(".reg-required").forEach(el => el.onchange = () => regFields[Number(el.dataset.i)].required = el.checked);
  document.querySelectorAll(".reg-options").forEach(el => el.oninput = () => regFields[Number(el.dataset.i)].options = el.value.split(",").map(x=>x.trim()).filter(Boolean));
  document.querySelectorAll(".reg-remove").forEach(el => el.onclick = () => { regFields.splice(Number(el.dataset.i),1); renderRegFields(); });
  document.querySelectorAll(".fb-question").forEach(el => el.oninput = () => fbQuestions[Number(el.dataset.i)] = el.value);
  document.querySelectorAll(".fb-remove").forEach(el => el.onclick = () => { fbQuestions.splice(Number(el.dataset.i),1); renderFbQuestions(); });
  document.querySelectorAll(".att-name").forEach(el => el.oninput = () => attachments[Number(el.dataset.i)].name = el.value);
  document.querySelectorAll(".att-url").forEach(el => el.oninput = () => attachments[Number(el.dataset.i)].url = el.value);
  document.querySelectorAll(".att-remove").forEach(el => el.onclick = () => { attachments.splice(Number(el.dataset.i),1); renderAttachments(); });
}

$("activityForm").onsubmit = async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const data = cleanUndefined({
    title: val("title").trim(),
    date: val("date"),
    time: val("time").trim(),
    location: val("location").trim(),
    description: val("description").trim(),
    capacity: Number(val("capacity") || 0),
    status: val("status") || "open",
    published: checked("published"),
    feedbackOpenAt: val("feedbackOpenAt"),
    attachments: attachments.filter(a => (a.name || a.url)),
    registerFields: regFields,
    feedbackQuestions: fbQuestions.filter(Boolean),
    feedbackMinWords: Number(val("feedbackMinWords") || 30),
    updatedAt: serverTimestamp()
  });

  if(!data.title || !data.date) return alert("活動名稱和日期必填");

  try{
    const id = val("editId");
    if(id){
      await updateDoc(doc(db, "activities", id), data);
    }else{
      data.registeredCount = 0;
      data.feedbackCount = 0;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "activities"), data);
    }
    alert("已儲存");
    resetForm();
    showView("activities");
  }catch(err){
    console.error(err);
    alert("儲存失敗：" + err.message);
  }
};

async function deleteActivity(id){
  if(!confirm("確定刪除此活動？")) return;
  await deleteDoc(doc(db, "activities", id));
}

async function copyLink(url){
  await navigator.clipboard.writeText(url);
  alert("已複製連結");
}

function downloadQr(url, name){
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(url);
  window.open(qr, "_blank");
}


async function viewRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>d.data());
  const custom = a.registerFields || [];
  const table = rows.length ? `<table class="data-table">
    <thead><tr><th>#</th><th>姓名</th><th>系級</th><th>學號</th><th>電話</th><th>餐點</th>${custom.map(f=>`<th>${esc(f.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.studentId)}</td><td>${esc(r.phone)}</td><td>${esc(r.meal)}</td>${custom.map(f=>`<td>${esc(r.customAnswers?.[f.label]||"")}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>` : '<div class="empty">目前沒有人報名</div>';
  setHtml("modalContent", `<button class="modal-close" data-modal-close type="button">×</button><h2>${esc(a.title)}｜報名名單 <span class="quick-count">${rows.length} 人</span></h2>${table}`);
  $("modal").classList.remove("hidden");
}

async function exportRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>d.data());
  const headers = ["姓名","系級","學號","電話","餐點",...(a.registerFields||[]).map(f=>f.label)];
  const data = rows.map(r => [r.name,r.department,r.studentId,r.phone,r.meal,...(a.registerFields||[]).map(f=>r.customAnswers?.[f.label]||"")]);
  downloadCsv(a.title+"_報名名單.csv", [headers,...data]);
}

async function exportFeedbacks(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const headers = ["姓名","學號",...(a.feedbackQuestions||[]),"心得"];
  const data = rows.map(r => [r.name,r.studentId,...(a.feedbackQuestions||[]).map(q=>r.ratings?.[q]||""),r.comment]);
  downloadCsv(a.title+"_回饋資料.csv", [headers,...data]);
}

async function exportFeedbackWord(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const qs = a.feedbackQuestions || [];
  const total = rows.length || 1;
  let tableRows = qs.map((q,i)=>{
    const cells = likertOptions.map(o=>{
      const count = rows.filter(r=>r.ratings?.[q]===o).length;
      return `<td>${round(count/total*100)}%</td>`;
    }).join("");
    return `<tr><td>${i+1}. ${esc(q)}</td>${cells}</tr>`;
  }).join("");
  const comments = rows.map((r,i)=>`<p>${i+1}. ${esc(r.comment||"")}</p>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Microsoft JhengHei';font-size:14pt;line-height:1.8}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px}h1,h2{text-align:center}</style></head><body><h2>明新科技大學 健康與諮商中心</h2><h1>資源教室「${esc(a.title)}」活動回饋表</h1><p>時間：${esc(a.date)} ${esc(a.time||"")}</p><p>地點：${esc(a.location||"")}</p><h2 style="text-align:left">一、活動滿意度</h2><table><tr><th>題目</th>${likertOptions.map(o=>`<th>${o}</th>`).join("")}</tr>${tableRows}</table><h2 style="text-align:left">二、參與活動後，我的心得與感想</h2>${comments}</body></html>`;
  downloadFile(a.title+"_活動回饋表.doc", html, "application/msword");
}

function downloadCsv(filename, rows){
  const csv = rows.map(r => r.map(v => `"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  downloadFile(filename, "\ufeff"+csv, "text/csv;charset=utf-8");
}
function downloadFile(filename, content, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function cleanUndefined(obj){
  if(Array.isArray(obj)) return obj.map(cleanUndefined);
  if(obj && typeof obj === "object"){
    const out = {};
    Object.entries(obj).forEach(([k,v]) => {
      if(v !== undefined) out[k] = cleanUndefined(v);
    });
    return out;
  }
  return obj;
}
function round(n){ return Math.round(n*10)/10; }
function statusText(s){ return {open:"報名中",feedback:"回饋中",closed:"已結束",draft:"草稿"}[s] || "活動"; }
function esc(str){ return String(str || "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
