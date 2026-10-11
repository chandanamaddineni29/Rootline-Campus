/* 08 Authentication
 * Server-backed account sessions, role-aware navigation and student dashboard initialization.
 * Classic script by design: existing inline handlers rely on shared global functions.
 */
let currentRole=window.RootlineAuth?.user?.role||"admin";
let currentLogin=window.RootlineAuth?.user?.username||"";
let currentProfile=window.RootlineAuth?.user||null;
let greetingTimer;
function signedInDisplayName(){
  return RootlineGreeting.displayName(currentProfile);
}
function updateOverviewGreeting(){
  $("#page-overview .welcome h2").textContent=`${RootlineGreeting.periodForHour(new Date().getHours())}, ${signedInDisplayName()} 👋`;
  window.clearTimeout(greetingTimer);
  greetingTimer=window.setTimeout(updateOverviewGreeting,RootlineGreeting.millisecondsUntilChange(new Date())+25);
}
function applyRole(){
  const isAdmin=currentRole==="admin", isFaculty=currentRole==="faculty", isStudent=currentRole==="student";
  document.body.dataset.role=currentRole;
  // Hide role-inappropriate controls for the workspace; the API independently enforces access.
  $$("#sidebar .nav button[data-page]").forEach(b=>{
    const page=b.dataset.page;
    let show=isAdmin;
    if(isFaculty) show=["overview","students","analytics","journey","interventions","data"].includes(page);
    if(isStudent) show=["student-home","assistant"].includes(page);
    b.style.display=show?"flex":"none";
  });
  $$("#sidebar .navlabel").forEach(el=>el.style.display=isStudent?"none":"block");
  $("#studentHomeNav").style.display=isStudent?"flex":"none";
  $("#importNav").style.display=isAdmin?"flex":"none";
  $("#exportNav").style.display=isAdmin?"flex":"none";
  $("#topImport").style.display=isAdmin?"inline-flex":"none";
  $("#downloadCsv").style.display=isAdmin?"inline-flex":"none";
  $("#saveSnapshotBtn").style.display=isAdmin?"inline-flex":"none";
  $("#addStudentBtn").style.display="none";
  $("#addStudentBtn2").style.display="none";
  $("#addUserBtn").style.display=isAdmin?"inline-flex":"none";
  $("#addUserNav").style.display=isAdmin?"flex":"none";
  $("#globalSearch").closest("label").style.display=isStudent?"none":"flex";
  $(".sidebar-bottom b").textContent=isStudent?"Personal learning space":isFaculty?"Faculty workspace":"Analytics engine active";
  $(".sidebar-bottom p").textContent=isStudent?"Review your learning indicators and get study support.":isFaculty?"Review student signals and coordinate supportive follow-ups.":"Scores and risk indicators update as demo records change.";
  $(".avatar").textContent=isAdmin?"AD":isFaculty?"FC":"ST";
  $("#facultyDashboard").style.display=isFaculty?"block":"none";
  $$("#page-overview > .dashboard-filters, #page-overview > .overview-kpis, #page-overview > .grid-main, #page-overview > .bottom-grid").forEach(el=>el.style.display=isFaculty?"none":"");
  const names={admin:"Administrator",faculty:"Faculty / User",student:"Student"};
  if(isStudent){navigate("student-home");renderStudentHome();}
  else navigate("overview");
  updateOverviewGreeting();
  if(isFaculty)$("#page-overview .welcome p").textContent="Review assigned student records, identify support needs, and coordinate timely follow-up.";
  else $("#page-overview .welcome p").textContent="Manage campus analytics and create authorized user accounts.";
  if(isFaculty)renderFacultyOverview();
  $("#topTitle").textContent=isStudent?"My student dashboard":isFaculty?"Faculty overview":"Campus overview";
  $("#crumb").textContent=names[currentRole];
}
function renderStudentHome(){
  const studentId=String(currentProfile?.linkedStudentId||currentLogin).toLowerCase();
  const student=students.find(s=>String(s.id).toLowerCase()===studentId);
  if(!student){$("#studentWelcome").textContent="Welcome to your student dashboard 👋";["myScore","myAttendance","myAcademic","myPlacement"].forEach(id=>$("#"+id).textContent="—");$("#myStudentSummary").innerHTML='<p class="subtle">The student profile linked to this account was not found. Contact an administrator to check the account assignment.</p>';$("#myStudentActions").innerHTML='';return;}
  const sc=score(student),rk=risk(student),why=reasons(student),recs=studentRecommendations(student),factors=riskFactors(student);
  $("#studentWelcome").textContent=`Welcome, ${student.name.split(" ")[0]}${currentProfile?.isDemo?" (Demo account)":""} 👋`;
  $("#myScore").textContent=sc===null?"N/A":sc+"/100";$("#myAttendance").textContent=validIndicator(student,"attendance")?student.attendance+"%":"N/A";$("#myAcademic").textContent=academicPerformanceForStudent(student)===null?"N/A":Math.round(academicPerformanceForStudent(student))+"/100";$("#myPlacement").textContent=student.year!=="4th Year"||student.placement===null||student.placement===undefined||String(student.placement).trim()===""||!Number.isFinite(Number(student.placement))?"N/A":student.placement+"/100";
  $("#myStudentSummary").innerHTML=`<div class="student" style="margin-bottom:14px"><div class="student-avatar" style="width:43px;height:43px">${esc(initials(student.name))}</div><div><b>${esc(student.name)}</b><small>${esc(student.id)} · ${esc(student.dept)} · ${esc(student.year)}</small><div style="margin-top:5px">${pill(rk)} <span class="subtle">Rule-based risk estimate</span></div></div></div><div class="student-detail"><div class="detail-box"><small>CGPA</small><b>${esc(student.cgpa)}</b></div><div class="detail-box"><small>Backlogs recorded</small><b>${esc(student.backlogs)}</b></div></div><h4 style="margin:15px 0 5px">Risk factors</h4>${factors.map(f=>`<div class="subtle" style="margin:5px 0">• ${esc(f.kind)}: ${esc(f.label)} — ${esc(f.value)}</div>`).join("")}<p class="subtle" style="margin-top:13px">These are demo indicators and rule-based estimates for planning, not a formal academic evaluation or a trained/validated machine-learning prediction.</p>`;
  $("#myStudentActions").innerHTML=recs.map(r=>`<div class="intervention"><div class="check">✦</div><div><h4>${esc(r.title)}</h4><p>${esc(r.detail)}</p><div class="meta">Recommendation · ${esc(r.priority)} priority</div></div></div>`).join("");
}
function renderFacultyOverview(){
  if(currentRole!=="faculty")return;
  const assigned=new Set(currentProfile?.assignedStudentIds||[]),cohort=students.filter(student=>assigned.has(String(student.id)));
  const matches=record=>assigned.has(String(record.studentId||""));
  const metrics=sourceAnalyticsFor(cohort),assessments=metrics.assessments,attendanceRate=metrics.attendanceRate,averageMarks=metrics.averageMarks;
  const assignedClasses=currentProfile?.assignedClasses||[];
  $("#facultyClassCount").textContent=assignedClasses.length;
  $("#facultyClassesList").innerHTML=assignedClasses.length?assignedClasses.map(item=>`<div class="segment"><div class="seg-icon" style="color:#0f8b83;background:#0f8b8313">▤</div><div><strong>${esc(item.code)} · ${esc(item.name)}</strong><small>${esc(item.department)} · ${esc(item.yearLabel)}</small></div><div class="seg-right"><b>${Number(item.studentCount)||0}</b><small>students</small></div></div>`).join(""):'<div class="empty">No class assignments yet. Ask an administrator to assign your classes.</div>';
  $("#facultyStudentCount").textContent=cohort.length;
  $("#facultyAttendance").textContent=attendanceRate===null?"N/A":`${Math.round(attendanceRate*10)/10}%`;
  $("#facultyMarks").textContent=averageMarks===null?"N/A":`${Math.round(averageMarks*10)/10}%`;
  const byId=new Map(cohort.map(student=>[String(student.id),student]));
  const recent=assessments.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,8);
  $("#facultyAssessmentRows").innerHTML=recent.length?recent.map(record=>`<tr><td>${esc(byId.get(String(record.studentId))?.name||record.studentId)}</td><td>${esc(record.assessment||record.subject||"Assessment")}</td><td>${esc(record.date||"Not dated")}</td><td>${Math.round(record.percentage*10)/10}%</td></tr>`).join(""):'<tr><td colspan="4" class="empty">No valid assessment records are available for your assigned students.</td></tr>';
  const attention=metrics.alerts.slice().sort((a,b)=>({High:0,Medium:1}[a.severity]??2)-({High:0,Medium:1}[b.severity]??2)).slice(0,8);
  $("#facultyAttentionRows").innerHTML=attention.length?attention.map(alert=>`<div class="risk-row"><div class="risk-symbol">⚑</div><div class="risk-text"><strong>${esc(alert.student.name)} · ${esc(alert.student.id)}</strong><small>${alert.reasons.map(esc).join("; ")} · ${esc(alert.lastUpdated||"Date unavailable")}</small>${pill(alert.severity)}</div><button class="btn light" type="button" onclick="openDetail('${escapeInlineArg(alert.student.id)}')">View</button></div>`).join(""):'<div class="empty">No attendance or assessment records currently trigger the configured support rules.</div>';
  const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const followups=actions.filter(action=>matches(action)&&actionStatus(action)!=="Completed"&&actionStatus(action)!=="Cancelled"&&action.dueDate&&String(action.dueDate)>=today).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).slice(0,8);
  $("#facultyFollowupRows").innerHTML=followups.length?followups.map(action=>`<div class="risk-row"><div class="risk-symbol">◷</div><div class="risk-text"><strong>${esc(action.title)}</strong><small>${esc(byId.get(String(action.studentId))?.name||action.studentId)} · Due ${esc(action.dueDate)} · ${esc(actionStatus(action))}</small></div></div>`).join(""):'<div class="empty">No upcoming open follow-ups are recorded for your assigned students.</div>';
  const activity=[
    ...(moduleRecords.attendance||[]).filter(matches).map(record=>({date:String(record.date||""),label:`Attendance ${String(record.status||"").toLowerCase()} · ${byId.get(String(record.studentId))?.name||record.studentId}`})),
    ...assessments.map(record=>({date:String(record.date||""),label:`Assessment recorded · ${byId.get(String(record.studentId))?.name||record.studentId} · ${record.assessment||record.subject||"Assessment"}`})),
    ...actions.filter(matches).map(action=>({date:String(action.createdAt||action.date||""),label:`Intervention · ${byId.get(String(action.studentId))?.name||action.studentId} · ${action.title}`}))
  ].filter(item=>item.date).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  $("#facultyActivityRows").innerHTML=activity.length?activity.map(item=>`<div class="risk-row"><div class="risk-symbol">•</div><div class="risk-text"><strong>${esc(item.label)}</strong><small>${esc(item.date)}</small></div></div>`).join(""):'<div class="empty">No dated attendance, assessment, or intervention records are available in your assigned scope.</div>';
}
function showDashboard(){document.body.classList.add("authenticated");applyRole();}
document.addEventListener("visibilitychange",()=>{if(currentProfile)updateOverviewGreeting();});
if(currentProfile)showDashboard();
$("#facultyAttendanceButton").addEventListener("click",()=>$("#sidebar .nav button[data-module=attendance]").click());
$("#facultyAssessmentsButton").addEventListener("click",()=>$("#sidebar .nav button[data-module=internal]").click());
$("#facultyFollowupsButton").addEventListener("click",()=>navigate("interventions"));
$("#loginRole").addEventListener("change",()=>{const role=$("#loginRole").value;$("#loginUser").placeholder=role==="admin"?"Administrator username":role==="faculty"?"Faculty username":"Student username";});
$("#loginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const submit=$("#loginForm button[type=submit]"),username=$("#loginUser").value.trim(),password=$("#loginPassword").value,role=$("#loginRole").value;
  submit.disabled=true;submit.textContent="Signing in…";
  fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password,role})})
    .then(async response=>{const payload=await window.RootlineApi.readJson(response);if(!response.ok)throw new Error(payload.error||"Sign-in failed.");window.RootlineAuth={user:payload.user};window.location.reload();})
    .catch(error=>{$("#loginError").textContent=error.message;$("#loginError").classList.add("show");$("#loginPassword").value="";$("#loginPassword").focus();})
    .finally(()=>{submit.disabled=false;submit.innerHTML='Sign in securely <span>→</span>';});
});
$("#logoutBtn").addEventListener("click",async()=>{window.clearTimeout(greetingTimer);try{const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("Sign out failed.");window.location.reload();}catch(error){console.error("[Rootline] Sign out failed:",error);toast(error.message);}});
renderAll();
