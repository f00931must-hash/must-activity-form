
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
let adminSearchText = "";

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
$("adminSearch").oninput = (e) => {
  adminSearchText = e.target.value.trim();
  renderLists();
};

let unsubscribe = null;
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
  setText("statRegs", activities.reduce((s,a)=>s+Number(a.registeredCount||0),0));
  setText("statFeedbacks", activities.reduce((s,a)=>s+Number(a.feedbackCount||0),0));
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
  return `<article class="admin-card">
    <div>
      <div class="admin-card-title">${esc(a.title)} <span class="badge">${statusText(a.status)}</span></div>
      <div class="admin-card-meta">📅 ${esc(a.date||"")} ${esc(a.time||"")}｜📍${esc(a.location||"")}｜報名 ${a.registeredCount||0}/${a.capacity||"不限"}｜回饋 ${a.feedbackCount||0}</div>
    </div>
    <div class="admin-actions">
      <button class="ghost-btn" data-copy="${regUrl}">複製報名連結</button>
      <button class="ghost-btn" data-qr="${regUrl}" data-name="${esc(a.title)}_報名QR">報名QR</button>
      <button class="ghost-btn" data-copy="${fbUrl}">複製回饋連結</button>
      <button class="ghost-btn" data-qr="${fbUrl}" data-name="${esc(a.title)}_回饋QR">回饋QR</button>
      <button class="ghost-btn" data-export-regs="${a.id}">報名CSV</button>
      <button class="ghost-btn" data-export-fbs="${a.id}">回饋CSV</button>
      <button class="ghost-btn" data-export-word="${a.id}">成果Word</button>
      <button class="ghost-btn" data-edit="${a.id}">修改</button>
      <button class="ghost-btn" data-delete="${a.id}">刪除</button>
    </div>
  </article>`;
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
  setVal("feedbackMinWords", 30);
  regFields = [];
  fbQuestions = [...defaultFb];
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
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = a.registerFields || [];
  fbQuestions = a.feedbackQuestions || [...defaultFb];
  renderRegFields();
  renderFbQuestions();
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
}

$("activityForm").onsubmit = async (e) => {
  e.preventDefault();

  const data = cleanUndefined({
    title: val("title").trim(),
    date: val("date"),
    time: val("time").trim(),
    location: val("location").trim(),
    description: val("description").trim(),
    capacity: Number(val("capacity") || 0),
    status: val("status") || "open",
    published: checked("published"),
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
