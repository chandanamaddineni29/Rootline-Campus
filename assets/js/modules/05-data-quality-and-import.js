/* 05 Data Quality And Import
 * CSV import validation, preview flow and data quality monitoring.
 * Classic script by design: existing inline handlers rely on shared global functions.
 */
let pendingImportCommit=null;
function closeImportPreview(){pendingImportCommit=null;$("#importPreviewModal").classList.remove("show");$("#confirmImportCommit").disabled=true}
$("#closeImportPreview").onclick=$("#cancelImportPreview").onclick=closeImportPreview;
function showImportPreview({title,subtitle,rows,validCount,commit,message,confirmLabel="Commit valid records"}){
 pendingImportCommit=typeof commit==="function"?commit:null;
 $("#importPreviewTitle").textContent=title;$("#importPreviewSubtitle").textContent=subtitle||"Review validated records before committing.";
 $("#importPreviewSummary").innerHTML=`<div><div class="subtle">Valid records</div><strong>${validCount}</strong></div><div><div class="subtle">Rejected / skipped</div><strong>${rows.filter(r=>r.status!=="Valid").length}</strong></div><div><div class="subtle">Rows reviewed</div><strong>${rows.length}</strong></div>`;
 $("#importPreviewMessage").textContent=message||"Only valid records will be committed.";
 $("#importPreviewRows").innerHTML=rows.length?rows.slice(0,500).map(r=>`<tr><td>${Number(r.row)||"—"}</td><td>${esc(r.id||"—")}</td><td><span class="pill ${r.status==="Valid"?"low":r.status==="Duplicate"?"medium":"high"}">${esc(r.status)}</span></td><td>${esc(r.reason||"Ready to import")}</td></tr>`).join(""):`<tr><td colspan="4" class="empty">No records found in this file.</td></tr>`;
 $("#confirmImportCommit").textContent=confirmLabel;$("#confirmImportCommit").disabled=validCount<1||!pendingImportCommit;$("#importPreviewModal").classList.add("show");
}
$("#confirmImportCommit").onclick=()=>{if(!pendingImportCommit)return;const fn=pendingImportCommit;$("#confirmImportCommit").disabled=true;try{fn();closeImportPreview()}catch(err){$("#importPreviewMessage").textContent=`Import failed: ${err.message||"Unexpected error"}`;$("#confirmImportCommit").disabled=false}};
function normalizeImportHeader(h){return String(h||"").replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[^a-z0-9]/g,"")}
$("#moduleCsvInput").onchange=async e=>{
 const file=e.target.files&&e.target.files[0];if(!file){e.target.value="";return}
 try{
  if(!/\.csv$/i.test(file.name)&&file.type!=="text/csv")throw Error("Choose a .csv file.");
  const rows=parseCSV(await file.text());if(rows.length<2)throw Error("This CSV has a header but no data rows.");
  const cfg=moduleConfig[currentDataModule];if(!cfg)throw Error("Select a supported data module before importing.");
  const canonical=["studentId",...cfg.fields.map(f=>f[0])],canonMap=new Map(canonical.map(k=>[normalizeImportHeader(k),k]));
  const aliases={studentrollno:"studentId",rollno:"studentId",studentrollnumber:"studentId"};
  const headers=rows[0].map(h=>{const n=normalizeImportHeader(h);return aliases[n]||canonMap.get(n)||String(h||"").trim()});
  const missing=["studentId",...cfg.fields.filter(f=>f[3]).map(f=>f[0])].filter(k=>!headers.includes(k));
  if(missing.length)throw Error(`Missing required column(s): ${missing.join(", ")}. Expected: ${canonical.join(", ")}.`);
  const findStudent=id=>students.find(st=>String(st.id).trim().toLowerCase()===String(id||"").trim().toLowerCase()),preview=[],valid=[];
  for(let i=1;i<rows.length;i++){const row=rows[i],rowNo=i+1;if(!row.some(v=>String(v??"").trim()))continue;const raw={};headers.forEach((h,j)=>raw[h]=row[j]??"");const sid=String(raw.studentId||"").trim(),errors=[],student=findStudent(sid);
   if(!sid)errors.push("Missing student reference");else if(!student)errors.push(`Student ID “${sid}” does not exist`);
   const rec={_id:"REC-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),studentId:student?student.id:sid};
   for(const f of cfg.fields){const [field,label,type,required,min,max]=f,rawVal=String(raw[field]??"").trim();if(type==="number"){if(!rawVal){rec[field]="";if(required)errors.push(`${label} is required`)}else{const v=Number(rawVal),lo=typeof min==="number"?min:0;if(!Number.isFinite(v)||v<lo||(typeof max==="number"&&v>max))errors.push(`${label} must be a valid number${typeof max==="number"?` between ${lo} and ${max}`:""}`);else rec[field]=v}}else{rec[field]=rawVal;if(required&&!rawVal)errors.push(`${label} is required`);if(type==="select"&&rawVal&&!min.includes(rawVal))errors.push(`${label} must be one of: ${min.join(", ")}`);if(type==="date"&&rawVal&&!/^\d{4}-\d{2}-\d{2}$/.test(rawVal))errors.push(`${label} must use YYYY-MM-DD`)}}
   if(currentDataModule==="internal"&&Number(rec.marks)>Number(rec.maxMarks))errors.push("Marks obtained cannot exceed maximum marks");
   if(currentDataModule==="lms"&&Number(rec.assignmentsCompleted)>Number(rec.assignmentsTotal))errors.push("Assignments completed cannot exceed assignments total");
   if(currentDataModule==="placement"&&Number(rec.sessionsAttended)>Number(rec.sessionsTotal))errors.push("Sessions attended cannot exceed sessions total");
   if(currentDataModule==="semester"&&(!Number.isInteger(Number(rec.semester))||Number(rec.semester)<1||Number(rec.semester)>8))errors.push("Semester must be an integer from 1 to 8");
   if(errors.length)preview.push({row:rowNo,id:sid,status:"Invalid",reason:errors.join("; ")});else{valid.push({record:rec,student,row:rowNo,id:sid});preview.push({row:rowNo,id:sid,status:"Valid",reason:"Required fields and student reference validated"})}
  }
  if(!preview.length)throw Error("The CSV contains no non-empty data rows.");
  showImportPreview({title:`Import ${cfg.title}`,subtitle:`File: ${file.name}. Existing module records are retained; valid rows are appended.`,rows:preview,validCount:valid.length,message:"Review the valid and rejected rows before committing. Unlinked or invalid records will not be imported.",commit:()=>{
   if(!valid.length)throw Error("No valid records to commit.");
   const moduleKey=currentDataModule,oldRecords=(moduleRecords[moduleKey]||[]).slice(),oldStudents=students.map(st=>({...st,semesterHistory:Array.isArray(st.semesterHistory)?st.semesterHistory.map(h=>({...h})):st.semesterHistory}));
   const storageKeys=["campusiq_students","campusiq_actions","campusiq_module_records"],storageBefore=storageKeys.map(k=>[k,localStorage.getItem(k)]);
   try{
   const target=(moduleRecords[currentDataModule]||=[]);
   for(const item of valid){const r=item.record,student=item.student;target.push(r);if(currentDataModule==="semester"&&student){student.semesterHistory=Array.isArray(student.semesterHistory)?student.semesterHistory:[];const sem=Number(r.semester),hist={semester:sem,yearLabel:r.academicYear||`Year ${Math.ceil(sem/2)}`,semesterLabel:`Semester ${sem}`,marks:Number(r.marks||0),sgpa:Number(r.sgpa||0),backlogs:Number(r.backlogs||0),status:r.result||"Recorded",official:true,date:r.date||r.resultDate||""};const old=student.semesterHistory.find(x=>Number(x.semester)===sem&&String(x.yearLabel||"")===String(hist.yearLabel));if(old)Object.assign(old,hist);else student.semesterHistory.push(hist);student.semesterHistory.sort((a,b)=>a.semester-b.semester);student.backlogs=Number(r.backlogs||student.backlogs);if(r.cgpa!==""&&r.cgpa!==undefined)student.cgpa=Number(r.cgpa)}}
   save();renderAll();renderDataModule();toast(`Import successful: ${valid.length} ${cfg.singular}(s) added; ${preview.length-valid.length} row(s) rejected.`);e.target.value="";
   }catch(err){moduleRecords[moduleKey]=oldRecords;students.splice(0,students.length,...oldStudents);for(const [k,v] of storageBefore){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(_){}}throw err}
  }});
 }catch(err){toast(err.message||"Could not import this module CSV.")}e.target.value="";
};
let qualityFindings=[];
function runQualityScan(){
 const findings=[], allIds=new Set(students.map(s=>String(s.id||"").trim()).filter(Boolean));
 const add=(severity,category,studentId,recordId,finding,action,record)=>findings.push({severity,category,studentId:studentId||"—",recordId:recordId||"—",finding,action,record});
 const profileRanges={cgpa:[0,10],backlogs:[0,20],attendance:[0,100],lms:[0,100],engagement:[0,100],placement:[0,100],skills:[0,100],academic:[0,100]};
 const profileSeen=new Set();
 students.forEach(s=>{const sid=String(s.id||"").trim();if(!sid)add("High","Student directory","—","—","Missing student ID","Add a unique student ID.",s);if(!String(s.name||"").trim())add("High","Student directory",sid,"—","Missing student name","Enter the student's name.",s);const key=sid.toLowerCase();if(key&&profileSeen.has(key))add("High","Student directory",sid,sid,"Duplicate student ID","Keep one unique ID per student.",s);profileSeen.add(key);Object.entries(profileRanges).forEach(([k,range])=>{if(s[k]===undefined||s[k]===null||s[k]==="")add("Medium","Student directory",sid,sid,`Missing ${k} value`,`Enter a verified ${k} value.`,s);else if(!Number.isFinite(Number(s[k]))||Number(s[k])<range[0]||Number(s[k])>range[1])add("High","Student directory",sid,sid,`Invalid ${k} value: ${s[k]}`,`Use a numeric value from ${range[0]} to ${range[1]}.`,s)});});
 let scanned=students.length,demoCount=0,requiredTotal=0,requiredPresent=0;
 const fingerprints={};
 Object.entries(moduleConfig).forEach(([key,cfg])=>{const seen=new Set();(moduleRecords[key]||[]).forEach(r=>{scanned++;const sid=String(r.studentId||"").trim();if(r.demo){demoCount++;add("Info",cfg.title,sid,r._id||"DEMO","Synthetic demo/test record","Replace with verified data or delete the sample.",r)}
 if(!sid){add("High",cfg.title,sid,r._id,"Missing student ID","Link this record to an existing student.",r)}else if(!allIds.has(sid)){add("High",cfg.title,sid,r._id,"Student ID not found in directory","Correct the student ID or add the student profile.",r)}
 cfg.fields.forEach(f=>{const [field,label,type,required,optsOrMin,max]=f;if(required){requiredTotal++;if(r[field]!==undefined&&r[field]!==null&&String(r[field]).trim()!=="")requiredPresent++;else add("High",cfg.title,sid,r._id,`Missing required field: ${label}`,`Fill in ${label.toLowerCase()} for this record.`,r)}if(r[field]!==undefined&&r[field]!==null&&String(r[field]).trim()!==""&&type==="number"){const v=Number(r[field]),min=typeof optsOrMin==="number"?optsOrMin:0;if(!Number.isFinite(v)||v<min||(typeof max==="number"&&v>max))add("High",cfg.title,sid,r._id,`Out-of-range ${label}: ${r[field]}`,`Use a number${typeof max==="number"?` between ${min} and ${max}`:` of at least ${min}`}.`,r)}});
 const fp=JSON.stringify(Object.fromEntries(Object.keys(r).filter(k=>!['_id','notes','remarks','comments','demo'].includes(k)).sort().map(k=>[k,r[k]])));if(seen.has(fp))add("Medium",cfg.title,sid,r._id,"Possible duplicate record","Check whether this record was imported more than once.",r);seen.add(fp);
 if(key==="internal"&&Number(r.maxMarks)>0&&Number(r.marks)>Number(r.maxMarks))add("High",cfg.title,sid,r._id,"Marks exceed maximum marks","Verify marks obtained and maximum marks.",r);
 if(key==="lms"&&Number(r.assignmentsCompleted)>Number(r.assignmentsTotal))add("High",cfg.title,sid,r._id,"Assignments completed exceed assignments assigned","Verify both assignment counts.",r);
 if(key==="placement"&&Number(r.sessionsAttended)>Number(r.sessionsTotal))add("High",cfg.title,sid,r._id,"Sessions attended exceed available sessions","Verify attendance counts.",r);
 });});
 qualityFindings=findings;const severityRank={High:0,Medium:1,Info:2};qualityFindings.sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]);
 const issueCount=qualityFindings.filter(x=>x.severity!=="Info").length;$("#dqScanned").textContent=scanned;$("#dqIssues").textContent=issueCount;$("#dqIssueFoot").textContent=`${qualityFindings.filter(x=>x.severity==="High").length} high · ${qualityFindings.filter(x=>x.severity==="Medium").length} medium`;$("#dqCompleteness").textContent=(requiredTotal?Math.round(requiredPresent/requiredTotal*100):100)+"%";$("#dqDemo").textContent=demoCount;$("#qualityNavCount").textContent=issueCount;$("#dqLastScan").textContent="Scanned "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
 const categories=[...new Set(qualityFindings.map(x=>x.category))];const catCounts=categories.map(category=>({category,high:qualityFindings.filter(x=>x.category===category&&x.severity==="High").length,medium:qualityFindings.filter(x=>x.category===category&&x.severity==="Medium").length,info:qualityFindings.filter(x=>x.category===category&&x.severity==="Info").length}));$("#dqCategoryList").innerHTML=catCounts.length?catCounts.map(c=>`<div class="segment"><div class="seg-icon">${c.category==="Student directory"?"♙":"▤"}</div><div><strong>${esc(c.category)}</strong><small>${c.high} high · ${c.medium} medium · ${c.info} info</small><div class="bar"><i style="width:${Math.min(100,(c.high+c.medium+c.info)/Math.max(1,qualityFindings.length)*100)}%;--bar:${c.high?"#d94f68":c.medium?"#c88316":"#0f8b83"}"></i></div></div><div class="seg-right"><b>${c.high+c.medium+c.info}</b><small>findings</small></div></div>`).join(""):`<div class="empty">No findings detected.</div>`;
 const catSel=$("#dqCategoryFilter"),previous=catSel.value;catSel.innerHTML='<option value="all">All datasets</option>'+[...new Set([...Object.values(moduleConfig).map(c=>c.title),"Student directory"])].map(x=>`<option>${esc(x)}</option>`).join("");catSel.value=[...catSel.options].some(o=>o.value===previous)?previous:"all";renderQualityFindings();return qualityFindings;
}
function renderQualityFindings(){const sev=$("#dqSeverityFilter").value,cat=$("#dqCategoryFilter").value;const list=qualityFindings.filter(x=>(sev==="all"||x.severity===sev)&&(cat==="all"||x.category===cat));$("#dqFindingsTable").innerHTML=list.length?list.map(x=>{const cls=x.severity==="High"?"high":x.severity==="Medium"?"medium":x.severity==="Low"?"low":"neutral";const moduleKey=Object.keys(moduleConfig).find(k=>moduleConfig[k].title===x.category);return `<tr><td><span class="pill ${cls}">${esc(x.severity)}</span></td><td>${esc(x.category)}</td><td><b>${esc(x.studentId)}</b><br><small class="subtle">${esc(x.recordId)}</small></td><td>${esc(x.finding)}</td><td>${esc(x.action)}</td><td>${moduleKey?`<button class="mini-btn" onclick="openQualitySource('${moduleKey}')">Open dataset ↗</button>`:`<button class="mini-btn" onclick="navigate('students')">Student directory ↗</button>`}</td></tr>`}).join(""):`<tr><td colspan="6" class="empty">No findings match these filters.</td></tr>`;$("#dqFindingCount").textContent=`Showing ${list.length} of ${qualityFindings.length} findings · Info findings are excluded from the issue KPI.`}
window.openQualitySource=key=>{currentDataModule=key;navigate("data")};
function exportQualityIssues(){const headers=["severity","category","studentId","recordId","finding","suggestedAction"];const lines=[headers.join(","),...qualityFindings.map(x=>[x.severity,x.category,x.studentId,x.recordId,x.finding,x.action].map(csvCell).join(","))];const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="rootline-data-quality-findings.csv";a.click();URL.revokeObjectURL(url);toast("Quality findings exported.")}
$("#runQualityScan").onclick=runQualityScan;$("#exportQualityCsv").onclick=exportQualityIssues;$("#dqSeverityFilter").onchange=renderQualityFindings;$("#dqCategoryFilter").onchange=renderQualityFindings;

function renderAll(){renderOverview();renderDirectory();renderAnalytics();renderJourneyDirectory();renderActions();runQualityScan();renderImportReport();if($("#page-data").classList.contains("active"))renderDataModule();if(typeof renderFacultyOverview==="function")renderFacultyOverview()}
