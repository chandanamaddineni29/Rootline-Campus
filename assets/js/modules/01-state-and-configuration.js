/* 01 State And Configuration
 * Application state, demo data, persistence helpers and scoring methodology download.
 * Classic script by design: existing inline handlers rely on shared global functions.
 */
// Rootline Campus Analytics — application logic
const demoStudents=[
{id:"STU-1001",name:"Aarav Sharma",dept:"Computer Science",year:"4th Year",cgpa:8.8,backlogs:0,attendance:94,lms:92,engagement:78,placement:88,skills:86,academic:89},
{id:"STU-1002",name:"Diya Reddy",dept:"Electronics",year:"4th Year",cgpa:7.2,backlogs:1,attendance:72,lms:67,engagement:52,placement:43,skills:55,academic:68},
{id:"STU-1003",name:"Ishaan Patel",dept:"Information Technology",year:"3rd Year",cgpa:9.1,backlogs:0,attendance:91,lms:88,engagement:91,placement:78,skills:90,academic:92},
{id:"STU-1004",name:"Meera Nair",dept:"Mechanical",year:"4th Year",cgpa:6.4,backlogs:2,attendance:63,lms:49,engagement:35,placement:39,skills:46,academic:51},
{id:"STU-1005",name:"Kabir Rao",dept:"Computer Science",year:"4th Year",cgpa:8.1,backlogs:0,attendance:88,lms:80,engagement:48,placement:56,skills:63,academic:81},
{id:"STU-1006",name:"Ananya Das",dept:"Electrical",year:"2nd Year",cgpa:7.9,backlogs:0,attendance:84,lms:78,engagement:82,placement:0,skills:75,academic:79},
{id:"STU-1007",name:"Vihaan Kumar",dept:"Electronics",year:"4th Year",cgpa:5.9,backlogs:3,attendance:58,lms:42,engagement:30,placement:32,skills:38,academic:44},
{id:"STU-1008",name:"Sara Joseph",dept:"Information Technology",year:"4th Year",cgpa:8.6,backlogs:0,attendance:96,lms:94,engagement:88,placement:91,skills:89,academic:87},
{id:"STU-1009",name:"Arjun Singh",dept:"Civil",year:"3rd Year",cgpa:7.4,backlogs:1,attendance:78,lms:71,engagement:64,placement:0,skills:69,academic:72},
{id:"STU-1010",name:"Aadhya Iyer",dept:"Computer Science",year:"4th Year",cgpa:8.9,backlogs:0,attendance:90,lms:86,engagement:44,placement:48,skills:58,academic:90},
{id:"STU-1011",name:"Reyansh Gupta",dept:"Mechanical",year:"2nd Year",cgpa:6.8,backlogs:1,attendance:69,lms:58,engagement:43,placement:0,skills:52,academic:61},
{id:"STU-1012",name:"Myra Fernandes",dept:"Electrical",year:"4th Year",cgpa:7.8,backlogs:0,attendance:82,lms:76,engagement:70,placement:72,skills:74,academic:77},
{id:"STU-1013",name:"Advik Menon",dept:"Computer Science",year:"3rd Year",cgpa:6.9,backlogs:2,attendance:74,lms:61,engagement:56,placement:0,skills:60,academic:62},
{id:"STU-1014",name:"Kiara Shah",dept:"Information Technology",year:"4th Year",cgpa:9.3,backlogs:0,attendance:97,lms:96,engagement:94,placement:95,skills:93,academic:95},
{id:"STU-1015",name:"Rohan Verma",dept:"Electronics",year:"3rd Year",cgpa:7.6,backlogs:0,attendance:81,lms:72,engagement:61,placement:0,skills:71,academic:76},
{id:"STU-1016",name:"Saanvi Bose",dept:"Civil",year:"4th Year",cgpa:6.2,backlogs:2,attendance:66,lms:53,engagement:39,placement:41,skills:44,academic:49},
{id:"STU-1017",name:"Atharv Kulkarni",dept:"Computer Science",year:"4th Year",cgpa:8.3,backlogs:0,attendance:87,lms:81,engagement:73,placement:68,skills:76,academic:84},
{id:"STU-1018",name:"Ira Chawla",dept:"Information Technology",year:"2nd Year",cgpa:8.2,backlogs:0,attendance:89,lms:85,engagement:80,placement:0,skills:81,academic:83}
];
// Read browser-persisted data defensively. A malformed or outdated localStorage
// value should not stop the whole dashboard from booting; keep the raw value in a
// recovery key before falling back to a safe default.
function readStoredJSON(key,fallback,validate){
  let raw;
  try{raw=localStorage.getItem(key)}catch(err){console.warn(`Rootline could not read local storage key "${key}".`,err);return fallback}
  if(raw===null)return fallback;
  try{
    const value=JSON.parse(raw);
    if(validate&&!validate(value))throw new Error("Stored data has an unexpected structure.");
    return value;
  }catch(err){
    try{localStorage.setItem(`campusiq_recovery_${key}`,raw)}catch(recoveryError){console.warn("Rootline could not preserve a recovery copy.",recoveryError)}
    console.warn(`Rootline recovered from invalid saved data for "${key}"; the original value was retained under campusiq_recovery_${key}.`,err);
    return fallback;
  }
}
const defaultModuleRecords={attendance:[],internal:[],semester:[],lms:[],placement:[],extra:[],feedback:[]};
let students=readStoredJSON("campusiq_students",demoStudents,v=>Array.isArray(v)&&v.every(x=>x&&typeof x==="object"&&!Array.isArray(x)));
let actions=readStoredJSON("campusiq_actions",[],v=>Array.isArray(v)).map(normalizeAction);
const storedModuleRecords=readStoredJSON("campusiq_module_records",null,v=>v&&typeof v==="object"&&!Array.isArray(v));
let moduleRecords={...defaultModuleRecords};
if(storedModuleRecords)for(const key of Object.keys(defaultModuleRecords))if(Array.isArray(storedModuleRecords[key]))moduleRecords[key]=storedModuleRecords[key];
// One-time synthetic test dataset so every workspace module is populated on first use.
// These records are examples only and must not be treated as official college data.
const demoDataAlreadySeeded=localStorage.getItem("campusiq_test_data_seeded")==="yes";
const moduleKeys=["attendance","internal","semester","lms","placement","extra","feedback"];
if(!demoDataAlreadySeeded){
  const hasAnyRecords=moduleKeys.some(k=>Array.isArray(moduleRecords[k])&&moduleRecords[k].length>0);
  if(!hasAnyRecords){
    const demo=(studentId,values)=>({_id:"DEMO-"+studentId+"-"+Math.random().toString(36).slice(2,7),studentId,...values,demo:true});
    moduleRecords={
      attendance:[
        demo("STU-1001",{date:"2026-10-05",subject:"Data Structures",status:"Present",attendancePercent:94,notes:"DEMO test record"}),
        demo("STU-1002",{date:"2026-10-05",subject:"Digital Electronics",status:"Absent",attendancePercent:72,notes:"DEMO test record; sample follow-up"}),
        demo("STU-1003",{date:"2026-10-06",subject:"Database Systems",status:"Present",attendancePercent:91,notes:"DEMO test record"}),
        demo("STU-1004",{date:"2026-10-06",subject:"Engineering Mechanics",status:"Late",attendancePercent:63,notes:"DEMO test record"}),
        demo("STU-1008",{date:"2026-10-07",subject:"Web Technologies",status:"Present",attendancePercent:96,notes:"DEMO test record"}),
        demo("STU-1016",{date:"2026-10-07",subject:"Surveying",status:"Absent",attendancePercent:66,notes:"DEMO test record"})
      ],
      internal:[
        demo("STU-1001",{date:"2026-09-18",assessment:"Internal Test 1",subject:"Data Structures",marks:43,maxMarks:50,remarks:"DEMO: strong fundamentals"}),
        demo("STU-1002",{date:"2026-09-19",assessment:"Internal Test 1",subject:"Digital Electronics",marks:31,maxMarks:50,remarks:"DEMO: practice problems"}),
        demo("STU-1003",{date:"2026-09-20",assessment:"Internal Test 1",subject:"Database Systems",marks:46,maxMarks:50,remarks:"DEMO: sample record"}),
        demo("STU-1004",{date:"2026-09-21",assessment:"Internal Test 1",subject:"Engineering Mechanics",marks:25,maxMarks:50,remarks:"DEMO: mentoring suggested"}),
        demo("STU-1008",{date:"2026-09-22",assessment:"Internal Test 2",subject:"Web Technologies",marks:44,maxMarks:50,remarks:"DEMO: sample record"}),
        demo("STU-1016",{date:"2026-09-23",assessment:"Internal Test 2",subject:"Structural Analysis",marks:28,maxMarks:50,remarks:"DEMO: review concepts"})
      ],
      semester:[
        demo("STU-1001",{academicYear:"2024-25",semester:5,examSession:"Nov 2024 (DEMO)",marks:88,sgpa:8.8,cgpa:8.6,backlogs:0,result:"Pass"}),
        demo("STU-1001",{academicYear:"2024-25",semester:6,examSession:"Apr 2025 (DEMO)",marks:90,sgpa:9.0,cgpa:8.7,backlogs:0,result:"Pass"}),
        demo("STU-1002",{academicYear:"2024-25",semester:5,examSession:"Nov 2024 (DEMO)",marks:69,sgpa:7.0,cgpa:7.1,backlogs:1,result:"Backlog"}),
        demo("STU-1002",{academicYear:"2024-25",semester:6,examSession:"Apr 2025 (DEMO)",marks:73,sgpa:7.4,cgpa:7.2,backlogs:1,result:"Pass"}),
        demo("STU-1003",{academicYear:"2024-25",semester:3,examSession:"Nov 2024 (DEMO)",marks:92,sgpa:9.2,cgpa:9.0,backlogs:0,result:"Pass"}),
        demo("STU-1003",{academicYear:"2024-25",semester:4,examSession:"Apr 2025 (DEMO)",marks:89,sgpa:8.9,cgpa:9.1,backlogs:0,result:"Pass"}),
        demo("STU-1004",{academicYear:"2024-25",semester:5,examSession:"Nov 2024 (DEMO)",marks:54,sgpa:5.8,cgpa:6.1,backlogs:2,result:"Backlog"}),
        demo("STU-1004",{academicYear:"2024-25",semester:6,examSession:"Apr 2025 (DEMO)",marks:61,sgpa:6.2,cgpa:6.2,backlogs:2,result:"Pass"})
      ],
      lms:[
        demo("STU-1001",{date:"2026-10-01",course:"Data Structures",logins:18,assignmentsCompleted:8,assignmentsTotal:8,quizAverage:92,notes:"DEMO activity"}),
        demo("STU-1002",{date:"2026-10-01",course:"Digital Electronics",logins:7,assignmentsCompleted:4,assignmentsTotal:7,quizAverage:68,notes:"DEMO activity"}),
        demo("STU-1003",{date:"2026-10-02",course:"Database Systems",logins:16,assignmentsCompleted:9,assignmentsTotal:9,quizAverage:89,notes:"DEMO activity"}),
        demo("STU-1004",{date:"2026-10-02",course:"Engineering Mechanics",logins:5,assignmentsCompleted:3,assignmentsTotal:8,quizAverage:51,notes:"DEMO activity"}),
        demo("STU-1008",{date:"2026-10-03",course:"Web Technologies",logins:21,assignmentsCompleted:10,assignmentsTotal:10,quizAverage:95,notes:"DEMO activity"}),
        demo("STU-1016",{date:"2026-10-03",course:"Structural Analysis",logins:8,assignmentsCompleted:5,assignmentsTotal:8,quizAverage:58,notes:"DEMO activity"})
      ],
      placement:[
        demo("STU-1001",{date:"2026-09-25",program:"Aptitude Bootcamp",sessionsAttended:8,sessionsTotal:8,mockScore:88,certification:"DEMO: completion badge",status:"Completed"}),
        demo("STU-1002",{date:"2026-09-25",program:"Communication Skills",sessionsAttended:5,sessionsTotal:8,mockScore:61,certification:"",status:"In progress"}),
        demo("STU-1004",{date:"2026-09-26",program:"Coding Practice",sessionsAttended:3,sessionsTotal:8,mockScore:42,certification:"",status:"Needs follow-up"}),
        demo("STU-1008",{date:"2026-09-27",program:"Mock Interview Series",sessionsAttended:9,sessionsTotal:9,mockScore:93,certification:"DEMO: interview readiness",status:"Completed"}),
        demo("STU-1010",{date:"2026-09-27",program:"Resume Workshop",sessionsAttended:6,sessionsTotal:6,mockScore:79,certification:"DEMO: workshop attended",status:"Completed"}),
        demo("STU-1016",{date:"2026-09-28",program:"Aptitude Remediation",sessionsAttended:2,sessionsTotal:6,mockScore:48,certification:"",status:"In progress"})
      ],
      extra:[
        demo("STU-1001",{date:"2026-08-15",activity:"Hackathon",category:"Technical",role:"Team developer",achievement:"DEMO: finalist",hours:12}),
        demo("STU-1002",{date:"2026-08-20",activity:"Electronics Club",category:"Club",role:"Participant",achievement:"DEMO: workshop attendee",hours:4}),
        demo("STU-1003",{date:"2026-09-02",activity:"Coding Contest",category:"Competition",role:"Contestant",achievement:"DEMO: top 10",hours:6}),
        demo("STU-1004",{date:"2026-09-10",activity:"Campus Clean-up",category:"Volunteering",role:"Volunteer",achievement:"DEMO: participation",hours:3}),
        demo("STU-1008",{date:"2026-09-12",activity:"Cultural Fest",category:"Cultural",role:"Coordinator",achievement:"DEMO: event lead",hours:10}),
        demo("STU-1016",{date:"2026-09-18",activity:"Interdepartment Sports",category:"Sports",role:"Team member",achievement:"DEMO: participation",hours:5})
      ],
      feedback:[
        demo("STU-1001",{date:"2026-10-04",category:"Teaching",rating:5,comments:"DEMO: explanations are clear and examples are useful.",followup:"No"}),
        demo("STU-1002",{date:"2026-10-04",category:"LMS / technology",rating:3,comments:"DEMO: please improve mobile access to course materials.",followup:"In progress"}),
        demo("STU-1003",{date:"2026-10-05",category:"Course content",rating:4,comments:"DEMO: add more practical exercises.",followup:"No"}),
        demo("STU-1004",{date:"2026-10-05",category:"Student support",rating:2,comments:"DEMO: would benefit from extra tutorial sessions.",followup:"Yes"}),
        demo("STU-1008",{date:"2026-10-06",category:"Facilities",rating:5,comments:"DEMO: laboratory access is helpful.",followup:"Resolved"}),
        demo("STU-1016",{date:"2026-10-06",category:"Placement services",rating:3,comments:"DEMO: request additional mock interviews.",followup:"In progress"})
      ]
    };
    // Show semester demo records in Journey Rewind, clearly marked as sample data.
    for(const r of moduleRecords.semester){const st=students.find(x=>x.id===r.studentId);if(!st)continue;st.semesterHistory=Array.isArray(st.semesterHistory)?st.semesterHistory:[];st.semesterHistory.push({semester:Number(r.semester),yearLabel:r.academicYear,semesterLabel:`Semester ${r.semester}`,marks:Number(r.marks),sgpa:Number(r.sgpa),backlogs:Number(r.backlogs),status:`DEMO · ${r.result}`,demo:true});}
    save();
  }
  localStorage.setItem("campusiq_test_data_seeded","yes");
}
let currentDataModule="attendance";
let selectedStudentId=null, editingId=null;
let importReconciliation=readStoredJSON("campusiq_import_reconciliation",[],v=>Array.isArray(v));
let historicalSnapshots=readStoredJSON("campusiq_historical_snapshots",[],v=>Array.isArray(v));
const weights=[["Academic performance",30,"academic"],["Attendance",20,"attendance"],["LMS engagement",15,"lms"],["Engagement",10,"engagement"],["Placement readiness",15,"placement"],["Skills assessment",10,"skills"]];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function save(){localStorage.setItem("campusiq_students",JSON.stringify(students));localStorage.setItem("campusiq_actions",JSON.stringify(actions));localStorage.setItem("campusiq_module_records",JSON.stringify(moduleRecords));if(window.RootlineDatabase)window.RootlineDatabase.sync()}
function actionStatus(a){return a.status||((a.done) ? "Completed" : "Open")}
function normalizeAction(a){if(!a||typeof a!=="object")return a;const status=actionStatus(a);return {...a,type:a.type||"Academic support",owner:a.owner||"",dueDate:a.dueDate||"",createdAt:a.createdAt||a.date||new Date().toISOString().slice(0,10),status,done:status==="Completed",outcome:a.outcome||"",followUps:Array.isArray(a.followUps)?a.followUps:[]}}
function persistActionsAndRefresh(message){actions=actions.map(normalizeAction);save();renderActions();renderOverview();if(selectedStudentId&&$("#detailModal")?.classList.contains("show"))openDetail(selectedStudentId);if(message)toast(message)}
let customUsers=Array.isArray(window.RootlineInitialUsers)?window.RootlineInitialUsers:[];
function saveUsers(){window.RootlineInitialUsers=customUsers}
function downloadMethodology(){
 const lines=[
  "Rootline Campus Analytics — Student Success Score Methodology",
  "Version: Rule-based starter model v1.0",
  "",
  "Purpose",
  "The score is a rule-based decision-support indicator to help staff prioritize supportive conversations. It is not a definitive prediction, diagnosis, or trained/validated machine-learning model. Source data may be synthetic demo data or locally imported records.",
  "",
  "Indicators and configured weights",
  ...weights.map(w=>`- ${w[0]}: ${w[1]}% (field: ${w[2]})`),
  "",
  "Calculation",
  "For each student, include only indicators with finite numeric values in the 0–100 range. Exclude unavailable or invalid indicators and renormalize the remaining configured weights to total 100%. Placement readiness is applicable only to students in 4th Year. Valid linked source records take precedence for academic (internal marks/max marks), attendance (attendance percentages), LMS (quiz average and assignment completion), and fourth-year placement (mock scores). Valid values are averaged within each workspace; where no valid linked value exists, the profile indicator is used as fallback. These aggregation rules are not institution-specific validated measures.",
  "If no applicable indicator has a valid value, the score is unavailable (N/A), not zero.",
  "",
  "Risk thresholds",
  "- High: score below 45, attendance below 55%, or at least 3 recorded backlogs.",
  "- Medium: any configured risk reason is present, or score below 68.",
  "- Low: no configured risk reasons and score at least 68.",
  "- If there is insufficient data to calculate a score, the application marks the record for review rather than interpreting missing data as good performance.",
  "",
  "Separate indicator categories (rule-based, not validated predictions)",
  "- Academic risk: High when the available academic measure is below 55 or 3+ backlogs are recorded; Medium when the academic measure is below 70 or 1–2 backlogs are recorded; otherwise Low when sufficient data exists.",
  "- Placement readiness risk: only applicable to 4th Year; High below 45%, Medium from 45% to below 60%, and Low at 60% or higher. Missing placement data remains unavailable.",
  "",
  "Limitations and responsible use",
  "Scores depend on the completeness, accuracy, and context of available records. Missing data can change the applicable weights. Review contributing factors with the student and faculty; do not use this score alone for high-impact decisions.",
  "Demo data in this application is synthetic and must not be represented as official institutional data.",
  "",
  `Generated: ${new Date().toISOString()}`
 ];
 const blob=new Blob([lines.join("\r\n")],{type:"text/plain;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="rootline-score-methodology.txt";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("Methodology note downloaded.");
}
