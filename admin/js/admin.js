
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
let feedbackTextQuestions = [];
let attachments = [];
let adminSearchText = "";
let unsubscribe = null;

const defaultFb = [];

const likertOptions = ["非常滿意","滿意","普通","不滿意","非常不滿意"];

function val(id){ return $(id)?.value ?? ""; }
function checked(id){ return !!$(id)?.checked; }
function setVal(id, value){ const el=$(id); if(el) el.value=value ?? ""; }
function setChecked(id, value){ const el=$(id); if(el) el.checked=!!value; }
function setText(id, value){ const el=$(id); if(el) el.textContent=value ?? ""; }
function setHtml(id, value){ const el=$(id); if(el) el.innerHTML=value ?? ""; }

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

function isAdmin(email){ return adminEmails.includes(email); }

async function loadAdmins(){
  const ref = doc(db, "settings", "admins");
  const snap = await getDoc(ref);
  adminEmails = snap.exists() ? (snap.data().emails || []) : [];
  for(const email of builtInAdmins){
    if(!adminEmails.includes(email)) adminEmails.push(email);
  }
  if(currentUser && builtInAdmins.includes(currentUser.email)){
    await setDoc(ref, {emails: adminEmails, updatedAt: serverTimestamp()}, {merge:true});
  }
  renderAdmins();
}

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

function showView(view){
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $("view-" + view)?.classList.remove("hidden");
  setText("pageTitle", {dashboard:"儀表板",activities:"活動管理",settings:"系統設定"}[view] || "管理平台");
}

function closeModal(){
  $("modal")?.classList.add("hidden");
}

function listenActivities(){
  if(unsubscribe) return;
  unsubscribe = onSnapshot(query(collection(db, "activities"), orderBy("date", "desc")), snap => {
    activities = snap.docs.map(d => ({id:d.id, ...d.data()}));
    updateStats();
    renderLists();
  }, err => console.error(err));
}

function updateStats(){
  setText("statActivities", activities.length);
  setText("statRegs", activities.reduce((s,a)=>s+Number(a.registeredCount||0),0));
  setText("statFeedbacks", activities.reduce((s,a)=>s+Number(a.feedbackCount||0),0));
  setText("statOpenActivities", activities.filter(a=>a.status==="open").length);
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
  const sem = a.academicYear && a.semester ? `${a.academicYear}學年度第${a.semester}學期` : "未設定";
  return `<article class="activity-admin-card">
    <div class="activity-card-main">
      <div class="activity-title-row"><h3>${esc(a.title)}</h3><span class="badge">${statusText(a.status)}</span></div>
      <div class="activity-info-grid">
        <div><strong>學期</strong><span>${esc(sem)}</span></div>
        <div><strong>日期</strong><span>📅 ${esc(a.date||"")}</span></div>
        <div><strong>時間</strong><span>${esc(a.time||"")}</span></div>
        <div><strong>地點</strong><span>📍 ${esc(a.location||"")}</span></div>
        <div><strong>報名</strong><span>${capText}</span></div>
        <div><strong>回饋</strong><span>${a.feedbackCount||0} 份</span></div>
      </div>
      ${a.description ? `<p class="activity-desc">${esc(a.description)}</p>` : ""}
    </div>
    <div class="activity-actions">
      <button class="ghost-btn" data-copy="${regUrl}">複製報名連結</button>
      <button class="ghost-btn" data-qrprint="${regUrl}" data-title="${esc(a.title)} 報名 QR">下載報名QR A4</button>
      <button class="ghost-btn" data-copy="${fbUrl}">複製回饋連結</button>
      <button class="ghost-btn" data-qrprint="${fbUrl}" data-title="${esc(a.title)} 回饋 QR">下載回饋QR A4</button>
      <button class="ghost-btn" data-view-regs="${a.id}">查看報名名單</button>
      <button class="ghost-btn" data-view-fbs="${a.id}">查看回饋資料</button>
      <button class="ghost-btn" data-export-word="${a.id}">下載成果Word</button>
      <button class="ghost-btn" data-copy-activity="${a.id}">複製活動</button>
      <button class="ghost-btn" data-edit="${a.id}">修改</button>
      <button class="ghost-btn danger-btn" data-delete="${a.id}">刪除</button>
    </div>
  </article>`;
}

function resetForm(){
  setVal("editId", "");
  setText("formTitle", "新增活動");
  setVal("academicYear", "");
  setVal("semester", "");
  setVal("title", "");
  const dateEl = $("date");
  if(dateEl) dateEl.valueAsDate = new Date();
  setVal("time", "");
  setVal("location", "");
  setVal("description", "");
  setVal("capacity", 0);
  setVal("status", "open");
  setChecked("published", true);
  setVal("registerOpenAt", "");
  setVal("registerCloseAt", "");
  setVal("feedbackOpenAt", "");
  setVal("feedbackCloseAt", "");
  setVal("feedbackMinWords", 30);
  regFields = [];
  fbQuestions = [...defaultFb];
  feedbackTextQuestions = [];
  attachments = [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
  renderFeedbackTextQuestions();
}

function editActivity(id){
  const a = activities.find(x => x.id === id);
  if(!a) return;
  showView("activities");
  setVal("editId", id);
  setText("formTitle", "修改活動");
  setVal("academicYear", a.academicYear || "");
  setVal("semester", a.semester || "");
  setVal("title", a.title || "");
  setVal("date", a.date || "");
  setVal("time", a.time || "");
  setVal("location", a.location || "");
  setVal("description", a.description || "");
  setVal("capacity", a.capacity || 0);
  setVal("status", a.status || "open");
  setChecked("published", a.published !== false);
  setVal("registerOpenAt", a.registerOpenAt || "");
  setVal("registerCloseAt", a.registerCloseAt || "");
  setVal("feedbackOpenAt", a.feedbackOpenAt || "");
  setVal("feedbackCloseAt", a.feedbackCloseAt || "");
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = a.registerFields || [];
  fbQuestions = a.feedbackQuestions || [...defaultFb];
  feedbackTextQuestions = a.feedbackTextQuestions || [];
  attachments = a.attachments || [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
  renderFeedbackTextQuestions();
}

function copyActivity(id){
  const a = activities.find(x => x.id === id);
  if(!a) return;
  showView("activities");
  setVal("editId", "");
  setText("formTitle", "複製活動（請確認日期後儲存）");
  setVal("academicYear", a.academicYear || "");
  setVal("semester", a.semester || "");
  setVal("title", (a.title || "") + "（複製）");
  setVal("date", a.date || "");
  setVal("time", a.time || "");
  setVal("location", a.location || "");
  setVal("description", a.description || "");
  setVal("capacity", a.capacity || 0);
  setVal("status", "draft");
  setChecked("published", false);
  setVal("registerOpenAt", a.registerOpenAt || "");
  setVal("registerCloseAt", a.registerCloseAt || "");
  setVal("feedbackOpenAt", a.feedbackOpenAt || "");
  setVal("feedbackCloseAt", a.feedbackCloseAt || "");
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = JSON.parse(JSON.stringify(a.registerFields || []));
  fbQuestions = [...(a.feedbackQuestions || [])];
  feedbackTextQuestions = [...(a.feedbackTextQuestions || [])];
  attachments = JSON.parse(JSON.stringify(a.attachments || []));
  renderAttachments(); renderRegFields(); renderFbQuestions(); renderFeedbackTextQuestions();
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
    </div>`).join("") : '<div class="empty">目前沒有自訂題目；系統已內建姓名、系級、學號、電話、餐點。</div>';
  setHtml("registerFieldsBox", html);
  bindFieldEvents();
}

function renderFbQuestions(){
  const html = fbQuestions.length ? fbQuestions.map((q,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field fb-question" data-i="${i}" value="${esc(q)}" placeholder="請輸入滿意度題目">
        <span></span>
        <button type="button" class="ghost-btn fb-remove" data-i="${i}">移除</button>
      </div>
    </div>`).join("") : '<div class="empty">目前沒有滿意度題目，請按「新增滿意度題目」。</div>';
  setHtml("feedbackQuestionsBox", html);
  bindFieldEvents();
}


function renderFeedbackTextQuestions(){
  const html = feedbackTextQuestions.length ? feedbackTextQuestions.map((q,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field fb-text-question" data-i="${i}" value="${esc(q.label || "")}" placeholder="例如：你對本次活動最大的收穫是什麼？">
        <select class="field fb-text-type" data-i="${i}">
          <option value="textarea" ${q.type==="textarea"?"selected":""}>段落</option>
          <option value="text" ${q.type==="text"?"selected":""}>簡答</option>
        </select>
        <button type="button" class="ghost-btn fb-text-remove" data-i="${i}">移除</button>
      </div>
      <label><input type="checkbox" class="fb-text-required" data-i="${i}" ${q.required ? "checked" : ""}> 必填</label>
    </div>`).join("") : '<div class="empty">目前沒有回饋簡答題目。</div>';
  setHtml("feedbackTextQuestionsBox", html);
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
  document.querySelectorAll(".fb-text-question").forEach(el => el.oninput = () => feedbackTextQuestions[Number(el.dataset.i)].label = el.value);
  document.querySelectorAll(".fb-text-type").forEach(el => el.onchange = () => feedbackTextQuestions[Number(el.dataset.i)].type = el.value);
  document.querySelectorAll(".fb-text-required").forEach(el => el.onchange = () => feedbackTextQuestions[Number(el.dataset.i)].required = el.checked);
  document.querySelectorAll(".fb-text-remove").forEach(el => el.onclick = () => { feedbackTextQuestions.splice(Number(el.dataset.i),1); renderFeedbackTextQuestions(); });
}

async function saveActivity(event){
  event.preventDefault();
  event.stopPropagation();

  const data = cleanUndefined({
    academicYear: val("academicYear").trim(),
    semester: val("semester"),
    title: val("title").trim(),
    date: val("date"),
    time: val("time").trim(),
    location: val("location").trim(),
    description: val("description").trim(),
    capacity: Number(val("capacity") || 0),
    status: val("status") || "open",
    published: checked("published"),
    registerOpenAt: val("registerOpenAt"),
    registerCloseAt: val("registerCloseAt"),
    feedbackOpenAt: val("feedbackOpenAt"),
    feedbackCloseAt: val("feedbackCloseAt"),
    attachments: attachments.filter(a => (a.name || a.url)),
    registerFields: regFields,
    feedbackQuestions: fbQuestions.filter(Boolean),
    feedbackTextQuestions: feedbackTextQuestions.filter(q => q.label),
    feedbackMinWords: Number(val("feedbackMinWords") || 30),
    updatedAt: serverTimestamp()
  });

  if(!data.title || !data.date){
    alert("活動名稱和日期必填");
    return;
  }

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
}

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
function downloadQrA4(url, title){
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=" + encodeURIComponent(url);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:'Microsoft JhengHei',sans-serif;text-align:center}h1{font-size:28pt;margin-top:20mm}.qr{width:130mm;height:130mm;margin:20mm auto 8mm}.url{font-size:12pt;word-break:break-all}.hint{font-size:18pt;margin-top:8mm}</style></head><body><h1>${esc(title)}</h1><img class="qr" src="${qr}"><div class="hint">請掃描 QR Code</div><div class="url">${esc(url)}</div><script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank"); w.document.write(html); w.document.close();
}

async function viewRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>({docId:d.id,...d.data()}));
  const custom = a.registerFields || [];
  const table = rows.length ? `<table class="data-table">
    <thead><tr><th>#</th><th>姓名</th><th>系級</th><th>學號</th><th>電話</th><th>餐點</th>${custom.map(f=>`<th>${esc(f.label)}</th>`).join("")}<th>操作</th></tr></thead>
    <tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.studentId)}</td><td>${esc(r.phone)}</td><td>${esc(r.meal)}</td>${custom.map(f=>`<td>${esc(r.customAnswers?.[f.label]||"")}</td>`).join("")}<td><button class="ghost-btn danger-btn" data-delete-reg="${id}" data-student="${esc(r.docId)}">刪除</button></td></tr>`).join("")}</tbody>
  </table>` : '<div class="empty">目前沒有人報名</div>';
  setHtml("modalContent", `<button class="modal-close" data-modal-close type="button">×</button><h2>${esc(a.title)}｜報名名單 <span class="quick-count">${rows.length} 人</span></h2>${table}<p><button class="primary-btn" data-export-regs="${id}">下載報名名單</button></p>`);
  $("modal")?.classList.remove("hidden");
}

async function exportRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>d.data());
  const headers = ["姓名","系級","學號","電話","餐點",...(a.registerFields||[]).map(f=>f.label)];
  const data = rows.map(r => [r.name,r.department,r.studentId,r.phone,r.meal,...(a.registerFields||[]).map(f=>r.customAnswers?.[f.label]||"")]);
  downloadCsv(a.title+"_報名名單.csv", [headers,...data]);
}

async function viewFeedbacks(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>({docId:d.id,...d.data()}));
  const qs = a.feedbackQuestions || [];
  const textQs = a.feedbackTextQuestions || [];
  const table = rows.length ? `<table class="data-table"><thead><tr><th>#</th><th>姓名</th><th>學號</th>${qs.map(q=>`<th>${esc(q)}</th>`).join("")}${textQs.map(q=>`<th>${esc(q.label)}</th>`).join("")}<th>心得</th><th>操作</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.studentId)}</td>${qs.map(q=>`<td>${esc(r.ratings?.[q]||"")}</td>`).join("")}${textQs.map(q=>`<td>${esc(r.textAnswers?.[q.label]||"")}</td>`).join("")}<td>${esc(r.comment||"")}</td><td><button class="ghost-btn danger-btn" data-delete-fb="${id}" data-student="${esc(r.docId)}">刪除</button></td></tr>`).join("")}</tbody></table>` : '<div class="empty">目前沒有人填寫回饋</div>';
  setHtml("modalContent", `<button class="modal-close" data-modal-close type="button">×</button><h2>${esc(a.title)}｜回饋資料 <span class="quick-count">${rows.length} 份</span></h2>${table}<p><button class="primary-btn" data-export-fbs="${id}">下載回饋資料</button></p>`);
  $("modal")?.classList.remove("hidden");
}
async function deleteRegistration(activityId, studentId){
  if(!confirm("確定刪除此報名資料？")) return;
  await deleteDoc(doc(db, "activities", activityId, "registrations", studentId));
  viewRegistrations(activityId);
}
async function deleteFeedback(activityId, studentId){
  if(!confirm("確定刪除此回饋資料？")) return;
  await deleteDoc(doc(db, "activities", activityId, "feedbacks", studentId));
  viewFeedbacks(activityId);
}

async function exportFeedbacks(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const textQs = a.feedbackTextQuestions || [];
  const headers = ["姓名","學號",...(a.feedbackQuestions||[]),...textQs.map(q=>q.label),"心得"];
  const data = rows.map(r => [r.name,r.studentId,...(a.feedbackQuestions||[]).map(q=>r.ratings?.[q]||""),...textQs.map(q=>r.textAnswers?.[q.label]||""),r.comment]);
  downloadCsv(a.title+"_回饋資料.csv", [headers,...data]);
}

async function exportFeedbackWord(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const qs = a.feedbackQuestions || [];
  const textQs = a.feedbackTextQuestions || [];
  const total = rows.length || 1;
  const week = weekdayText(a.date);
  const dateLine = `實施日期：${esc(a.date || "")}${week ? `（${week}）` : ""} ${esc(a.time || "")}`;
  const headerLine = `${esc(a.academicYear || "")}學年度第 ${esc(a.semester || "")} 學期明新科技大學　學務處健康與諮商中心資源教室`;
  const tableRows = qs.map((q,i)=>{
    const cells = likertOptions.map(o=>{
      const count = rows.filter(r=>r.ratings?.[q]===o).length;
      return `<td>${round(count/total*100)}%</td>`;
    }).join("");
    return `<tr><td class="item">${i+1}. ${esc(q)}</td>${cells}</tr>`;
  }).join("");
  const textBlocks = textQs.map((q, qi)=>{
    const answers = rows.map((r,i)=>r.textAnswers?.[q.label] ? `<p>(${i+1}) ${esc(r.textAnswers[q.label])}</p>` : "").join("");
    return `<h2>${qs.length + qi + 1}. ${esc(q.label)}</h2>${answers || "<p>無填答資料</p>"}`;
  }).join("");
  const comments = rows.map((r,i)=>r.comment ? `<p>(${i+1}) ${esc(r.comment||"")}</p>` : "").join("");
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @page WordSection1{size:595.3pt 841.9pt;margin:36pt 36pt 36pt 36pt;mso-header-margin:0pt;mso-footer-margin:0pt}
    div.WordSection1{page:WordSection1}
    body{font-family:'DFKai-SB','標楷體','BiauKai',serif;font-size:12pt;line-height:1.35;margin:0}
    h1{font-size:24pt;text-align:center;margin:6pt 0 8pt;font-family:'DFKai-SB','標楷體','BiauKai',serif}
    h2{font-size:12pt;margin:10pt 0 5pt;font-family:'DFKai-SB','標楷體','BiauKai',serif}
    .top{font-size:16pt;text-align:center;font-weight:bold;line-height:1.2;white-space:nowrap}
    .meta{font-size:12pt;margin:4pt 0}
    table{border-collapse:collapse;width:100%;font-size:12pt}
    td,th{border:1px solid #333;padding:4pt;vertical-align:middle;font-size:12pt}
    th{font-weight:bold;text-align:center}
    .item{text-align:justify;text-justify:inter-ideograph;width:48%}
    .item-head{text-align:justify;text-align-last:justify;text-justify:inter-ideograph}
    p{margin:5pt 0}
  </style></head><body><div class="WordSection1">
  <div class="top">${headerLine}</div>
  <h1>「${esc(a.title)}」回饋表</h1>
  <p class="meta">${dateLine}</p>
  <p class="meta">主　　題：${esc(a.title)}</p>
  <p class="meta">活動地點：${esc(a.location||"")}</p>
  <h2>一、活動滿意度</h2>
  <table><tr><th class="item-head">項　目</th>${likertOptions.map(o=>`<th>${o}</th>`).join("")}</tr>${tableRows}</table>
  ${textBlocks}
  <h2>${qs.length + textQs.length + 1}. 本次活動的心得及對你最大的幫助是什麼？</h2>${comments || "<p>無填答資料</p>"}
  </div></body></html>`;
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

function weekdayText(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if(Number.isNaN(d.getTime())) return "";
  return ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][d.getDay()];
}

function formatDateTime(v){ return String(v || "").replace("T"," "); }
function round(n){ return Math.round(n*10)/10; }
function statusText(s){ return {open:"報名中",feedback:"回饋中",closed:"已結束",draft:"草稿"}[s] || "活動"; }
function esc(str){ return String(str || "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

function bindClick(id, handler){
  const el = $(id);
  if(el) el.addEventListener("click", handler);
}

bindClick("loginBtn", async (e) => {
  e.preventDefault();
  try { await signInWithPopup(auth, provider); }
  catch(err){ console.error(err); alert("登入失敗：" + err.message); }
});

bindClick("logoutBtn", () => signOut(auth));
bindClick("newActivityBtn", (e) => { e.preventDefault(); showView("activities"); resetForm(); });
bindClick("resetBtn", (e) => { e.preventDefault(); resetForm(); });
bindClick("addRegisterFieldBtn", (e) => { e.preventDefault(); regFields.push({label:"新題目", type:"text", required:false, options:[]}); renderRegFields(); });
bindClick("addFeedbackQuestionBtn", (e) => { e.preventDefault(); fbQuestions.push(""); renderFbQuestions(); });
bindClick("addFeedbackTextQuestionBtn", (e) => { e.preventDefault(); feedbackTextQuestions.push({label:"", type:"textarea", required:false}); renderFeedbackTextQuestions(); });
bindClick("addAttachmentBtn", (e) => { e.preventDefault(); attachments.push({name:"附件", url:""}); renderAttachments(); });

const activityForm = $("activityForm");
if(activityForm) activityForm.addEventListener("submit", saveActivity);

const adminSearch = $("adminSearch");
if(adminSearch) adminSearch.addEventListener("input", e => { adminSearchText = e.target.value.trim(); renderLists(); });

const addAdminBtn = $("addAdminBtn");
if(addAdminBtn) addAdminBtn.addEventListener("click", async () => {
  const email = val("adminEmailInput").trim();
  if(!email || !email.includes("@")) return alert("請輸入正確 Email");
  if(!adminEmails.includes(email)) adminEmails.push(email);
  await setDoc(doc(db, "settings", "admins"), { emails: adminEmails, updatedAt: serverTimestamp() }, { merge:true });
  setVal("adminEmailInput", "");
  renderAdmins();
});

document.addEventListener("click", async (e) => {
  if(e.target.closest("[data-modal-close]") || e.target.id === "modal"){
    closeModal();
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

  const qrp = e.target.closest("[data-qrprint]");
  if(qrp) return downloadQrA4(qrp.dataset.qrprint, qrp.dataset.title || "QR Code");

  const qr = e.target.closest("[data-qr]");
  if(qr) return downloadQr(qr.dataset.qr, qr.dataset.name || "qr");

  const viewRegs = e.target.closest("[data-view-regs]");
  if(viewRegs) return viewRegistrations(viewRegs.dataset.viewRegs);

  const viewFbs = e.target.closest("[data-view-fbs]");
  if(viewFbs) return viewFeedbacks(viewFbs.dataset.viewFbs);

  const regs = e.target.closest("[data-export-regs]");
  if(regs) return exportRegistrations(regs.dataset.exportRegs);

  const fbs = e.target.closest("[data-export-fbs]");
  if(fbs) return exportFeedbacks(fbs.dataset.exportFbs);

  const word = e.target.closest("[data-export-word]");
  if(word) return exportFeedbackWord(word.dataset.exportWord);

  const copyAct = e.target.closest("[data-copy-activity]");
  if(copyAct) return copyActivity(copyAct.dataset.copyActivity);

  const delReg = e.target.closest("[data-delete-reg]");
  if(delReg) return deleteRegistration(delReg.dataset.deleteReg, delReg.dataset.student);

  const delFb = e.target.closest("[data-delete-fb]");
  if(delFb) return deleteFeedback(delFb.dataset.deleteFb, delFb.dataset.student);

  const removeAdmin = e.target.closest("[data-remove-admin]");
  if(removeAdmin){
    adminEmails = adminEmails.filter(x => x !== removeAdmin.dataset.removeAdmin);
    await setDoc(doc(db, "settings", "admins"), {emails: adminEmails, updatedAt: serverTimestamp()}, {merge:true});
    renderAdmins();
  }
});

document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeModal();
});

onAuthStateChanged(auth, async user => {
  if(!user){
    $("loginView")?.classList.remove("hidden");
    $("appView")?.classList.add("hidden");
    return;
  }
  currentUser = user;
  await loadAdmins();
  if(!isAdmin(user.email)){
    alert("這個帳號沒有後台權限：" + user.email);
    await signOut(auth);
    return;
  }
  $("loginView")?.classList.add("hidden");
  $("appView")?.classList.remove("hidden");
  setText("userInfo", user.email);
  resetForm();
  listenActivities();
});
