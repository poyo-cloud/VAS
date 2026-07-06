const APP_VERSION = "1.14.3";
const STORE_KEY = "research-vas-mvp-v1";
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const headerSubnav = document.querySelector("#headerSubnav");
let db = loadDb();
let route = { page:"projects", projectId:null, tab:"settings" };
let run = null;
let vasPointerState = null;
let sortPointerState = null;
let suppressClickUntil = 0;
const VAS_BASELINE_Y = 50;
const VAS_BASELINE_TOUCH_TOLERANCE = 6;
const VAS_BASELINE_CROSSING_ZONE = 8;

function loadDb(){
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY));
    if (value?.projects && value?.sessions) {
      value.projects.forEach(p => p.vas_items.forEach(item => {
        item.min_value = 0;
        item.max_value = 100;
      }));
      return value;
    }
  } catch (_error) {}
  return { schemaVersion:1, projects:[], sessions:[] };
}
function saveDb(){ localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
function project(){ return db.projects.find(p => p.project_id === route.projectId); }
function toast(message){ const el=document.querySelector("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),1800); }
function go(page, options={}){
  if(!saveActiveEditorBeforeNavigation())return false;
  route={...route,page,...options};render();scrollTo(0,0);return true;
}
function saveActiveEditorBeforeNavigation(){
  const p=project(),projectForm=document.querySelector("#projectForm"),conditionForm=document.querySelector("#conditionBatchForm"),vasForm=document.querySelector("#vasBatchForm");
  const form=projectForm||conditionForm||vasForm;
  if(!form||!p)return true;
  const missing=[...form.querySelectorAll("[required]")].find(field=>!String(field.value).trim());
  if(missing){
    missing.focus();
    missing.reportValidity();
    toast("必須項目を入力してください");
    return false;
  }
  if(!form.reportValidity()){toast("必須項目を入力してください");return false}
  const stamp=now();
  if(projectForm){
    const data=new FormData(projectForm),name=data.get("name").trim(),description=data.get("description").trim(),blind=data.has("blind");
    if(name!==p.project_name||description!==p.description||blind!==Boolean(p.hide_condition_during_run)){
      p.project_name=name;p.description=description;p.hide_condition_during_run=blind;p.updated_at=stamp;saveDb();toast("プロジェクト情報を保存しました");
    }
  }
  if(conditionForm){
    const next=[...conditionForm.querySelectorAll(".condition-entry")].map((row,index)=>({
      condition_id:row.dataset.conditionId||uid("condition"),
      label:row.querySelector('[name="condition_label"]').value.trim(),
      description:"",
      display_order:index+1,created_at:row.dataset.createdAt||stamp,updated_at:stamp
    }));
    const core=items=>items.map(item=>({condition_id:item.condition_id,label:item.label,description:item.description,display_order:item.display_order}));
    if(JSON.stringify(core(next))!==JSON.stringify(core([...p.conditions].sort((a,b)=>a.display_order-b.display_order)))){
      const hadPatterns=p.patterns.length>0;
      p.conditions=next;p.patterns=[];p.updated_at=stamp;saveDb();
      toast(hadPatterns?"条件を保存しました。提示パターンは再作成してください":"条件を保存しました");
    }
  }
  if(vasForm){
    const next=[...vasForm.querySelectorAll(".vas-entry")].map((row,index)=>({
      vas_item_id:row.dataset.vasId||uid("vas"),
      item_name:row.querySelector('[name="item_name"]').value.trim(),
      question_text:row.querySelector('[name="question_text"]').value.trim(),
      left_label:row.querySelector('[name="left_label"]').value.trim(),
      right_label:row.querySelector('[name="right_label"]').value.trim(),
      min_value:0,max_value:100,display_order:index+1,created_at:row.dataset.createdAt||stamp,updated_at:stamp
    }));
    const core=items=>items.map(item=>({vas_item_id:item.vas_item_id,item_name:item.item_name,question_text:item.question_text,left_label:item.left_label,right_label:item.right_label,display_order:item.display_order}));
    if(JSON.stringify(core(next))!==JSON.stringify(core([...p.vas_items].sort((a,b)=>a.display_order-b.display_order)))){
      p.vas_items=next;p.updated_at=stamp;saveDb();toast("VAS項目を保存しました");
    }
  }
  return true;
}
function fmt(date){ return date ? new Date(date).toLocaleString("ja-JP") : "—"; }
function slug(value){ return String(value).trim().replace(/[\\/:*?"<>|]/g,"_").replace(/\s+/g,"_") || "untitled"; }
function dataSectionIcon(){return `<svg class="data-section-icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"></ellipse><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path></svg>`}

document.addEventListener("click", event => {
  if(Date.now()<suppressClickUntil){event.preventDefault();return}
  const target=event.target.closest("[data-action]"); if(!target) return;
  const action=target.dataset.action;
  if(action==="home") go("projects",{projectId:null});
  if(action==="new-project") editProject();
  if(action==="open-project") go("project",{projectId:target.dataset.id,tab:"settings"});
  if(action==="open-data") go("project",{projectId:target.dataset.id,tab:"sessions"});
  if(action==="start-project"){route.projectId=target.dataset.id;route.tab="sessions";startForm()}
  if(action==="edit-project") editProject(target.dataset.id);
  if(action==="duplicate-project") duplicateProject(target.dataset.id);
  if(action==="delete-project") deleteProject(target.dataset.id);
  if(action==="tab") go("project",{tab:target.dataset.tab});
  if(action==="add-condition"||action==="edit-condition") editConditions();
  if(action==="delete-condition") removeEntity("conditions","condition_id",target.dataset.id);
  if(action==="append-condition-row") appendConditionRow();
  if(action==="remove-condition-row") removeConditionRow(target);
  if(action==="add-item"||action==="edit-item") editVasItems();
  if(action==="delete-item") removeEntity("vas_items","vas_item_id",target.dataset.id);
  if(action==="append-vas-row") appendVasRow();
  if(action==="remove-vas-row") removeVasRow(target);
  if(action==="pattern-choice") patternChoice();
  if(action==="new-pattern") editPattern();
  if(action==="edit-pattern") editPattern(target.dataset.id);
  if(action==="delete-pattern") removeEntity("patterns","pattern_id",target.dataset.id);
  if(action==="random-pattern") randomPatternForm();
  if(action==="start") startForm();
  if(action==="begin-run") beginRun();
  if(action==="run-next") runNext();
  if(action==="run-back") runBack();
  if(action==="clear-current-vas") clearCurrentVas(target.dataset.itemId);
  if(action==="export") exportXlsx();
  if(action==="delete-session") deleteSession(target.dataset.id);
});
document.addEventListener("pointerdown", event => {
  const handle=event.target.closest(".drag-handle");
  if(handle){
    const item=handle.closest("[data-sort-item]"),container=item?.parentElement;
    if(!item||!container)return;
    event.preventDefault();
    const items=getSortItems(container);
    const rect=item.getBoundingClientRect(),ghost=item.cloneNode(true);
    ghost.classList.add("drag-ghost");ghost.style.width=`${rect.width}px`;ghost.style.left=`${rect.left}px`;ghost.style.top=`${rect.top}px`;
    ghost.querySelectorAll("button,input,textarea,select").forEach(control=>control.setAttribute("tabindex","-1"));
    document.body.appendChild(ghost);
    sortPointerState={
      pointerId:event.pointerId,item,container,type:container.dataset.sortType,
      moved:false,startY:event.clientY,startX:event.clientX,ghost,
      originIndex:items.indexOf(item),activeIndex:items.indexOf(item),
      slots:captureSortSlots(items)
    };
    handle.setPointerCapture?.(event.pointerId);
    item.classList.add("sort-placeholder");
    return;
  }
  const track=event.target.closest(".vas-track");
  if(!track||!run||getCurrentAnswer(track.dataset.itemId)?.value!=null)return;
  event.preventDefault();
  vasPointerState={pointerId:event.pointerId,track,startX:event.clientX,startY:event.clientY,hasStroke:false,points:[]};
  track.setPointerCapture?.(event.pointerId);
  updateVasDraftFromPointer(vasPointerState,event);
});
document.addEventListener("pointermove", event => {
  if(sortPointerState?.pointerId===event.pointerId){
    if(Math.hypot(event.clientX-sortPointerState.startX,event.clientY-sortPointerState.startY)>5)sortPointerState.moved=true;
    sortPointerState.ghost.style.transform=`translate(${event.clientX-sortPointerState.startX}px,${event.clientY-sortPointerState.startY}px) rotate(1deg)`;
    autoScrollDuringSort(event.clientY);
    const targetIndex=getSortSlotIndex(sortPointerState);
    if(targetIndex!==null&&targetIndex!==sortPointerState.activeIndex){
      moveSortPlaceholder(sortPointerState,targetIndex);
    }
    return;
  }
  if(vasPointerState?.pointerId===event.pointerId)updateVasDraftFromPointer(vasPointerState,event);
});
document.addEventListener("pointerup", event => {
  if(sortPointerState?.pointerId===event.pointerId){
    sortPointerState.item.classList.remove("sort-placeholder");
    sortPointerState.ghost.remove();
    if(sortPointerState.moved){suppressClickUntil=Date.now()+300;persistSort(sortPointerState.type,sortPointerState.container)}
    sortPointerState=null;return;
  }
  if(!vasPointerState||vasPointerState.pointerId!==event.pointerId)return;
  updateVasDraftFromPointer(vasPointerState,event);
  vasPointerState.track.releasePointerCapture?.(event.pointerId);
  if(vasPointerState.hasStroke)commitVasStroke(vasPointerState);else updateStrokeLine(vasPointerState.track,".vas-draft-line",[]);
  vasPointerState=null;
});
document.addEventListener("pointercancel", event => {
  if(sortPointerState?.pointerId===event.pointerId){
    const state=sortPointerState;
    if(state.activeIndex!==state.originIndex)moveSortPlaceholder(state,state.originIndex);
    state.item.classList.remove("sort-placeholder");
    state.ghost.remove();
    sortPointerState=null;
  }
  if(vasPointerState?.pointerId===event.pointerId){updateStrokeLine(vasPointerState.track,".vas-draft-line",[]);vasPointerState=null}
});
function getSortItems(container){
  return [...container.children].filter(item=>item.hasAttribute("data-sort-item"));
}
function persistSort(type,container){
  const items=getSortItems(container);
  if(type==="projects"){
    const byId=new Map(db.projects.map(item=>[item.project_id,item]));
    db.projects=items.map(item=>byId.get(item.dataset.id)).filter(Boolean);saveDb();
  }else if(type==="patterns"){
    const p=project(),byId=new Map(p.patterns.map(item=>[item.pattern_id,item]));
    p.patterns=items.map(item=>byId.get(item.dataset.id)).filter(Boolean);
    p.patterns.forEach((item,index)=>item.display_order=index+1);saveDb();
  }else if(type==="pattern-conditions")items.forEach((item,index)=>item.querySelector(".order-number").textContent=index+1);
}
function captureSortSlots(items){
  return items.map(item=>{
    const rect=item.getBoundingClientRect();
    return{
      left:rect.left+scrollX,right:rect.right+scrollX,
      top:rect.top+scrollY,bottom:rect.bottom+scrollY,
      width:rect.width,height:rect.height,
      centerX:rect.left+scrollX+rect.width/2,
      centerY:rect.top+scrollY+rect.height/2
    };
  });
}
function getSortSlotIndex(state){
  if(!state.moved)return null;
  const ghost=state.ghost.getBoundingClientRect();
  const point={x:(ghost.left+ghost.right)/2+scrollX,y:(ghost.top+ghost.bottom)/2+scrollY};
  const bounds=state.slots.reduce((result,slot)=>({
    left:Math.min(result.left,slot.left),
    right:Math.max(result.right,slot.right),
    top:Math.min(result.top,slot.top),
    bottom:Math.max(result.bottom,slot.bottom)
  }),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
  const edgePadding=Math.max(24,Math.min(state.slots[0]?.width||0,state.slots[0]?.height||0)*.18);
  if(point.x<bounds.left-edgePadding||point.x>bounds.right+edgePadding||point.y<bounds.top-edgePadding||point.y>bounds.bottom+edgePadding)return null;
  const distance=(slot)=>{
    const x=(point.x-slot.centerX)/Math.max(slot.width,1);
    const y=(point.y-slot.centerY)/Math.max(slot.height,1);
    return Math.hypot(x,y);
  };
  let candidate=0,candidateDistance=Infinity;
  state.slots.forEach((slot,index)=>{
    const value=distance(slot);
    if(value<candidateDistance){candidate=index;candidateDistance=value}
  });
  if(candidate===state.activeIndex)return candidate;
  const activeDistance=distance(state.slots[state.activeIndex]);
  const hysteresis=.08;
  return candidateDistance+hysteresis<activeDistance?candidate:state.activeIndex;
}
function moveSortPlaceholder(state,targetIndex){
  const itemsWithoutDragged=getSortItems(state.container).filter(item=>item!==state.item);
  const before=itemsWithoutDragged[targetIndex]||[...state.container.children].find(item=>!item.hasAttribute("data-sort-item"))||null;
  animateSortShift(state.container,()=>state.container.insertBefore(state.item,before),state.item);
  state.activeIndex=targetIndex;
}
function autoScrollDuringSort(pointerY){
  const edge=96,maxSpeed=20;
  if(pointerY<edge){
    const speed=-maxSpeed*(1-pointerY/edge);
    window.scrollBy(0,speed);
  }else if(pointerY>window.innerHeight-edge){
    const speed=maxSpeed*(1-(window.innerHeight-pointerY)/edge);
    window.scrollBy(0,speed);
  }
}
function animateSortShift(container,mutate,placeholder=null){
  const items=getSortItems(container);
  const previous=new Map(items.map(item=>[item,item.getBoundingClientRect()]));
  items.forEach(item=>{item._sortAnimation?.cancel();item._sortAnimation=null});
  mutate();
  items.forEach(item=>{
    const before=previous.get(item),after=item.getBoundingClientRect();
    const deltaX=before.left-after.left,deltaY=before.top-after.top;
    if(!deltaX&&!deltaY)return;
    if(item===placeholder)return;
    if(typeof item.animate==="function"){
      item._sortAnimation=item.animate(
        [{transform:`translate(${deltaX}px,${deltaY}px)`},{transform:"translate(0,0)"}],
        {duration:280,easing:"cubic-bezier(.22,.8,.24,1)"}
      );
      item._sortAnimation.addEventListener("finish",()=>{item._sortAnimation=null},{once:true});
      return;
    }
    item.style.transition="none";item.style.transform=`translate(${deltaX}px,${deltaY}px)`;
    requestAnimationFrame(()=>{void item.offsetWidth;item.style.transition="transform 300ms cubic-bezier(.2,.8,.2,1)";item.style.transform=""});
  });
}

function render(){
  const p=project();
  const sectionNames={settings:"プロジェクト情報",conditions:"条件・刺激",vas:"VAS項目",patterns:"パターン",sessions:"実験"};
  const sectionName=sectionNames[route.tab];
  const hasProjectSubnav=route.page==="project"&&p&&["sessions","settings","conditions","vas","patterns"].includes(route.tab);
  nav.innerHTML = p ? `
    <div class="breadcrumb" aria-label="現在位置">
      <button data-action="home">プロジェクト一覧</button>
      <span aria-hidden="true">›</span>
      <strong>${esc(p.project_name)}</strong>
      ${sectionName?`<span aria-hidden="true">›</span><strong>${sectionName}</strong>`:""}
    </div>` : "";
  if(headerSubnav)headerSubnav.innerHTML=hasProjectSubnav?projectSubnav():"";
  document.querySelector(".topbar").classList.toggle("has-subnav",Boolean(hasProjectSubnav));
  if(route.page==="projects") renderProjects();
  else if(route.page==="project" && p) renderProject();
  else if(route.page==="run" && run) renderRun();
  else go("projects",{projectId:null});
}

function renderProjects(){
  app.innerHTML=`<div class="hero"><div><h1>プロジェクト一覧</h1></div></div>
  <div class="grid" data-sort-type="projects">${db.projects.map(p=>`<article class="card project-card" data-sort-item data-id="${p.project_id}">
    <div class="project-card-tools">
      <button class="drag-handle" type="button" aria-label="プロジェクトを並べ替え">⠿</button>
      <div class="card-icon-actions">
        <button class="icon-button" type="button" data-action="duplicate-project" data-id="${p.project_id}" aria-label="${esc(p.project_name)}を複製" title="複製">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
        </button>
        <button class="icon-button delete-icon-button" type="button" data-action="delete-project" data-id="${p.project_id}" aria-label="${esc(p.project_name)}を削除" title="削除">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></svg>
        </button>
      </div>
    </div>
    <div><p class="meta">更新 ${fmt(p.updated_at)}</p><h2>${esc(p.project_name)}</h2><p class="muted">${esc(p.description||"説明なし")}</p></div>
    <div class="meta">条件 ${p.conditions.length} · VAS ${p.vas_items.length} · パターン ${p.patterns.length}</div>
    <div class="actions project-card-actions"><button class="btn data-section-button" data-action="open-data" data-id="${p.project_id}">${dataSectionIcon()}<span>実験</span></button><button class="btn secondary" data-action="open-project" data-id="${p.project_id}">設定</button></div>
  </article>`).join("")}<button class="add-tile" type="button" data-action="new-project" aria-label="プロジェクトを追加"><span>＋</span></button></div>`;
}

function editProject(id){
  const existing=db.projects.find(p=>p.project_id===id);
  app.innerHTML=`${existing?"":`<div class="hero"><div><h1>新規プロジェクト</h1></div></div>`}<form id="projectForm" class="card form-grid">
    <div class="field full"><label>プロジェクト名 *</label><input name="name" required value="${esc(existing?.project_name)}"></div>
    <div class="field full"><label>説明</label><textarea name="description">${esc(existing?.description)}</textarea></div>
    <div class="field full"><label class="check-label"><input name="blind" type="checkbox" ${existing?.hide_condition_during_run?"checked":""}> 回答画面で条件名を表示しない（盲検化）</label></div>
    ${existing?"":`<div class="actions field full"><button class="btn" type="submit">保存</button><button class="btn ghost" type="button" data-action="home">キャンセル</button></div>`}</form>`;
  document.querySelector("#projectForm").onsubmit=e=>{
    e.preventDefault();if(existing)return;
    const data=new FormData(e.currentTarget),stamp=now();
    db.projects.push({project_id:uid("project"),project_name:data.get("name").trim(),description:data.get("description").trim(),hide_condition_during_run:data.has("blind"),created_at:stamp,updated_at:stamp,conditions:[],vas_items:[],patterns:[]});
    saveDb();go("projects",{projectId:null});
  };
}
function duplicateProject(id){
  const source=db.projects.find(p=>p.project_id===id); if(!source)return;
  const copy=structuredClone(source), stamp=now(); copy.project_id=uid("project"); copy.project_name+= "（コピー）"; copy.created_at=stamp; copy.updated_at=stamp;
  copy.conditions.forEach(c=>c.condition_id=uid("condition")); copy.vas_items.forEach(v=>v.vas_item_id=uid("vas"));
  copy.patterns=[]; db.projects.push(copy); saveDb(); render(); toast("複製しました（パターンは再設定してください）");
}
function deleteProject(id){ if(!confirm("プロジェクトと関連データを削除しますか？"))return; db.projects=db.projects.filter(p=>p.project_id!==id); db.sessions=db.sessions.filter(s=>s.project_id!==id); saveDb(); render(); }

function renderProject(){
  const p=project();
  if(route.tab==="settings") editProject(p.project_id);
  if(route.tab==="conditions") editConditions();
  if(route.tab==="vas") editVasItems();
  if(route.tab==="patterns") renderPatterns(p);
  if(route.tab==="sessions") renderSessions(p);
}
function projectSubnav(){
  return `<div class="project-subnav" role="navigation" aria-label="プロジェクト内メニュー">
    <button data-action="tab" data-tab="sessions" class="data-section-button experiment-start-tab ${route.tab==="sessions"?"active":""}">${dataSectionIcon()}<span>実験</span></button>
    <button data-action="tab" data-tab="settings" class="${route.tab==="settings"?"active":""}">プロジェクト情報</button>
    <button data-action="tab" data-tab="conditions" class="${route.tab==="conditions"?"active":""}">条件・刺激</button>
    <button data-action="tab" data-tab="vas" class="${route.tab==="vas"?"active":""}">VAS項目</button>
    <button data-action="tab" data-tab="patterns" class="${route.tab==="patterns"?"active":""}">パターン</button>
  </div>`;
}
function header(_p, subtitle){ return `<div class="hero project-page-heading"><div><h1>${subtitle}</h1></div></div>`; }
function entityRows(items,type){
  if(!items.length)return `<p class="muted">まだ登録されていません。</p>`;
  const idKey=type==="condition"?"condition_id":"vas_item_id";
  return [...items].sort((a,b)=>a.display_order-b.display_order).map(x=>`<div class="list-row"><div><strong>${esc(type==="condition"?x.label:x.item_name)}</strong><span class="meta">${esc(type==="condition"?x.description:`${x.left_label} ←→ ${x.right_label}`)}</span></div></div>`).join("");
}
function conditionRowMarkup(item={}){
  return `<section class="condition-entry" data-sort-item data-condition-id="${esc(item.condition_id)}" data-created-at="${esc(item.created_at)}">
    <div class="condition-entry-line"><button class="drag-handle" type="button" aria-label="条件を並べ替え">⠿</button><div class="field"><label class="sr-only">ラベル</label><input name="condition_label" required placeholder="ラベル *" value="${esc(item.label)}"></div><button class="icon-button delete-icon-button" type="button" data-action="remove-condition-row" aria-label="この条件を削除" title="削除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></svg></button></div>
  </section>`;
}
function editConditions(){
  const p=project(),items=[...p.conditions].sort((a,b)=>a.display_order-b.display_order);
  app.innerHTML=`<form id="conditionBatchForm">
    <div id="conditionEntryList" class="vas-entry-list" data-sort-type="conditions">${items.map(item=>conditionRowMarkup(item)).join("")}<button class="add-row-tile" type="button" data-action="append-condition-row" aria-label="条件を追加"><span>＋</span></button></div>
  </form>`;
  document.querySelector("#conditionBatchForm").onsubmit=e=>e.preventDefault();
}
function appendConditionRow(){const list=document.querySelector("#conditionEntryList"),tile=list.querySelector(".add-row-tile");tile.insertAdjacentHTML("beforebegin",conditionRowMarkup());tile.previousElementSibling.querySelector("input").focus()}
function removeConditionRow(target){const list=document.querySelector("#conditionEntryList");if(list.querySelectorAll(".condition-entry").length===1){toast("少なくとも1条件必要です");return}target.closest(".condition-entry").remove()}
function vasRowMarkup(item={}){
  return `<section class="vas-entry" data-sort-item data-vas-id="${esc(item.vas_item_id)}" data-created-at="${esc(item.created_at)}">
    <div class="vas-entry-head"><button class="drag-handle" type="button" aria-label="VAS項目を並べ替え">⠿</button><button class="icon-button delete-icon-button" type="button" data-action="remove-vas-row" aria-label="このVAS項目を削除" title="削除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></svg></button></div>
    <div class="form-grid">
      <div class="field"><label>項目名 *</label><input name="item_name" required value="${esc(item.item_name)}"></div>
      <div class="field"><label>質問文 *</label><input name="question_text" required value="${esc(item.question_text)}"></div>
      <div class="field"><label>左端ラベル *</label><input name="left_label" required value="${esc(item.left_label)}"></div>
      <div class="field"><label>右端ラベル *</label><input name="right_label" required value="${esc(item.right_label)}"></div>
    </div>
  </section>`;
}
function editVasItems(){
  const p=project();
  const items=[...p.vas_items].sort((a,b)=>a.display_order-b.display_order);
  app.innerHTML=`<form id="vasBatchForm">
    <div id="vasEntryList" class="vas-entry-list" data-sort-type="vas">${items.map(item=>vasRowMarkup(item)).join("")}<button class="add-row-tile" type="button" data-action="append-vas-row" aria-label="VAS項目を追加"><span>＋</span></button></div>
  </form>`;
  document.querySelector("#vasBatchForm").onsubmit=e=>e.preventDefault();
}
function appendVasRow(){
  const list=document.querySelector("#vasEntryList"),tile=list.querySelector(".add-row-tile");
  tile.insertAdjacentHTML("beforebegin",vasRowMarkup());
  tile.previousElementSibling.querySelector("input").focus();
}
function removeVasRow(target){
  const list=document.querySelector("#vasEntryList");
  if(list.querySelectorAll(".vas-entry").length===1){ toast("少なくとも1項目必要です"); return; }
  target.closest(".vas-entry").remove();
}
function removeEntity(list,key,id){
  const p=project(); if(!confirm("削除しますか？"))return;
  p[list]=p[list].filter(x=>x[key]!==id);
  if(list==="conditions") p.patterns=p.patterns.filter(pattern=>!pattern.condition_order.includes(id));
  p.updated_at=now(); saveDb(); render();
}

function renderPatterns(p){
  app.innerHTML=`${!p.conditions.length?`<div class="notice">先に「条件・刺激」で条件を登録してください。</div>`:""}
  <div class="grid" data-sort-type="patterns">${p.patterns.map(pattern=>`<article class="card project-card pattern-card" data-sort-item data-id="${pattern.pattern_id}">
    <div class="project-card-tools">
      <button class="drag-handle" type="button" aria-label="パターンを並べ替え">⠿</button>
      <button class="icon-button delete-icon-button" type="button" data-action="delete-pattern" data-id="${pattern.pattern_id}" aria-label="${esc(pattern.pattern_name)}を削除" title="削除">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></svg>
      </button>
    </div>
    <div class="pattern-title-row"><h2>${esc(pattern.pattern_name)}</h2><button class="btn secondary small" data-action="edit-pattern" data-id="${pattern.pattern_id}">編集</button></div>
    <div><p class="meta">${esc(pattern.generation_method)} · seed ${esc(pattern.random_seed||"—")}</p><p class="muted">${pattern.condition_order.map(id=>esc(p.conditions.find(c=>c.condition_id===id)?.label||"[削除済み]")).join(" → ")}</p></div>
  </article>`).join("")}<button class="add-tile" type="button" data-action="pattern-choice" aria-label="パターンを作成" ${p.conditions.length?"":"disabled"}><span>＋</span></button></div>`;
}
function patternChoice(){const p=project();app.innerHTML=header(p,"パターン作成方法")+`<div class="grid"><button class="choice-card" data-action="new-pattern"><strong>手動作成</strong><span>条件をドラッグして提示順を設定</span></button><button class="choice-card" data-action="random-pattern"><strong>ランダム生成</strong><span>seedを保存して重複なく生成</span></button></div>`}
function editPattern(id){
  const p=project(); if(!p.conditions.length){toast("先に条件を登録してください");return}
  const x=p.patterns.find(pattern=>pattern.pattern_id===id), order=x?[...x.condition_order]:p.conditions.sort((a,b)=>a.display_order-b.display_order).map(c=>c.condition_id);
  app.innerHTML=(x?"":header(p,"手動パターン作成"))+`<form id="patternForm" class="card"><div class="field"><label>パターン名 *</label><input name="name" required value="${esc(x?.pattern_name||`Pattern ${p.patterns.length+1}`)}"></div><h3 style="margin-top:24px">提示順</h3><div id="orderList" class="order-list" data-sort-type="pattern-conditions">${orderMarkup(order,p)}</div><div class="actions" style="margin-top:20px"><button class="btn">保存</button><button class="btn ghost" type="button" data-action="tab" data-tab="patterns">キャンセル</button></div></form>`;
  document.querySelector("#patternForm").onsubmit=e=>{e.preventDefault();const ids=[...document.querySelectorAll("#orderList [data-condition]")].map(el=>el.dataset.condition),key=ids.join("|");if(p.patterns.some(pattern=>pattern.pattern_id!==x?.pattern_id&&pattern.condition_order.join("|")===key)){toast("同一の提示順は登録できません");return}const stamp=now(),item=x||{pattern_id:uid("pattern"),generation_method:"manual",random_seed:"",generated_at:"",created_at:stamp};item.pattern_name=new FormData(e.currentTarget).get("name").trim();item.condition_order=ids;item.updated_at=stamp;if(!x)p.patterns.push(item);saveDb();go("project",{tab:"patterns"});toast(x?"パターンを更新しました":"パターンを追加しました");};
}
function orderMarkup(order,p){return order.map((id,i)=>`<div class="order-row" data-sort-item data-condition="${id}"><button class="drag-handle" type="button" aria-label="提示順を並べ替え">⠿</button><span class="order-number">${i+1}</span><strong>${esc(p.conditions.find(c=>c.condition_id===id)?.label)}</strong></div>`).join("");}
function randomPatternForm(){
  const p=project(); if(p.conditions.length<2){toast("条件を2件以上登録してください");return}
  const existingOrders=new Set(p.patterns.map(pattern=>pattern.condition_order.join("|"))),maximum=Math.min(100,Math.max(0,factorial(p.conditions.length)-existingOrders.size));
  if(maximum===0){toast("作成可能な提示順はすべて登録済みです");return}
  app.innerHTML=header(p,"ランダムパターン生成")+`<form id="randomForm" class="card form-grid"><div class="notice field full">同一の提示順は生成しません。既存パターンは保持されます。</div><div class="field"><label>生成数（最大${maximum}）</label><input name="count" type="number" min="1" max="${maximum}" value="${Math.min(3,maximum)}"></div><div class="field"><label>seed（空欄で自動生成）</label><input name="seed" inputmode="numeric"></div><div class="actions field full"><button class="btn">生成して追加</button><button class="btn ghost" type="button" data-action="tab" data-tab="patterns">キャンセル</button></div></form>`;
  document.querySelector("#randomForm").onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget),count=Number(data.get("count")),baseSeed=data.get("seed").trim()||String(crypto.getRandomValues(new Uint32Array(1))[0]),seen=new Set(existingOrders),stamp=now(),patterns=[];let attempt=0;while(patterns.length<count&&attempt<10000){const seed=`${baseSeed}:${attempt++}`,order=shuffle(p.conditions.map(c=>c.condition_id),seed),key=order.join("|");if(seen.has(key))continue;seen.add(key);patterns.push({pattern_id:uid("pattern"),pattern_name:`Random ${p.patterns.length+patterns.length+1}`,condition_order:order,generation_method:"random",random_seed:seed,generated_at:stamp,created_at:stamp,updated_at:stamp});}p.patterns.push(...patterns);saveDb();go("project",{tab:"patterns"});toast(`${patterns.length}件のパターンを追加しました`);};
}
function factorial(number){let result=1;for(let i=2;i<=number;i++)result*=i;return result}
function hashSeed(text){let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=hashSeed(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function shuffle(values,seed){const r=rng(seed),out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}

function renderSessions(p){
  const sessions=db.sessions.filter(s=>s.project_id===p.project_id).sort((a,b)=>b.started_at.localeCompare(a.started_at));
  app.innerHTML=`<div class="actions" style="margin-bottom:18px"><button class="btn" data-action="start">実験開始</button><button class="btn secondary" data-action="export">XLSX出力</button></div>
  ${(!p.conditions.length||!p.vas_items.length||!p.patterns.length)?`<div class="notice">実験開始には、条件・VAS項目・パターンを各1件以上設定してください。</div>`:""}
  <section class="card"><h2>実施履歴</h2><div class="table-wrap"><table><thead><tr><th>被験者ID</th><th>セッションID</th><th>パターン</th><th>開始</th><th>完了</th><th></th></tr></thead><tbody>${sessions.length?sessions.map(s=>`<tr><td>${esc(s.subject_id)}</td><td>${esc(s.session_id)}</td><td>${esc(s.pattern_name)}</td><td>${fmt(s.started_at)}</td><td>${fmt(s.completed_at)}</td><td><button class="icon-button delete-icon-button table-icon-button" type="button" data-action="delete-session" data-id="${s.assignment_id}" aria-label="${esc(s.subject_id)} ${esc(s.session_id)}の実験データを削除" title="削除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"></path></svg></button></td></tr>`).join(""):`<tr><td colspan="6" class="muted">まだ実験データがありません。</td></tr>`}</tbody></table></div></section>`;
}
function startForm(){
  const p=project();if(!p.conditions.length||!p.vas_items.length||!p.patterns.length){toast("設定が不足しています");return}
  app.innerHTML=`<div class="hero project-page-heading"><div><h1>実験を開始</h1></div></div><form id="startForm" class="card form-grid"><div class="field"><label>被験者ID *</label><input name="subject" required autocomplete="off"></div><div class="field"><label>セッションID *</label><input name="session" required value="${new Date().toISOString().slice(0,10).replaceAll("-","")}_01" autocomplete="off"></div><div class="field full"><label>提示パターン *</label><select name="pattern">${p.patterns.map(x=>`<option value="${x.pattern_id}">${esc(x.pattern_name)} — ${x.condition_order.map(id=>p.conditions.find(c=>c.condition_id===id)?.label).join(" → ")}</option>`).join("")}</select></div><div class="actions field full"><button class="btn" data-action="begin-run">開始</button><button class="btn ghost" type="button" data-action="tab" data-tab="sessions">キャンセル</button></div></form>`;
}
function beginRun(){
  const form=document.querySelector("#startForm");if(!form?.reportValidity())return;const p=project(),data=new FormData(form),pattern=p.patterns.find(x=>x.pattern_id===data.get("pattern"));
  run={projectId:p.project_id,subjectId:data.get("subject").trim(),sessionId:data.get("session").trim(),patternId:pattern.pattern_id,patternName:pattern.pattern_name,conditionOrder:[...pattern.condition_order],conditionIndex:0,currentAnswers:{},responses:[],startedAt:now()};
  go("run");
}
function currentRunParts(){const p=db.projects.find(x=>x.project_id===run.projectId),condition=p.conditions.find(c=>c.condition_id===run.conditionOrder[run.conditionIndex]),items=[...p.vas_items].sort((a,b)=>a.display_order-b.display_order);return{p,condition,items}}
function getCurrentAnswer(itemId){return run.currentAnswers[itemId]||{value:null,stroke:[]}}
function loadCurrentAnswers(){
  const {items}=currentRunParts();run.currentAnswers={};
  items.forEach(item=>{const response=run.responses.find(r=>r.trial_order===run.conditionIndex+1&&r.vas_item_id===item.vas_item_id);if(response)run.currentAnswers[item.vas_item_id]={value:response.value,stroke:response.stroke_points||[]}});
}
function renderRun(){
  const {p,condition,items}=currentRunParts(),answered=items.filter(item=>getCurrentAnswer(item.vas_item_id).value!==null).length,complete=answered===items.length,last=run.conditionIndex===run.conditionOrder.length-1;
  const conditionHeader=p.hide_condition_during_run?`<div class="blind-banner"><span>${run.conditionIndex+1}回目</span></div>`:`<div class="condition-banner"><small>条件 ${run.conditionIndex+1} / ${run.conditionOrder.length}</small><h2>${esc(condition.label)}</h2>${condition.description?`<p>${esc(condition.description)}</p>`:""}</div>`;
  nav.innerHTML="";app.innerHTML=`<div class="run-shell"><div class="hero"><div><p class="muted">${esc(run.subjectId)} / ${esc(run.sessionId)}</p><h1>VAS回答</h1></div><span class="meta">${run.conditionIndex+1} / ${run.conditionOrder.length}</span></div><div class="progress"><span style="width:${run.conditionIndex/run.conditionOrder.length*100}%"></span></div>${conditionHeader}<div class="condition-vas-list">${items.map((item,index)=>renderRunVasItem(item,index)).join("")}</div><div class="run-actions sticky-run-actions"><button class="btn ghost" data-action="run-back" ${run.conditionIndex===0?"disabled":""}>前の条件へ</button><span class="meta">${answered} / ${items.length} 項目回答済み</span><button class="btn" data-action="run-next" ${complete?"":"disabled"}>${last?"実験を完了":"次の条件へ"}</button></div></div>`;
}
function renderRunVasItem(item,index){const answer=getCurrentAnswer(item.vas_item_id),strokePoints=formatStrokePoints(answer.stroke||[]);return `<section class="card run-vas-card"><div class="vas-card-head"><p class="meta">${index+1}. ${esc(item.item_name)}</p><button class="admin-vas-button" type="button" data-action="clear-current-vas" data-item-id="${item.vas_item_id}" aria-label="管理者用: この回答を消去" title="管理者用: この回答を消去">■</button></div><h2 class="vas-question">${esc(item.question_text)}</h2><div class="vas-line-area"><div class="vas-track ${answer.value===null?"":"is-answered"}" data-item-id="${item.vas_item_id}" aria-label="${esc(item.item_name)} フリーハンドVAS入力"><div class="vas-line-frame"><svg class="vas-stroke-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline class="vas-stroke-line" points="${esc(strokePoints)}"></polyline><polyline class="vas-draft-line"></polyline></svg></div></div><div class="scale-labels"><span>${esc(item.left_label)}</span><span>${esc(item.right_label)}</span></div></div></section>`}
function getStrokePoint(track,clientX,clientY){const rect=track.querySelector(".vas-line-frame").getBoundingClientRect();return{x:Number(Math.max(-12,Math.min(112,(clientX-rect.left)/rect.width*100)).toFixed(2)),y:Number((Math.max(0,Math.min(1,(clientY-rect.top)/rect.height))*100).toFixed(2))}}
function updateVasDraftFromPointer(state,event){const point=getStrokePoint(state.track,event.clientX,event.clientY),previous=state.points[state.points.length-1];if(!previous||Math.hypot(point.x-previous.x,point.y-previous.y)>=.6)state.points.push(point);state.hasStroke=state.hasStroke||Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>=8;updateStrokeLine(state.track,".vas-draft-line",state.hasStroke?state.points:[])}
function commitVasStroke(state){const raw=state.points,stroke=simplifyStroke(raw);if(!strokeReachesBaseline(raw)||strokeCrossesTwice(raw)){rejectStroke(state.track);return}const contacts=getBaselineContactXs(stroke,18),itemId=state.track.dataset.itemId;run.currentAnswers[itemId]={value:Number(Math.max(0,Math.min(100,contacts.reduce((sum,x)=>sum+x,0)/contacts.length)).toFixed(1)),stroke};updateStrokeLine(state.track,".vas-stroke-line",stroke);updateStrokeLine(state.track,".vas-draft-line",[]);renderRun()}
function strokeReachesBaseline(points){return getBaselineContactXs(points,VAS_BASELINE_TOUCH_TOLERANCE).length>0}
function strokeCrossesTwice(points){let previous=getBaselineSide(points[0]),count=0;for(let i=1;i<points.length;i++){const current=getBaselineSide(points[i]);if(current===0)continue;if(previous!==0&&current!==previous)count++;previous=current;if(count>=2)return true}return false}
function getBaselineSide(point){if(!point)return 0;if(point.y<VAS_BASELINE_Y-VAS_BASELINE_CROSSING_ZONE)return-1;if(point.y>VAS_BASELINE_Y+VAS_BASELINE_CROSSING_ZONE)return 1;return 0}
function getBaselineIntersectionX(a,b){const delta=b.y-a.y;if(delta===0)return null;const crosses=(a.y<VAS_BASELINE_Y&&b.y>VAS_BASELINE_Y)||(a.y>VAS_BASELINE_Y&&b.y<VAS_BASELINE_Y);if(!crosses)return null;const x=a.x+(b.x-a.x)*(VAS_BASELINE_Y-a.y)/delta;return x>=0&&x<=100?x:null}
function getBaselineContactXs(points,tolerance){const xs=points.filter(p=>p.x>=0&&p.x<=100&&Math.abs(p.y-VAS_BASELINE_Y)<=tolerance).map(p=>p.x);points.forEach((point,index)=>{if(!index)return;const x=getBaselineIntersectionX(points[index-1],point);if(x!==null)xs.push(x)});return xs}
function simplifyStroke(points){if(points.length<=24)return points;const step=(points.length-1)/23;return Array.from({length:24},(_,index)=>points[Math.round(index*step)])}
function formatStrokePoints(points){return points.map(point=>`${point.x},${point.y}`).join(" ")}
function updateStrokeLine(track,selector,points){track.querySelector(selector)?.setAttribute("points",formatStrokePoints(points))}
function rejectStroke(track){updateStrokeLine(track,".vas-draft-line",[]);track.classList.add("is-invalid");toast("中央の線を1回だけ横切るように印を引いてください");setTimeout(()=>track.classList.remove("is-invalid"),520)}
function clearCurrentVas(itemId){if(getCurrentAnswer(itemId).value===null){toast("この項目は未回答です");return}if(!confirm("管理者用操作：このVAS回答を消去しますか？"))return;delete run.currentAnswers[itemId];renderRun()}
function runNext(){
  const {p,condition,items}=currentRunParts();if(items.some(item=>getCurrentAnswer(item.vas_item_id).value===null)){toast("すべてのVAS項目に回答してください");return}const stamp=now();
  items.forEach(item=>{const answer=getCurrentAnswer(item.vas_item_id),existing=run.responses.find(r=>r.trial_order===run.conditionIndex+1&&r.vas_item_id===item.vas_item_id),response={response_id:existing?.response_id||uid("response"),project_id:p.project_id,subject_id:run.subjectId,session_id:run.sessionId,pattern_id:run.patternId,trial_order:run.conditionIndex+1,condition_id:condition.condition_id,condition_label:condition.label,vas_item_id:item.vas_item_id,vas_item_name:item.item_name,question_text:item.question_text,value:answer.value,stroke_points:answer.stroke,min_value:0,max_value:100,answered_at:stamp,created_at:existing?.created_at||stamp};if(existing)Object.assign(existing,response);else run.responses.push(response)});
  if(run.conditionIndex===run.conditionOrder.length-1)return finishRun();run.conditionIndex++;loadCurrentAnswers();render();requestAnimationFrame(()=>scrollFirstVasCardIntoView());
}
function scrollFirstVasCardIntoView(){
  const card=document.querySelector(".run-vas-card");if(!card)return;
  const headerHeight=document.querySelector(".topbar")?.getBoundingClientRect().height||0;
  const rect=card.getBoundingClientRect(),available=window.innerHeight-headerHeight-24;
  const desiredViewportTop=headerHeight+(rect.height<=available?Math.max(12,(available-rect.height)/2):12);
  const top=window.scrollY+rect.top-desiredViewportTop;
  window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
}
function runBack(){if(run.conditionIndex===0)return;run.conditionIndex--;loadCurrentAnswers();render()}
function finishRun(){db.sessions.push({assignment_id:uid("assignment"),project_id:run.projectId,subject_id:run.subjectId,session_id:run.sessionId,pattern_id:run.patternId,pattern_name:run.patternName,started_at:run.startedAt,completed_at:now(),responses:run.responses});saveDb();const pid=run.projectId;run=null;go("project",{projectId:pid,tab:"sessions"});toast("実験データを保存しました")}
function deleteSession(id){if(!confirm("この実験データを削除しますか？"))return;db.sessions=db.sessions.filter(s=>s.assignment_id!==id);saveDb();render()}

function exportXlsx(){
  const p=project();if(typeof XLSX==="undefined"){alert("XLSXライブラリを読み込めませんでした");return}
  const sessions=db.sessions.filter(s=>s.project_id===p.project_id), stamp=now(), wb=XLSX.utils.book_new();
  const add=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{}]),name);
  add("project",[{project_id:p.project_id,project_name:p.project_name,description:p.description,hide_condition_during_run:Boolean(p.hide_condition_during_run),created_at:p.created_at,updated_at:p.updated_at,exported_at:stamp,app_version:APP_VERSION}]);
  add("conditions",p.conditions.sort((a,b)=>a.display_order-b.display_order).map(({condition_id,label,description,display_order})=>({condition_id,label,description,display_order})));
  add("vas_items",p.vas_items.sort((a,b)=>a.display_order-b.display_order).map(({vas_item_id,item_name,question_text,left_label,right_label,min_value,max_value,display_order})=>({vas_item_id,item_name,question_text,left_label,right_label,min_value,max_value,display_order})));
  add("pattern_master",p.patterns.map(pattern=>{const labels=pattern.condition_order.map(id=>p.conditions.find(c=>c.condition_id===id)?.label||id),row={pattern_id:pattern.pattern_id,pattern_name:pattern.pattern_name,generation_method:pattern.generation_method,random_seed:pattern.random_seed,condition_order:labels.join(" -> "),generated_at:pattern.generated_at};labels.forEach((label,i)=>row[`order_${i+1}`]=label);return row}));
  add("assignment_log",sessions.map(s=>({subject_id:s.subject_id,session_id:s.session_id,pattern_id:s.pattern_id,pattern_name:s.pattern_name,started_at:s.started_at,completed_at:s.completed_at})));
  add("raw_responses",sessions.flatMap(s=>s.responses).sort((a,b)=>a.subject_id.localeCompare(b.subject_id)||a.session_id.localeCompare(b.session_id)||a.trial_order-b.trial_order).map(r=>({subject_id:r.subject_id,session_id:r.session_id,pattern_id:r.pattern_id,trial_order:r.trial_order,condition_id:r.condition_id,condition_label:r.condition_label,vas_item_id:r.vas_item_id,vas_item_name:r.vas_item_name,value:r.value,answered_at:r.answered_at})));
  const conditions=[...p.conditions].sort((a,b)=>a.display_order-b.display_order),items=[...p.vas_items].sort((a,b)=>a.display_order-b.display_order);
  add("wide_by_condition",sessions.map(s=>{const row={subject_id:s.subject_id,session_id:s.session_id,pattern_id:s.pattern_id};conditions.forEach(c=>items.forEach(v=>{row[`${c.label}_${v.item_name}`]=s.responses.find(r=>r.condition_id===c.condition_id&&r.vas_item_id===v.vas_item_id)?.value??""}));return row}));
  wb.Sheets.project["!cols"]=[{wch:24},{wch:30},{wch:40},{wch:24},{wch:24},{wch:24},{wch:14}];
  XLSX.writeFile(wb,`${slug(p.project_name)}_${new Date().toISOString().slice(0,10)}.xlsx`,{compression:true});toast("XLSXを出力しました");
}
render();
