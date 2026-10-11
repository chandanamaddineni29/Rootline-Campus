/* 03 Dashboard And Journey
 * Dashboard metrics, cohort filters, student journey and analytics views.
 * Classic script by design: existing inline handlers rely on shared global functions.
 */
function renderImportReport(){const rows=importReconciliation||[];const count=st=>rows.filter(x=>x.status===st).length;$("#importImported").textContent=count('Imported');$("#importDuplicates").textContent=count('Skipped duplicate');$("#importInvalid").textContent=count('Invalid');$("#importReportTable").innerHTML=rows.length?rows.slice(-250).map(r=>`<tr><td>${r.row}</td><td>${esc(r.id||'—')}</td><td><span class="pill ${r.status==='Imported'?'low':r.status==='Skipped duplicate'?'medium':'neutral'}">${esc(r.status)}</span></td><td>${esc(r.reason)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Import a CSV to see the row-by-row reconciliation report.</td></tr>'}
function exportImportReport(){const lines=[['csvRow','studentId','status','reason'].join(','),...importReconciliation.map(r=>[r.row,r.id,r.status,r.reason].map(csvCell).join(','))];const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rootline-import-reconciliation.csv';a.click();URL.revokeObjectURL(url);toast('Import reconciliation report exported.')}
function sourceAnalyticsFor(cohort){
 const ids=new Set(cohort.map(student=>String(student.id)));
 const isDate=value=>{const date=String(value||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const parsed=new Date(`${date}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;};
 const attendance=new Map(),assessmentMap=new Map();
 for(const record of moduleRecords.attendance||[]){
  const id=String(record.studentId||""),date=String(record.date||""),status=String(record.status||"").trim().toLowerCase();
  if(!ids.has(id)||!isDate(date)||!["present","absent","late","excused"].includes(status))continue;
  const key=`${id}|${date}|${String(record.subject||"").trim().toLowerCase()}`;
  attendance.set(key,{...record,studentId:id,date,status});
 }
 for(const record of moduleRecords.internal||[]){
  const id=String(record.studentId||""),date=String(record.date||"");
  if(!ids.has(id)||!isDate(date))continue;
  const percentage=validInternalPercent(record);
  if(percentage===null)continue;
  const key=`${id}|${date}|${String(record.assessment||"").trim().toLowerCase()}|${String(record.subject||"").trim().toLowerCase()}`;
  assessmentMap.set(key,{...record,studentId:id,date,percentage});
 }
 const attendanceByStudent=new Map(),attendanceByDate=new Map();
 for(const record of attendance.values()){
  if(!["present","absent","late"].includes(record.status))continue;
  const item=attendanceByStudent.get(record.studentId)||{attended:0,total:0,dates:[]};
  item.total+=1;if(record.status==="present"||record.status==="late")item.attended+=1;
  item.dates.push(record.date);attendanceByStudent.set(record.studentId,item);
  const day=attendanceByDate.get(record.date)||{attended:0,total:0};
  day.total+=1;if(record.status==="present"||record.status==="late")day.attended+=1;
  attendanceByDate.set(record.date,day);
 }
 const marksByStudent=new Map();
 for(const record of assessmentMap.values()){
  const list=marksByStudent.get(record.studentId)||[];
  list.push(record);marksByStudent.set(record.studentId,list);
 }
 const perStudentAttendance=new Map([...attendanceByStudent].map(([id,item])=>[id,100*item.attended/item.total]));
 const perStudentMarks=new Map([...marksByStudent].map(([id,records])=>[id,records.reduce((sum,record)=>sum+record.percentage,0)/records.length]));
 const alertsByStudent=new Map(),riskLevels=new Map();
 for(const student of cohort){
  const id=String(student.id),attendanceRate=perStudentAttendance.get(id),marks=perStudentMarks.get(id),results=marksByStudent.get(id)||[],reasons=[];
  if(attendanceRate!==undefined&&attendanceRate<65)reasons.push(`Attendance ${Math.round(attendanceRate*10)/10}% is below 65%`);
  if(marks!==undefined&&marks<55)reasons.push(`Assessment average ${Math.round(marks*10)/10}% is below 55%`);
  const datedAverages=[...results.reduce((byDate,record)=>{const values=byDate.get(record.date)||[];values.push(record.percentage);byDate.set(record.date,values);return byDate;},new Map())].map(([date,values])=>({date,average:values.reduce((sum,value)=>sum+value,0)/values.length})).sort((a,b)=>a.date.localeCompare(b.date));
  if(datedAverages.length>=2&&datedAverages.at(-1).average<=datedAverages.at(-2).average-10)reasons.push(`Most recent dated assessment average declined by at least 10 points (${Math.round(datedAverages.at(-2).average)}% to ${Math.round(datedAverages.at(-1).average)}%)`);
  const attendanceHigh=attendanceRate!==undefined&&attendanceRate<55,marksHigh=marks!==undefined&&marks<40;
  const severity=attendanceHigh||marksHigh?"High":"Medium";
  const lastUpdated=[...(attendanceByStudent.get(id)?.dates||[]),...results.map(record=>record.date)].sort().at(-1)||"";
  if(reasons.length){
   riskLevels.set(id,severity);
   alertsByStudent.set(id,{student,reasons,severity,attendanceRate:attendanceRate??null,averageMarks:marks??null,lastUpdated,recommendation:attendanceHigh?"Review attendance barriers and agree a supportive follow-up.":marksHigh?"Arrange academic support and review the latest assessment.":"Review source records with the student and schedule a check-in."});
  }else riskLevels.set(id,attendanceRate!==undefined||marks!==undefined?"Low":"No data");
 }
 const totalSessions=[...attendance.values()].filter(record=>["present","absent","late"].includes(record.status));
 const totalAttended=totalSessions.filter(record=>record.status==="present"||record.status==="late").length;
 const validAssessments=[...assessmentMap.values()];
 return {
  attendanceRate:totalSessions.length?100*totalAttended/totalSessions.length:null,
  averageMarks:validAssessments.length?validAssessments.reduce((sum,record)=>sum+record.percentage,0)/validAssessments.length:null,
  attendanceRecordCount:totalSessions.length,
  assessmentRecordCount:validAssessments.length,
  includesDemo:[...attendance.values(),...validAssessments].some(record=>record.demo===true),
  attendanceByStudent:perStudentAttendance,
  marksByStudent:perStudentMarks,
  attendanceByDate:[...attendanceByDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,day])=>({label:date,v:100*day.attended/day.total,count:day.total})),
  assessments:validAssessments,
  alerts:[...alertsByStudent.values()],
  alertsByStudent,
  riskLevels
 };
}
function dashboardFilteredStudents(){
 const dept=$("#dashDeptFilter")?.value||"all", semester=$("#dashSemesterFilter")?.value||"all", year=$("#dashYearFilter")?.value||"all", riskLevel=$("#dashRiskFilter")?.value||"all",riskLevels=sourceAnalyticsFor(students).riskLevels;
 let result=students.filter(st=>(dept==="all"||st.dept===dept)&&(riskLevel==="all"||(riskLevels.get(String(st.id))||"No data")===riskLevel));
 if(semester!=="all"||year!=="all"){
  const ids=new Set((moduleRecords.semester||[]).filter(r=>(semester==="all"||String(r.semester)===String(semester))&&(year==="all"||String(r.academicYear||"").trim()===year)).map(r=>String(r.studentId||"")));
  result=result.filter(st=>ids.has(String(st.id)));
 }
 return result;
}
function populateDashboardFilters(){
 const fill=(id,first,values,selected)=>{const el=$("#"+id);if(!el)return;const old=selected??el.value??"all";el.innerHTML=`<option value="all">${first}</option>`+values.map(v=>`<option value="${esc(v.value??v)}">${esc(v.label??v)}</option>`).join("");el.value=[...el.options].some(o=>o.value===old)?old:"all";};
 fill("dashDeptFilter","All departments",[...new Set(students.map(s=>s.dept).filter(Boolean))].sort());
 const sems=[...new Set((moduleRecords.semester||[]).map(r=>String(r.semester||"")).filter(v=>/^\d+$/.test(v)))].sort((a,b)=>Number(a)-Number(b));
 fill("dashSemesterFilter",sems.length?"All semesters":"All semesters · no semester data",sems.map(v=>({value:v,label:`Semester ${v}`})));
 const academicYears=[...new Set((moduleRecords.semester||[]).map(r=>String(r.academicYear||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 fill("dashYearFilter",academicYears.length?"All academic years":"All academic years · no semester data",academicYears);
}
function renderRiskDistribution(arr){
 const box=$("#riskDistributionChart");if(!box)return;
 if(!arr.length){box.innerHTML='<div class="empty">No students match these filters. Adjust the filters to view risk distribution.</div>';return;}
 const riskLevels=sourceAnalyticsFor(arr).riskLevels,levels=["Low","Medium","High","No data"],counts=Object.fromEntries(levels.map(level=>[level,arr.filter(student=>(riskLevels.get(String(student.id))||"No data")===level).length]));
 const colors={Low:"#18a875",Medium:"#e2a23c",High:"#df5870","No data":"#9aa4b2"};let x=0;const total=arr.length,w=620,h=138,left=16,barW=w-32,barY=18,barH=25;
 const bars=levels.map(level=>{const ww=barW*counts[level]/total,part=`<rect x="${left+x}" y="${barY}" width="${Math.max(0,ww)}" height="${barH}" fill="${colors[level]}"/>`;x+=ww;return part}).join("");
 const labels=levels.map((level,index)=>{const y=66+index*18,label=level==="Low"?"No source alert":level==="No data"?"No attendance or marks data":`${level} risk`;return `<circle cx="22" cy="${y-3}" r="4" fill="${colors[level]}"/><text x="34" y="${y}" font-size="12" fill="#66728a">${label}</text><text x="604" y="${y}" text-anchor="end" font-size="12" font-weight="600" fill="#303b52">${counts[level]} · ${Math.round(counts[level]/total*100)}%</text>`}).join("");
 box.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Risk distribution across ${total} filtered students">${bars}${labels}</svg>`;
}
function renderSemesterPerformance(arr){
 const box=$("#semesterPerformanceChart"),summary=$("#semesterTrendSummary");if(!box)return;
 const records=(moduleRecords.semester||[]).filter(r=>arr.some(st=>String(st.id)===String(r.studentId))&&String(r.marks??"").trim()!==""&&Number.isFinite(Number(r.marks))&&Number(r.marks)>=0&&Number(r.marks)<=100&&String(r.semester||"").trim()!=="");
 if(records.length){
  const groups=new Map();records.forEach(r=>{const academicYear=String(r.academicYear||"Academic year not recorded"),semester=Number(r.semester),label=`${academicYear} · Sem ${semester}`,key=`${academicYear}\u0000${String(semester).padStart(2,"0")}`;if(!groups.has(key))groups.set(key,{label,academicYear,semester,values:[]});groups.get(key).values.push(Number(r.marks));});
  const series=[...groups.values()].sort((a,b)=>a.academicYear.localeCompare(b.academicYear,undefined,{numeric:true})||a.semester-b.semester).map(g=>{const match=g.academicYear.match(/(\d{4})\D+(\d{4})/),yearLabel=match?`${match[1].slice(-2)}-${match[2].slice(-2)}`:g.academicYear.slice(0,8);return {label:`S${g.semester} · ${yearLabel}`,v:g.values.reduce((a,b)=>a+b,0)/g.values.length,count:g.values.length,fullLabel:g.label};});
  if(series.length){svgLineChart("#semesterPerformanceChart",series.map(x=>({label:x.label,v:x.v})),70);if(summary)summary.textContent=`Based on ${records.length} saved semester-result record(s), grouped by academic year and semester. ${records.some(r=>r.demo)?"Includes marked synthetic demo rows; verify before formal use.":"Uses saved application records; confirm source and completeness before formal use."}`;return;}
 }
 const dated=historicalSnapshots.filter(x=>x&&x.date&&x.avgScore!==null&&x.avgScore!==undefined&&String(x.avgScore).trim()!==""&&Number.isFinite(Number(x.avgScore))).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-12);
 if(dated.length){svgLineChart("#semesterPerformanceChart",dated.map(x=>({label:String(x.date),v:Number(x.avgScore)})),70);if(summary)summary.textContent="No semester-result marks are available for this cohort. Showing saved dated aggregate snapshots instead; snapshots are not semester-level results.";return;}
 box.innerHTML='<div class="empty">No semester results or dated snapshots are available for this filtered cohort. Import dated records or save snapshots over time to build a trend.</div>';if(summary)summary.textContent="No historical trend has been inferred or fabricated.";
}
function bindDashboardFilters(){
 ["dashDeptFilter","dashSemesterFilter","dashYearFilter","dashRiskFilter"].forEach(id=>{const el=$("#"+id);if(el&&!el.dataset.bound){el.addEventListener("change",()=>renderOverview());el.dataset.bound="yes";}});
 const reset=$("#resetDashboardFilters");if(reset&&!reset.dataset.bound){reset.addEventListener("click",()=>{["dashDeptFilter","dashSemesterFilter","dashYearFilter","dashRiskFilter"].forEach(id=>{if($("#"+id))$("#"+id).value="all";});renderOverview();});reset.dataset.bound="yes";}
}
function renderOverview(){
 populateDashboardFilters();bindDashboardFilters();
 const cohort=dashboardFilteredStudents(),n=cohort.length,metrics=sourceAnalyticsFor(cohort);
 const risks=metrics.alerts,onTrack=cohort.filter(student=>metrics.riskLevels.get(String(student.id))==="Low").length,eligible=cohort.filter(s=>s.year==="4th Year"&&validIndicator(s,"placement"));
 const label=(value,text)=>{const top=value?.previousElementSibling;if(top?.firstChild)top.firstChild.textContent=`${text} `;};
 label($("#kStudents"),"Total Students");label($("#kAttendance"),"Overall attendance rate");label($("#kScore"),"Average marks");label($("#kRisk"),"Students At Risk");
 $("#kStudents").textContent=n;$("#kScore").innerHTML=`${metrics.averageMarks===null?"N/A":`${Math.round(metrics.averageMarks)}<span style="font-size:15px;color:#8b95a9">%</span>`}`;$("#kAttendance").textContent=metrics.attendanceRate===null?"N/A":`${Math.round(metrics.attendanceRate)}%`;$("#kRisk").textContent=risks.length;$("#kOnTrack").textContent=onTrack;$("#kPlacement").textContent=eligible.length?Math.round(100*eligible.filter(s=>Number(s.placement)>=70).length/eligible.length)+"%":"N/A";
 const cohortIds=new Set(cohort.map(s=>String(s.id)));const active=actions.filter(a=>actionStatus(a)!=="Completed"&&actionStatus(a)!=="Cancelled"&&cohortIds.has(String(a.studentId))).length;$("#kActiveInterventions").textContent=active;
 $("#scoreFoot").textContent=metrics.assessmentRecordCount?`Normalized from ${metrics.assessmentRecordCount} valid, dated assessment record(s)${metrics.includesDemo?" · includes synthetic demo data":""}.`:"No valid dated assessment records match the current filters";
 const attendanceFoot=$("#kAttendance")?.parentElement?.querySelector(".kpi-foot");if(attendanceFoot)attendanceFoot.textContent=`Present and late / recorded present, late and absent sessions${metrics.includesDemo?" · includes synthetic demo data":""}`;
 const trendSection=$("#trendChart")?.closest(".chart-card");
 if(trendSection){const heading=trendSection.querySelector("h3"),description=trendSection.querySelector("p");if(heading)heading.textContent="Attendance trend";if(description)description.textContent=`Recorded attendance by date; present and late count as attended, excused records are excluded.${metrics.includesDemo?" Synthetic demo records are included.":""}`;}
 const trend=metrics.attendanceByDate.slice(-12);
 if(trend.length)svgLineChart("#trendChart",trend.map(point=>({label:point.label,v:Math.round(point.v)})),null);else $("#trendChart").innerHTML='<div class="empty">No dated attendance records match the current filters.</div>';
 renderSourceDepartmentChart(cohort);renderSourceAttendanceMarksChart(cohort);renderRiskDistribution(cohort);renderSemesterPerformance(cohort);renderHistoricalSnapshots();renderIntegrationCards();renderSegments(cohort);
 const rs=risks.slice().sort((a,b)=>a.severity.localeCompare(b.severity)||String(a.lastUpdated).localeCompare(String(b.lastUpdated))).slice(0,5);$("#riskTable").innerHTML=rs.length?rs.map(alert=>`<tr><td><strong>${esc(alert.student.name)}</strong><small>${esc(alert.student.id)}</small></td><td>${alert.averageMarks===null?"N/A":`${Math.round(alert.averageMarks)}% marks`} · ${alert.attendanceRate===null?"N/A":`${Math.round(alert.attendanceRate)}% attendance`}</td><td>${esc(alert.severity)} risk</td><td>${alert.reasons.map(esc).join("<br>")}<small>${alert.lastUpdated?`Updated ${esc(alert.lastUpdated)}`:"Date unavailable"}</small></td><td><button class="btn btn-sm" onclick="openDetail('${escapeInlineArg(alert.student.id)}')">View student</button></td></tr>`).join(""):`<tr><td colspan="5" class="empty">No source-record alerts match these filters.</td></tr>`;
 const lowAttend=metrics.alerts.filter(alert=>alert.reasons.some(reason=>reason.startsWith("Attendance"))).length,lowMarks=metrics.alerts.filter(alert=>alert.reasons.some(reason=>reason.startsWith("Assessment average"))).length,declining=metrics.alerts.filter(alert=>alert.reasons.some(reason=>reason.startsWith("Most recent dated assessment"))).length;
 const recs=[["◷","Attendance follow-up",`${lowAttend} student(s) have recorded attendance below 65%. Offer a supportive check-in and review barriers.`],["↘","Assessment support",`${lowMarks} student(s) have recorded assessment average below 55%; ${declining} show a decline of at least 10 points between the latest two dated assessment averages.`],["◎","Source coverage",`${metrics.attendanceRecordCount} valid attendance session(s) and ${metrics.assessmentRecordCount} dated assessment result(s) support these signals. Missing records are not treated as positive outcomes.`]];
 $("#recommendations").innerHTML=recs.map((r,i)=>`<div class="risk-row"><div class="risk-symbol" style="background:${i===1?"#fff5e2":i===2?"#e1f7f3":"#e5f8f3"};color:${i===1?"#bd8018":i===2?"#0f8b83":"#159c81"}">${r[0]}</div><div class="risk-text"><strong>${r[1]}</strong><small>${r[2]}</small></div></div>`).join("");
}

function avgScore(){return averageScore(students)}
function renderDirectory(){let q=($("#studentSearch").value||$("#globalSearch").value||"").toLowerCase(),rf=$("#riskFilter").value,df=$("#deptFilter").value,yf=$("#yearFilter")?$("#yearFilter").value:"all",sort=$("#sortFilter").value;let a=students.filter(s=>(!q||[s.name,s.id,s.dept].some(v=>String(v).toLowerCase().includes(q)))&&(rf==="all"||risk(s)===rf)&&(df==="all"||s.dept===df)&&(yf==="all"||s.year===yf));a.sort(sort==="scoreDesc"?(x,y)=>scoreSortValue(y)-scoreSortValue(x):sort==="name"?(x,y)=>x.name.localeCompare(y.name):(x,y)=>scoreSortValue(x)-scoreSortValue(y));$("#studentTable").innerHTML=a.length?a.map(s=>studentRow(s,true)).join(""):`<tr><td colspan="8" class="empty">No matching students. Try changing the filters.</td></tr>`;$("#studentCount").textContent=`Showing ${a.length} of ${students.length} students`;$("#dirTotal").textContent=students.length;$("#dirHigh").textContent=students.filter(s=>score(s)!==null&&score(s)>=75).length;$("#dirMed").textContent=students.filter(s=>risk(s)==="Medium").length;$("#dirRisk").textContent=students.filter(s=>risk(s)==="High").length;let ds=[...new Set(students.map(s=>s.dept))].sort();let prev=$("#deptFilter").value;$("#deptFilter").innerHTML='<option value="all">All departments</option>'+ds.map(d=>`<option>${esc(d)}</option>`).join("");$("#deptFilter").value=ds.includes(prev)?prev:"all";if($("#yearFilter"))$("#yearFilter").value=yf;}
function openCohort(kind){
 const sourceAlerts=sourceAnalyticsFor(students).alertsByStudent;
 const config={
 all:{title:"All student records",description:"Every student currently stored in the directory.",filter:s=>true},
 tracked:{title:"Students tracked",description:"All students currently included in the campus analytics dashboard.",filter:s=>true},
 average:{title:"Academic performance",description:"Students ordered by internal assessment average where available, otherwise by the academic indicator proxy used in the dashboard.",filter:s=>true,sort:(a,b)=>academicPerformanceForStudent(b)-academicPerformanceForStudent(a)},
 atrisk:{title:"Students at risk",description:"Students classified as medium or high risk under the dashboard's profile-based starter rules.",filter:s=>risk(s)!=="Low"},
 sourcealerts:{title:"Students with source-record alerts",description:"Distinct students with dated attendance or assessment records that trigger an explainable support rule.",filter:s=>sourceAlerts.has(String(s.id))},
 ontrack:{title:"Students on track",description:"Students currently classified as low risk by Rootline's transparent starter rules (no current support flags and success score at least 68). This is a screening indicator, not a guarantee of academic success.",filter:s=>risk(s)==="Low",sort:(a,b)=>scoreSortValue(b)-scoreSortValue(a)},
 placementready:{title:"Placement-ready students",description:"Final-year students with placement readiness of 70% or higher.",filter:s=>s.year==="4th Year"&&validIndicator(s,"placement")&&Number(s.placement)>=70,sort:(a,b)=>b.placement-a.placement},
 success:{title:"High-success students",description:"Students with a success score of 75/100 or higher.",filter:s=>score(s)>=75,sort:(a,b)=>scoreSortValue(b)-scoreSortValue(a)},
 medium:{title:"Medium-risk students",description:"Students currently classified as medium risk by the directory's profile-based starter rules.",filter:s=>risk(s)==="Medium"},
 high:{title:"High-risk students",description:"Students currently classified as high risk by the directory's profile-based starter rules.",filter:s=>risk(s)==="High"},
 priority:{title:"Priority support cohort",description:"Students flagged high risk by profile-based starter rules; review available indicators and offer appropriate support.",filter:s=>risk(s)==="High"},
 placementopportunity:{title:"Placement opportunity",description:"Final-year students with placement readiness below 50%.",filter:s=>s.year==="4th Year"&&validIndicator(s,"placement")&&Number(s.placement)<50,sort:(a,b)=>a.placement-b.placement},
 attendanceopportunity:{title:"Attendance opportunity",description:"Students with attendance below 65%; use this list to offer a supportive check-in and understand barriers.",filter:s=>s.attendance<65,sort:(a,b)=>a.attendance-b.attendance},
 journeyrewind:{title:"Journey rewind · Student academic history",description:"Choose a student to review semester-by-semester marks, estimated SGPA, backlogs and academic progress. Demo semester values are illustrative until verified records are supplied.",filter:s=>true,sort:(a,b)=>a.name.localeCompare(b.name)}
 }[kind]||null;
 if(!config)return;
 const cohort=students.filter(config.filter).sort(config.sort||((a,b)=>scoreSortValue(a)-scoreSortValue(b)));
 $("#cohortTitle").textContent=config.title;$("#cohortDescription").textContent=config.description;$("#cohortCount").textContent=cohort.length;
 $("#cohortTable").innerHTML=cohort.length?cohort.map(s=>`<tr><td><div class="cohort-name">${esc(s.name)}</div><div class="cohort-id">${esc(s.id)}</div></td><td>${esc(s.dept)}<br><small class="subtle">${esc(s.year)}</small></td><td><strong class="score" style="color:${scoreColor(score(s))}">${score(s)===null?"N/A":score(s)+"/100"}</strong></td><td>${s.attendance===null||s.attendance===undefined||String(s.attendance).trim()===""?"N/A":esc(s.attendance)+"%"}</td><td>${pill(risk(s))}</td><td><button class="mini-btn" onclick="${kind==='journeyrewind'?'openJourneyFromCohort':'openCohortStudent'}('${esc(s.id)}')">${kind==='journeyrewind'?'View journey ↗':'View profile ↗'}</button></td></tr>`).join(""):`<tr><td colspan="6" class="empty">No students currently match this category.</td></tr>`;
 openModal("cohortModal");
}
function openJourney(id){
 const s=students.find(x=>x.id===id);if(!s)return;selectedStudentId=id;
 const rows=buildJourney(s),isIllustrative=rows.some(r=>r.illustrative);
 $("#journeyTitle").textContent=`Journey rewind · ${s.name}`;
 $("#journeySubtitle").textContent=`${s.id} · ${s.dept} · ${s.year} · cumulative CGPA ${s.cgpa} · current backlogs ${s.backlogs}`;
 const averageMarks=rows.length?Math.round(rows.reduce((a,r)=>a+Number(r.marks||0),0)/rows.length):0;
 const totalBacklogs=rows.reduce((a,r)=>a+Number(r.backlogs||0),0);
 $("#journeySummary").innerHTML=`<div class="detail-box"><small>Semesters shown</small><b>${rows.length}</b></div><div class="detail-box"><small>${isIllustrative?"Illustrative average marks":"Recorded average marks"}</small><b>${averageMarks}%</b></div><div class="detail-box"><small>Backlogs across listed semesters</small><b>${totalBacklogs}</b></div><div class="detail-box"><small>Current cumulative CGPA</small><b>${Number(s.cgpa||0).toFixed(1)}/10</b></div>`;
 $("#journeyTable").innerHTML=rows.length?rows.map((r,i)=>{const sem=r.semesterLabel||`Semester ${r.semester||i+1}`,yr=r.yearLabel||`Year ${Math.ceil((Number(r.semester||i+1))/2)}`,marks=Number(r.marks??r.marksPercent??0),sgpa=Number(r.sgpa??(marks/10));const backs=Number(r.backlogs??0);return `<tr><td>${esc(yr)}</td><td><span class="journey-row-label">${esc(sem)}</span></td><td>${marks}%</td><td>${sgpa.toFixed(1)}/10</td><td>${backs}</td><td><span class="journey-table-status ${backs>0?'review':''}">${esc(r.status||(backs>0?'Backlog recorded':'No backlog recorded'))}</span></td></tr>`}).join(""):`<tr><td colspan="6" class="empty">No semester history is available for this student.</td></tr>`;
 $("#journeyBackToProfile").onclick=()=>{closeModal("journeyModal");openDetail(id)};
 openModal("journeyModal");
}
window.openCohortStudent=id=>{closeModal("cohortModal");openDetail(id)};
window.openJourneyFromCohort=id=>{closeModal("cohortModal");openJourney(id)};
function buildJourney(s){
  // Use official supplied semesterHistory when present; otherwise generate clearly-labelled illustrative demo rows.
  if(Array.isArray(s.semesterHistory)&&s.semesterHistory.length)return s.semesterHistory.map((r,i)=>({...r,semester:r.semester||i+1,illustrative:r.demo===true||r.illustrative===true}));
  const yearNum=parseInt(s.year,10)||1, semesters=Math.max(2,Math.min(8,yearNum*2)), rows=[];
  const base=Number(s.academic??(Number(s.cgpa||0)*10));
  for(let i=1;i<=semesters;i++){
    const drift=((i%3)-1)*4 + ((semesters-i)/Math.max(1,semesters-1))*2;
    const marks=Math.max(35,Math.min(98,Math.round(base+drift)));
    const sgpa=Math.max(4,Math.min(10,Math.round((marks/10)*10)/10));
    const backlogTotal=Math.min(Math.max(0,Number(s.backlogs||0)),semesters);
    const backlogCount=i>semesters-backlogTotal?1:0;
    const yr=Math.ceil(i/2), semName=(i%2===1)?"Odd semester":"Even semester";
    rows.push({yearLabel:`Year ${yr}`,semester:i,semesterLabel:semName,marks,sgpa,backlogs:backlogCount,status:backlogCount>0?"Review backlog status":"Recorded as clear",illustrative:true});
  }
  return rows;
}

$$(".kpi-clickable[data-cohort]").forEach(card=>{card.addEventListener("click",()=>openCohort(card.dataset.cohort));card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCohort(card.dataset.cohort)}})});
// Journey rewind is also available from the dashboard's segment list and segment playbook.
["#segmentList","#segmentPlaybook"].forEach(sel=>{
 const root=$(sel);root.addEventListener("click",e=>{const item=e.target.closest('[data-cohort="journeyrewind"]');if(item)openCohort("journeyrewind")});
 root.addEventListener("keydown",e=>{const item=e.target.closest('[data-cohort="journeyrewind"]');if(item&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openCohort("journeyrewind")}});
});
// Insight cards are recreated by renderAnalytics(), so use delegated events on their stable container.
$("#insightCards").addEventListener("click",e=>{const card=e.target.closest("[data-cohort]");if(card)openCohort(card.dataset.cohort)});
$("#insightCards").addEventListener("keydown",e=>{const card=e.target.closest("[data-cohort]");if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openCohort(card.dataset.cohort)}});
$("#cohortGoDirectory").onclick=()=>{closeModal("cohortModal");navigate("students")};
