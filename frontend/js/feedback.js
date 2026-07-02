
import { db } from "../../shared/js/firebase-app.js";
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
let activity = null;

init();

async function init(){
  const snap = await getDoc(doc(db, "activities", id));
  if(!snap.exists()){
    $("activityHeader").innerHTML = '<div class="empty">找不到活動</div>';
    return;
  }
  activity = { id: snap.id, ...snap.data() };
  renderHeader();
  renderForm();
}

function renderHeader(){
  $("activityHeader").innerHTML = `
    <span class="badge">活動回饋</span>
    <h1>${esc(activity.title)}</h1>
    <div class="info-line"><strong>時間</strong><span>${esc(activity.date || "")} ${esc(activity.time || "")}</span></div>
    <div class="info-line"><strong>地點</strong><span>${esc(activity.location || "")}</span></div>
    ${attachmentHtml(activity.attachments || [])}
  `;
}

function renderForm(){
  const openAt = parseLocalTime(activity.feedbackOpenAt);
  const closeAt = parseLocalTime(activity.feedbackCloseAt);
  const now = Date.now();

  const openByStatus = activity.status === "feedback" || activity.status === "closed";
  const openByTime = openAt ? now >= openAt : false;
  const closedByTime = closeAt ? now > closeAt : false;

  if((!openByStatus && !openByTime) || closedByTime){
    const msg = closedByTime ? "本活動回饋填寫已截止。" : "目前尚未開放填寫回饋。";
    $("feedbackPanel").innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  const qs = activity.feedbackQuestions || defaultQuestions();
  const min = Number(activity.feedbackMinWords || 30);

  $("feedbackPanel").innerHTML = `
    <h2>活動回饋表</h2>
    <form id="fbForm">
      <label>姓名 *</label><input class="field" name="name" required>
      <label>學號 *</label><input class="field" name="studentId" required>
      <h3>一、活動滿意度</h3>
      ${qs.map((q,i) => likertHtml(q,i)).join("")}
      <h3>二、參與活動後，我的心得與感想</h3>
      <p class="meta">請至少填寫 ${min} 字。</p>
      <textarea class="field" name="comment" required></textarea>
      <div id="msg"></div>
      <button class="primary-btn" type="submit">送出回饋</button>
    </form>
  `;
  $("fbForm").addEventListener("submit", submitForm);
}

function likertHtml(q,i){
  const opts = ["非常滿意","滿意","普通","不滿意","非常不滿意"];
  return `<div class="panel mini-panel"><strong>${i+1}. ${esc(q)}</strong>` +
    opts.map(o => `<label class="radio-row"><input type="radio" name="q_${i}" value="${o}" required> ${o}</label>`).join("") +
    `</div>`;
}

async function submitForm(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const comment = String(fd.get("comment") || "").trim();
  const min = Number(activity.feedbackMinWords || 30);
  if(comment.length < min){
    $("msg").innerHTML = `<div class="error">心得至少需要 ${min} 字，目前 ${comment.length} 字。</div>`;
    return;
  }

  const studentIdKey = String(fd.get("studentId") || "").trim().toUpperCase();
  const nameInput = String(fd.get("name") || "").trim();

  const regRef = doc(db, "activities", id, "registrations", studentIdKey);
  const regSnap = await getDoc(regRef);
  if(!regSnap.exists()){
    $("msg").innerHTML = '<div class="error">查無此學號的報名紀錄，請確認是否有完成報名。</div>';
    return;
  }

  const regName = String(regSnap.data().name || "").trim();
  if(regName && nameInput && regName !== nameInput){
    $("msg").innerHTML = '<div class="error">姓名與報名資料不一致，請確認姓名或學號。</div>';
    return;
  }

  const fbRef = doc(db, "activities", id, "feedbacks", studentIdKey);
  const fbSnap = await getDoc(fbRef);
  if(fbSnap.exists()){
    $("msg").innerHTML = '<div class="error">這個學號已經填寫過回饋。</div>';
    return;
  }

  const qs = activity.feedbackQuestions || defaultQuestions();
  const ratings = {};
  qs.forEach((q,i) => ratings[q] = fd.get("q_" + i));

  try{
    await setDoc(fbRef, {
      name: nameInput,
      studentId: studentIdKey,
      ratings,
      comment,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "activities", id), { feedbackCount: increment(1) });
    $("feedbackPanel").innerHTML = '<div class="success"><h2>回饋已送出！</h2><p>謝謝你的填寫。</p></div>';
  }catch(err){
    console.error(err);
    $("msg").innerHTML = `<div class="error">回饋送出失敗：${esc(err.message)}</div>`;
  }
}

function defaultQuestions(){
  return ["本次活動內容對我有幫助。","活動安排與流程清楚。","活動讓我有新的學習或體驗。","整體而言，我對本次活動感到滿意。"];
}

function parseLocalTime(value){
  if(!value) return null;
  if(typeof value === "string"){
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function attachmentHtml(files){
  if(!files.length) return "";
  return `<h3>活動附件</h3>${files.map(f => `<p>📎 <a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name || f.url)}</a></p>`).join("")}`;
}

function esc(str){
  return String(str || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
