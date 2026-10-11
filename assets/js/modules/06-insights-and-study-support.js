/* 06 Insights And Study Support
 * Rule-based insight assistant and student study-support responses.
 * Classic script by design: existing inline handlers rely on shared global functions.
 */
function aiAnswer(prompt,scope){
 const q=String(prompt||"").trim().toLowerCase();
 if(!q)return {title:"Enter a question",html:"<p>Type a question or choose one of the suggested prompts to explore the loaded campus data.</p>"};
 const pct=n=>`${Math.round(n*10)/10}%`;
 const list=arr=>arr.length?`<ul>${arr.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"<p>No matching student records were found in the current dataset.</p>";
 const ranked=students.map(s=>({...s,_score:score(s),_risk:risk(s),_reasons:reasons(s)}));
 const high=ranked.filter(s=>s._risk==="High").sort((a,b)=>scoreSortValue(a)-scoreSortValue(b));
 const lowAttendance=ranked.filter(s=>validIndicator(s,"attendance")&&Number(s.attendance)<65).sort((a,b)=>a.attendance-b.attendance);
 const placement=ranked.filter(s=>s.year==="4th Year"&&validIndicator(s,"placement")&&Number(s.placement)<50).sort((a,b)=>a.placement-b.placement);
 const deptNames=[...new Set(students.map(s=>s.dept))];
 const depts=deptNames.map(dept=>({dept,arr:students.filter(s=>s.dept===dept)})).map(d=>({...d,avgScore:averageScore(d.arr),avgAtt:avg("attendance",d.arr)})).sort((a,b)=>(a.avgScore??-1)-(b.avgScore??-1));
 const moduleKey=currentDataModule, cfg=moduleConfig[moduleKey], records=moduleRecords[moduleKey]||[];
 const moduleLabel=cfg?.title||"current dataset";
 const has=(...terms)=>terms.some(t=>q.includes(t));
 let title="Campus insight",body="",items=[];
 if(has("high risk","at risk","risk students","risk cohort","risk student","risk and why")){
  title="Students requiring priority review";body=`Rootline's rule-based review currently flags ${high.length} of ${students.length} students as high risk using configured indicators; this is not a trained predictive model. The strongest current signals are low attendance, low academic score, three or more backlogs, and low composite success score.`;
  items=high.map(s=>`${s.name} (${s.id}) — score ${s._score===null?"N/A":s._score+"/100"}; attendance ${validIndicator(s,"attendance")?s.attendance+"%":"N/A"}; ${s._reasons.join(", ")||"review profile"}`);
 }else if(has("attendance","absent","presence")){
  title="Attendance support analysis";body=`${lowAttendance.length} of ${students.length} students are below the demo attendance threshold of 65%. Start with a private check-in to understand barriers, verify the attendance records, and agree on a realistic follow-up plan.`;
  items=lowAttendance.map(s=>`${s.name} (${s.id}) — ${s.attendance}% attendance, ${s.dept}, ${s.year}`);
 }else if(has("placement","job ready","readiness","mock interview")){
  title="Placement-readiness opportunities";body=`${placement.length} fourth-year students currently have placement-readiness scores below 50%. These are prioritization signals, not hiring predictions. Offer skills diagnostics, practice interviews and targeted training, then track progress.`;
  items=placement.map(s=>`${s.name} (${s.id}) — readiness ${s.placement}%, skills ${s.skills}%, academic ${s.academic}%`);
 }else if(has("department","departments","compare","comparison")){
  title="Department comparison";body="Departments ranked by average Student Success Score (lower to higher). Check cohort sizes and missing data before interpreting differences.";
  items=depts.map(d=>`${d.dept}: average score ${d.avgScore===null?"N/A":Math.round(d.avgScore)+"/100"} across ${d.arr.length} students; average attendance ${d.avgAtt===null?"N/A":pct(d.avgAtt)}`);
 }else if(has("feedback","satisfaction","rating","comments")){
  const rs=moduleRecords.feedback||[];const ratings=rs.map(r=>Number(r.rating)).filter(n=>n>=1&&n<=5);const mean=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;const topics={};rs.forEach(r=>{const k=r.category||"Unspecified";topics[k]=(topics[k]||0)+1});
  title="Student feedback summary";body=`There are ${rs.length} feedback responses in the local dataset${mean===null?".":`; the average recorded rating is ${mean.toFixed(1)}/5.`} ${rs.some(r=>["Yes","In progress"].includes(r.followup))?"Some responses are marked for follow-up; review those records first.":"Review topic-level comments and confirm whether any require follow-up."}`;
  items=Object.entries(topics).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${v} response(s)`);
 }else if(has("data quality","missing","gap","complete","invalid","quality")){
  title="Data-quality review";const issues=runQualityScan();const nonInfo=issues.filter(i=>i.severity!=="Info");body=`The current quality scan evaluated ${issues.length} finding(s) across the loaded datasets; ${nonInfo.length} are non-informational findings. Synthetic/demo rows are intentionally identified separately. Resolve missing or invalid values and unmatched student IDs before using results for formal decisions.`;
  items=issues.slice(0,8).map(i=>`${i.severity}: ${i.category} — ${i.finding} (${i.studentId||i.recordId||"record"})`);
 }else if(has("summarize","summary","overall","campus situation","next steps","recommended action","what should")){
  const med=ranked.filter(s=>s._risk==="Medium");const avgSc=avgScore();body=`Across ${students.length} loaded student profiles, the average success score is ${avgSc===null?"unavailable (no valid scores)":Math.round(avgSc)+"/100"}. Current rules flag ${high.length} high-risk and ${med.length} medium-risk students; ${lowAttendance.length} students are below 65% attendance. Use these indicators to guide supportive review, not as standalone decisions.`;
  items=[`Review high-risk students and verify their latest academic/attendance records.`,`Prioritize attendance check-ins for ${lowAttendance.length} student(s) below 65%.`,`For final-year students below 50% placement readiness, offer practice and targeted training.`,`Assign a named mentor, due date and follow-up outcome for each intervention.`];
 }else if(scope==="workspace"){
  const distinct=new Set(records.map(r=>r.studentId).filter(Boolean)).size;
  title=`${moduleLabel}: workspace insight`;
  body=`The ${moduleLabel.toLowerCase()} workspace contains ${records.length} record(s) covering ${distinct} unique student(s). ${records.length===0?"No records are available yet, so import verified data before asking for trend analysis.":"I can summarize record coverage and recommend review steps, but detailed conclusions depend on the fields actually recorded."}`;
  if(moduleKey==="attendance"){
   const vals=records.map(r=>Number(r.attendancePercent)).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);const mean=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;items=[`Valid attendance percentages: ${vals.length} of ${records.length} record(s).`,mean===null?"No valid attendance percentages available.":`Average recorded attendance: ${pct(mean)}.`,`Students below the 65% profile threshold: ${lowAttendance.length}.`,`Next step: check missing dates/statuses and follow up privately with students who may need support.`];
   }else if(moduleKey==="internal"){
    const vals=records.map(r=>Number(r.maxMarks)>0?Number(r.marks||0)/Number(r.maxMarks)*100:null).filter(n=>n!==null&&Number.isFinite(n));items=[`Valid mark percentages: ${vals.length} of ${records.length} record(s).`,vals.length?`Average recorded mark: ${pct(vals.reduce((a,b)=>a+b,0)/vals.length)}.`:"No valid marks found.","Next step: identify repeated low performance by subject and offer academic support." ];
   }else if(moduleKey==="semester"){
    const vals=records.map(r=>Number(r.sgpa)).filter(n=>Number.isFinite(n)&&n>0);const back=records.filter(r=>Number(r.backlogs)>0);items=[`Valid SGPA values: ${vals.length}.`,vals.length?`Average recorded SGPA: ${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)} / 10.`:"No valid SGPA values found.",`Records with one or more backlogs: ${back.length}.`,"Next step: verify semester results against official records before making academic decisions."];
   }else if(moduleKey==="lms"){
    const vals=records.map(r=>Number(r.quizAverage)).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);items=[`Valid quiz scores: ${vals.length} of ${records.length} record(s).`,vals.length?`Average quiz score: ${pct(vals.reduce((a,b)=>a+b,0)/vals.length)}.`:"No valid quiz scores found.","Next step: review low activity and incomplete assignments alongside course context; do not assume low logins alone mean disengagement."];
   }else if(moduleKey==="placement"){
    const vals=records.filter(r=>r.mockScore!==undefined&&r.mockScore!==null&&String(r.mockScore).trim()!=="").map(r=>Number(r.mockScore)).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);items=[`Valid mock scores: ${vals.length}.`,vals.length?`Average mock score: ${pct(vals.reduce((a,b)=>a+b,0)/vals.length)}.`:"No mock scores recorded.",`Final-year students below 50% readiness in the profile: ${placement.length}.`,"Next step: set a targeted practice plan and measure progress over time."];
   }else if(moduleKey==="extra"){
    items=[`Distinct activities: ${new Set(records.map(r=>r.activity).filter(Boolean)).size}.`,`Categories represented: ${new Set(records.map(r=>r.category).filter(Boolean)).size}.`,"Next step: use participation records to offer inclusive opportunities; participation should not be treated as a proxy for academic ability."];
   }else if(moduleKey==="feedback"){
    const vals=records.map(r=>Number(r.rating)).filter(n=>n>=1&&n<=5);items=[`Valid ratings: ${vals.length} of ${records.length} record(s).`,vals.length?`Average rating: ${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)}/5.`:"No valid ratings found.",`Follow-up needed/in progress: ${records.filter(r=>["Yes","In progress"].includes(r.followup)).length} response(s).`,`Next step: review comments for recurring themes and close the loop by recording actions.`];
   }
 }else{
  title="Try a supported question";body="I can answer questions about high-risk students, attendance below 65%, placement readiness, department comparisons, campus-wide summaries, feedback, data quality, or the current data workspace.";
  items=["Which students are at high risk and why?","Compare departments by average success score.","Which students need attendance support?","Who needs placement support?","Summarize this workspace and identify data gaps."];
 }
 return {title,html:`<h4>${esc(title)}</h4><p>${esc(body)}</p>${items.length?list(items):""}<div class="ai-caveat">Generated from the current browser dataset using transparent rules and summaries. This prototype does not call a hosted AI model; it may not understand every free-form prompt. Verify source records and use human review before acting.</div>`};
}
function askAI(scope){const input=$(scope==="analytics"?"#aiAnalyticsPrompt":"#aiWorkspacePrompt"),out=$(scope==="analytics"?"#aiAnalyticsResponse":"#aiWorkspaceResponse");const result=aiAnswer(input.value,scope);out.innerHTML=result.html;out.classList.add("show");out.scrollIntoView({behavior:"smooth",block:"nearest"});}
$$("[data-ai-ask]").forEach(b=>b.addEventListener("click",()=>askAI(b.dataset.aiAsk)));
$$('[data-ai-prompt]').forEach(b=>b.addEventListener("click",()=>{const scope=b.dataset.aiPrompt;const input=$(scope==="analytics"?"#aiAnalyticsPrompt":"#aiWorkspacePrompt");input.value=b.dataset.prompt;askAI(scope)}));
["#aiAnalyticsPrompt","#aiWorkspacePrompt"].forEach(sel=>$(sel).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();askAI(sel==="#aiAnalyticsPrompt"?"analytics":"workspace")}}));
function answerStudyQuestion(raw){
 const q=String(raw||"").trim().toLowerCase();
 if(!q)return {title:"Ask a question",body:"Enter your doubt or choose one of the suggested prompts."};
 let title="Study guidance",steps=[];
 if(/study plan|timetable|time table|schedule|prepare.*\d+ day|\d+ day/.test(q)){
  title="Make a realistic study schedule";steps=["List the exact topics and mark each as easy, medium or difficult.","Start each session with a clear outcome, such as solving five problems or explaining one concept.","Split available time between learning, active recall and practice questions.","Keep the final 15–20% of your preparation time for revision and a timed self-test.","Review progress daily and move unfinished topics forward instead of overloading one day."];
 }else if(/focus|concentrat|distract|procrastinat/.test(q)){
  title="Improve focus and consistency";steps=["Choose one small task before starting; avoid a vague goal like ‘study everything’.","Put your phone away and keep only the material needed for that task open.","Use a 25-minute focus block with a 5-minute break, or a 45–50-minute block if that suits you.","Write distracting thoughts on a note and return to them during the break.","Track completed sessions rather than waiting to feel motivated."];
 }else if(/revision|remember|memor|forget|recall/.test(q)){
  title="A revision method that lasts";steps=["First, try to recall the topic without looking at notes.","Check your notes and correct gaps in a different colour.","Solve 3–5 questions or explain the topic aloud in your own words.","Revisit it after one day, three days and one week; shorten the intervals for difficult topics.","Keep a mistake list and practise those questions again before the exam."];
 }else if(/coding|program|python|java|c\+\+|debug|algorithm/.test(q)){
  title="Learn coding through deliberate practice";steps=["Understand the concept and trace one small example by hand.","Write the code yourself without copying a complete solution.","Test normal, boundary and invalid inputs; predict the output before running it.","When stuck, isolate the smallest failing example and read the error carefully.","After solving, explain the approach and complexity, then solve a similar problem independently."];
 }else if(/exam|test|marks|university|midterm|finals|question paper/.test(q)){
  title="Exam preparation strategy";steps=["Check the syllabus, exam pattern and marks distribution first.","Prioritise high-value topics you partly understand, then address foundational gaps.","For each topic, make a one-page summary and practise writing answers without notes.","Attempt timed questions or a previous paper and review every mistake.","In the final review, focus on formulas, definitions, diagrams, common errors and sleep—not learning everything from scratch."];
 }else if(/concept|understand|explain|difficult|confus|doubt/.test(q)){
  title="Work through a difficult concept";steps=["Write the exact concept or sentence that is confusing you.","Identify the prerequisite idea you need to understand first.","Use a tiny example and predict what should happen before checking the result.","Explain the idea in plain language as if teaching a beginner.","Try one easy problem, one standard problem and one application; ask a more specific follow-up if the gap remains."];
 }else if(/stress|tired|burnout|overwhelm|too much/.test(q)){
  title="Make studying manageable";steps=["Reduce today's target to the two most important tasks.","Start with a 10-minute session to lower the barrier to beginning.","Take regular breaks, eat and hydrate normally, and protect sleep.","Use a short review of what you completed to plan tomorrow rather than extending work indefinitely.","If persistent distress or exhaustion is affecting daily life, reach out to someone you trust or a qualified professional."];
 }else{
  title="Let's narrow down your doubt";steps=["Tell me the subject and exact topic (for example, ‘Computer Networks — explain subnetting’).","Include the part you already understand and where you get stuck.","If it is a problem, paste the question and your attempt so the explanation can focus on the missing step.","I can help structure an explanation, examples and practice questions; this prototype does not yet use a live AI model."];
 }
 return {title,body:steps};
}
function renderStudyAnswer(){const result=answerStudyQuestion($("#studyQuestion").value);$("#studyAnswer").innerHTML=`<h4>${esc(result.title)}</h4>${typeof result.body==="string"?`<p>${esc(result.body)}</p>`:`<ol style="font-size:12px;color:#4d5871;padding-left:20px;margin:8px 0">${result.body.map(x=>`<li style="margin:7px 0">${esc(x)}</li>`).join("")}</ol>`}<p class="ai-caveat">Learning guidance only. Check your course syllabus and instructor guidance for requirements specific to your class.</p>`;$("#studyAnswer").classList.add("show");}
$("#askStudyQuestion").addEventListener("click",renderStudyAnswer);
$("#studyQuestion").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();renderStudyAnswer();}});
$$("[data-study-question]").forEach(b=>b.addEventListener("click",()=>{$("#studyQuestion").value=b.dataset.studyQuestion;renderStudyAnswer();}));
$("#studyPlanForm").addEventListener("submit",e=>{
 e.preventDefault();const subjects=$("#studySubjects").value.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);const days=Math.max(1,Math.min(90,Number($("#studyDays").value)||7));const hours=Math.max(.5,Math.min(16,Number($("#studyHours").value)||2));const goal=$("#studyGoal").value;const level=$("#studyLevel").value;const total=Math.round(days*hours*10)/10;const daily=Math.max(1,Math.ceil(subjects.length/Math.max(1,days)));const labels={exam:"Exam preparation",concepts:"Concept understanding",coding:"Coding practice",revision:"Revision",balanced:"Balanced study"};
 const focus=goal==="coding"?"concept review + hands-on coding problems":goal==="revision"?"closed-book recall + practice questions":goal==="exam"?"learn key ideas + exam-style questions":"concept learning + a short self-test";
 const subjectItems=Array.from({length:days},(_,i)=>{const sub=subjects[i%subjects.length];const extra=subjects.length>1?` and ${subjects[(i+1)%subjects.length]}`:"";const phase=i>=Math.max(0,days-2)?"; finish with recap and a short timed self-test":"";return `<li><b>Day ${i+1}:</b> ${esc(sub+extra)} — ${esc(focus)}${phase}</li>`});
 const dailyBlocks=hours<1.5?`<li>${Math.round(hours*60)} minutes: focused learning or revision</li><li>Use the last 5–10 minutes for recall and a next-step note</li>`:`<li>${Math.round(hours*0.5*60)} minutes: learn or revise the main concept</li><li>${Math.round(hours*0.3*60)} minutes: solve questions / practise examples</li><li>${Math.max(5,Math.round(hours*0.2*60))} minutes: active recall, mistake log and plan tomorrow</li>`;
 const levelTip=level==="beginner"?"Start with prerequisites and worked examples before attempting difficult questions.":level==="some"?"Spend less time rereading basics and more time on problems that reveal gaps.":"Use closed-book recall, timed practice and your mistake list as the main activities.";
 $("#studyPlanAnswer").innerHTML=`<h4>Your ${days}-day study plan · ${esc(labels[goal])}</h4><p><b>Time budget:</b> about ${total} total hours (${hours} hour(s) each day) across ${subjects.length} subject/topic(s).</p><p><b>Approach:</b> ${esc(levelTip)}</p><h4 style="margin-top:13px">Daily session structure</h4><ul>${dailyBlocks}</ul><h4 style="margin-top:13px">Topic rotation</h4><ol>${subjectItems.join("")}</ol><h4 style="margin-top:13px">Milestones</h4><ul><li><b>Early phase:</b> cover core concepts and note unclear areas.</li><li><b>Middle phase:</b> practise questions and revisit weak topics.</li><li><b>Final 1–2 days:</b> revise summaries, redo mistakes and take a timed self-test. If your plan is shorter than 3 days, reserve the final 20% of your time for this.</li></ul><p class="ai-caveat">This is a starter schedule generated in your browser, not a live AI-generated plan. Adjust the order to your syllabus, exam date and topic difficulty.</p>`;
 $("#studyPlanAnswer").classList.add("show");
});

