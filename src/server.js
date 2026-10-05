const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();
const loginAttempts = new Map();

const defaultGrades = ['الرابع الابتدائي', 'الأول المتوسط'];
const defaultSubjects = {
  'الرابع الابتدائي': ['لغتي','الرياضيات','العلوم','الدراسات الإسلامية','الدراسات الاجتماعية','اللغة الإنجليزية','المهارات الرقمية','التربية الفنية','التربية البدنية والدفاع عن النفس'],
  'الأول المتوسط': ['لغتي الخالدة','الرياضيات','العلوم','الدراسات الإسلامية','الدراسات الاجتماعية','اللغة الإنجليزية','المهارات الرقمية','التربية الفنية','التربية البدنية والدفاع عن النفس']
};
const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 180000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored='') {
  try {
    const [salt, oldHash] = stored.split(':');
    if (!salt || !oldHash) return false;
    const newHash = hashPassword(password, salt).split(':')[1];
    return crypto.timingSafeEqual(Buffer.from(oldHash, 'hex'), Buffer.from(newHash, 'hex'));
  } catch { return false; }
}
function slug(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0,12); }
function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function demoPlansForOct4(users) {
  const week = '2026-10-04';
  const lessons = {
    'لغتي': [
      ['قراءة: مدينتي الجميلة','قراءة النص والإجابة عن الأسئلة 1–3'],
      ['المبتدأ والخبر','حل تدريبات الكتاب ص 42'],
      ['الهمزة المتوسطة على الألف','كتابة خمس كلمات تتضمن همزة متوسطة'],
      ['التعبير: وصف مكان','كتابة فقرة قصيرة من خمسة أسطر'],
      ['مراجعة مهارات الوحدة','مراجعة الدروس استعدادًا للتقويم']
    ],
    'لغتي الخالدة': [
      ['الفهم القرائي: قيم العمل','حل أسئلة الفهم والاستيعاب'],
      ['الوظيفة النحوية: المبتدأ والخبر','حل تدريبات ص 48–49'],
      ['الرسم الإملائي: الهمزة المتوسطة','كتابة عشرة أمثلة في الدفتر'],
      ['التواصل الكتابي: كتابة وصفية','كتابة فقرة وصفية من ثمانية أسطر'],
      ['مراجعة مكتسبات الوحدة','مراجعة القواعد والمفردات']
    ],
    'الرياضيات': [
      ['القيمة المنزلية للأعداد','حل التمارين 1–6'],
      ['مقارنة الأعداد وترتيبها','حل ورقة العمل المرفقة'],
      ['الجمع وتقدير الناتج','حل مسائل التدريب ص 35'],
      ['الطرح مع إعادة التجميع','حل التمارين 7–12'],
      ['حل المسألة والتحقق من الإجابة','حل مسألتي تحدٍ في الدفتر']
    ],
    'العلوم': [
      ['الخلايا ووظائفها','رسم خلية وتسمية أجزائها'],
      ['تصنيف المخلوقات الحية','إكمال جدول التصنيف'],
      ['السلاسل والشبكات الغذائية','إنشاء سلسلة غذائية من البيئة المحلية'],
      ['التكيف والبقاء','حل أسئلة الدرس ص 54'],
      ['مراجعة مفاهيم الوحدة','إكمال خريطة المفاهيم']
    ],
    'الدراسات الإسلامية': [
      ['تلاوة وحفظ الآيات المقررة','مراجعة الحفظ مع ولي الأمر'],
      ['معاني المفردات والتفسير','كتابة ثلاثة فوائد من الدرس'],
      ['حديث: فضل الصدق','حفظ الحديث ومعناه'],
      ['فقه: آداب الصلاة','حل نشاط الدرس'],
      ['مراجعة التلاوة والحديث والفقه','الاستعداد للتقويم القصير']
    ],
    'الدراسات الاجتماعية': [
      ['الموقع والاتجاهات الأصلية','رسم الجهات الأصلية والفرعية'],
      ['الخريطة ومكوناتها','تحديد عناصر الخريطة في النشاط'],
      ['تضاريس المملكة العربية السعودية','تسمية أهم التضاريس على خريطة صماء'],
      ['المناخ والطقس','تسجيل حالة الطقس ليوم واحد'],
      ['مراجعة مفاهيم الأسبوع','حل أسئلة المراجعة']
    ],
    'اللغة الإنجليزية': [
      ['Unit vocabulary: Daily routines','Write each new word in a sentence'],
      ['Grammar: Present simple','Complete exercises 1–5'],
      ['Reading: A school day','Answer the reading questions'],
      ['Speaking: My daily routine','Prepare five sentences for speaking'],
      ['Weekly review','Review vocabulary and grammar']
    ],
    'المهارات الرقمية': [
      ['مكونات الحاسب الأساسية','كتابة وظيفة ثلاثة مكونات'],
      ['تنظيم الملفات والمجلدات','إنشاء مجلدات مرتبة للتدريب'],
      ['تنسيق النصوص','تطبيق التنسيق على فقرة قصيرة'],
      ['إدراج الصور في المستند','إنشاء مستند يتضمن صورة وعنوانًا'],
      ['مراجعة المهارات العملية','إكمال النشاط التطبيقي']
    ],
    'التربية الفنية': [
      ['عناصر التصميم: الخط والشكل','رسم تكوين باستخدام أنواع مختلفة من الخطوط'],
      ['التوازن في العمل الفني','إكمال التكوين الفني'],
      ['التلوين بالألوان المتناسقة','تلوين العمل وفق لوحة لونية محددة'],
      ['الزخارف الهندسية','تصميم وحدة زخرفية بسيطة'],
      ['عرض وتقويم الأعمال الفنية','إحضار العمل الفني مكتملًا']
    ],
    'التربية البدنية والدفاع عن النفس': [
      ['الإحماء واللياقة البدنية','ممارسة تمارين الإطالة لمدة 10 دقائق'],
      ['مهارة التمرير والاستلام','تدريب منزلي آمن على التمرير'],
      ['التوازن والتوافق الحركي','ممارسة تمرينات التوازن'],
      ['مبادئ السلامة أثناء النشاط','كتابة ثلاث قواعد للسلامة'],
      ['تطبيق مهاري ومنافسات مصغرة','مراجعة المهارات التي تم تعلمها']
    ]
  };
  return users.filter(u => u.role === 'teacher').map((u, n) => {
    const items = lessons[u.subject] || Array.from({length:5},(_,i)=>[`درس تجريبي ${i+1}`,`واجب تجريبي ${i+1}`]);
    const entries = {};
    days.forEach((day, i) => {
      entries[day] = {
        title: items[i][0],
        objective: `أن يحقق الطالب ناتج التعلم المرتبط بموضوع «${items[i][0]}» بصورة صحيحة.`,
        activity: i % 2 === 0 ? 'مناقشة صفية وتطبيق فردي قصير.' : 'تعلم تعاوني ثم تطبيق عملي ومراجعة الإجابات.',
        homework: items[i][1]
      };
    });
    return {id:`demo_20261004_${n+1}`, userId:u.id, week, entries, submitted:true, createdAt:'2026-10-04T06:00:00.000Z', updatedAt:'2026-10-04T10:00:00.000Z'};
  });
}

function initDb() {
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;
  const users = [{id:'admin', role:'admin', label:'مدير المدرسة', passwordHash:hashPassword('admin'), mustChangePassword:false}];
  const gradePins = {'الرابع الابتدائي': 4101, 'الأول المتوسط': 1101};
  for (const grade of defaultGrades) defaultSubjects[grade].forEach((subject, index) => {
    const id = `t_${slug(grade+'|'+subject)}`;
    const pin = String(gradePins[grade] + index);
    users.push({id, role:'teacher', grade, subject, label:`${subject} – ${grade}`, passwordHash:hashPassword(pin), adminVisiblePassword:pin, active:true});
  });
  const db = {
    version:2,
    settings:{schoolName:'الموهبين الرياضية', principalName:'', schoolYear:'1448هـ', headerNote:'خطة التعلّم الأسبوعية'},
    users, plans:demoPlansForOct4(users), lockedWeeks:[]
  };
  atomicWrite(DB_FILE, JSON.stringify(db, null, 2));
}
function migrateDb(db) {
  db.version ||= 2;
  db.settings ||= {schoolName:db.schoolName || 'الموهبين الرياضية', principalName:'', schoolYear:'1448هـ', headerNote:'خطة التعلّم الأسبوعية'};
  db.lockedWeeks ||= [];
  db.users ||= [];
  db.plans ||= [];
  for (const u of db.users) {
    if (u.role==='teacher' && u.active === undefined) u.active = true;
    if (u.role==='teacher' && !u.adminVisiblePassword) {
      const base = u.grade === 'الرابع الابتدائي' ? 4101 : (u.grade === 'الأول المتوسط' ? 1101 : null);
      const idx = defaultSubjects[u.grade]?.indexOf(u.subject) ?? -1;
      if (base !== null && idx >= 0) {
        const candidate = String(base + idx);
        if (verifyPassword(candidate, u.passwordHash)) u.adminVisiblePassword = candidate;
      }
    }
  }
  return db;
}
function readDb(){ return migrateDb(JSON.parse(fs.readFileSync(DB_FILE,'utf8'))); }
function writeDb(db){ atomicWrite(DB_FILE, JSON.stringify(db,null,2)); }
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function parseCookies(req){ return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]})); }
function getSession(req){ const sid=parseCookies(req).sid; if(!sid) return null; const s=sessions.get(sid); if(!s) return null; if(Date.now()-s.created>8*60*60*1000){sessions.delete(sid);return null;} return s; }
function getUser(req){ const s=getSession(req); if(!s) return null; const db=readDb(); return db.users.find(u=>u.id===s.userId && (u.role==='admin'||u.active!==false))||null; }
function makeSession(res,userId){ const sid=crypto.randomBytes(32).toString('hex'); const csrf=crypto.randomBytes(24).toString('hex'); sessions.set(sid,{userId,csrf,created:Date.now()}); res.setHeader('Set-Cookie',`sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`); }
function clearSession(req,res){const sid=parseCookies(req).sid;if(sid)sessions.delete(sid);res.setHeader('Set-Cookie','sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');}
function csrf(req){ return getSession(req)?.csrf || ''; }
function csrfInput(req){ return `<input type="hidden" name="csrf" value="${esc(csrf(req))}">`; }
function validCsrf(req,b){ return !!csrf(req) && b.csrf === csrf(req); }
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e6){reject(new Error('BODY_TOO_LARGE'));req.destroy();}});req.on('end',()=>resolve(Object.fromEntries(new URLSearchParams(d))));req.on('error',reject);});}
function currentSunday(){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-d.getDay()); return d.toISOString().slice(0,10); }
function validDate(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'') && !Number.isNaN(new Date(x+'T12:00:00').getTime());}
function fmtDate(x){ if(!validDate(x))return ''; const d=new Date(x+'T12:00:00'); return new Intl.DateTimeFormat('ar-SA',{year:'numeric',month:'long',day:'numeric'}).format(d); }
function redirect(res,loc){res.writeHead(303,{Location:loc});res.end();}
function html(res,status,content){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'});res.end(content);}
function messageFrom(url){ const m=url.searchParams.get('m'); return m ? `<div class="success">${esc(m)}</div>` : ''; }
function errorFrom(url){ const m=url.searchParams.get('e'); return m ? `<div class="alert">${esc(m)}</div>` : ''; }
function gradesFromDb(db){return [...new Set(db.users.filter(u=>u.role==='teacher'&&u.active!==false).map(u=>u.grade))].sort((a,b)=>a.localeCompare(b,'ar'));}

function layout(title, content, user=null){
 const db=readDb(); const school=esc(db.settings.schoolName||'الموهبين الرياضية');
 const nav=user?`<header><div class="brand"><span class="brand-mini">م</span><div><strong>خطة التعلّم الأسبوعية</strong><small>${school}</small></div></div><nav>${user.role==='admin'?'<a href="/admin">الرئيسية</a><a href="/admin/accounts">الحسابات</a><a href="/admin/settings">الإعدادات</a>':'<a href="/teacher">خطتي</a>'}<a href="/logout">تسجيل الخروج</a></nav></header>`:'';
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#155e75"><title>${esc(title)} | ${school}</title><link rel="stylesheet" href="/style.css?v=20261005-pro2"></head><body>${nav}<main>${content}</main></body></html>`;
}
function loginPage(error=''){
 const db=readDb();
 return layout('تسجيل الدخول',`<section class="login-card"><div class="brand-mark">م</div><h1>خطة التعلّم الأسبوعية</h1><h2>${esc(db.settings.schoolName)}</h2><p>أدخل كلمة المرور المخصصة لك. لا يلزم اسم مستخدم.</p>${error?`<div class="alert">${esc(error)}</div>`:''}<form method="post" action="/login"><label>كلمة المرور</label><div class="password-row"><input id="password" name="password" type="password" minlength="4" maxlength="128" required autofocus autocomplete="current-password" placeholder="••••••••"><button type="button" class="ghost" onclick="const p=document.getElementById('password');p.type=p.type==='password'?'text':'password'">إظهار</button></div><button class="primary wide">دخول</button></form><div class="login-note">كل كلمة مرور مرتبطة بحساب محدد: مادة وصف، أو حساب الإدارة.</div></section>`);
}
function forcePasswordPage(req,user,error=''){
 return layout('تغيير كلمة مرور المدير',`<section class="login-card"><div class="brand-mark">م</div><h1>تأمين حساب المدير</h1><p>هذه أول مرة تستخدم فيها النظام. غيّر كلمة المرور الافتراضية قبل المتابعة.</p>${error?`<div class="alert">${esc(error)}</div>`:''}<form method="post" action="/admin/first-password">${csrfInput(req)}<label>كلمة المرور الجديدة<input type="password" name="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><label>تأكيد كلمة المرور<input type="password" name="confirm" minlength="8" maxlength="128" required autocomplete="new-password"></label><button class="primary wide">حفظ ومتابعة</button></form></section>`,user);
}
function teacherPage(req,user, week=currentSunday(), msg='', err=''){
 const db=readDb(); const plan=db.plans.find(p=>p.userId===user.id&&p.week===week) || {entries:{}}; const locked=db.lockedWeeks.includes(week);
 const rows=days.map((day,i)=>{const e=plan.entries[day]||{};return `<article class="day-card"><h3><span>${day}</span><small>${i+1}</small></h3><div class="grid"><label>عنوان الدرس<input name="title_${i}" value="${esc(e.title||'')}" maxlength="180" placeholder="عنوان الدرس" ${locked?'disabled':''}></label><label>هدف التعلّم<textarea name="objective_${i}" rows="3" maxlength="800" placeholder="ما المتوقع أن يتعلمه الطالب؟" ${locked?'disabled':''}>${esc(e.objective||'')}</textarea></label><label>النشاط / الاستراتيجية<textarea name="activity_${i}" rows="3" maxlength="800" placeholder="النشاط أو استراتيجية التدريس" ${locked?'disabled':''}>${esc(e.activity||'')}</textarea></label><label>الواجب / المهمة<textarea name="homework_${i}" rows="3" maxlength="800" placeholder="الواجب أو المهمة" ${locked?'disabled':''}>${esc(e.homework||'')}</textarea></label></div></article>`}).join('');
 return layout('خطة المعلم',`<section class="hero"><div><span class="badge">${esc(user.grade)}</span><h1>${esc(user.subject)}</h1><p>أدخل خطة المادة للأسبوع من الأحد إلى الخميس.</p></div><div class="status ${plan.submitted?'done':''}">${locked?'🔒 الأسبوع مقفل':plan.submitted?'✓ تم تسليم الخطة':'قيد الإعداد'}</div></section>${msg?`<div class="success">${esc(msg)}</div>`:''}${err?`<div class="alert">${esc(err)}</div>`:''}<form method="get" class="weekbar"><label>الأسبوع (يبدأ يوم الأحد)<input type="date" name="week" value="${esc(week)}"></label><button class="secondary">عرض الأسبوع</button></form><form method="post" action="/teacher/save">${csrfInput(req)}<input type="hidden" name="week" value="${esc(week)}">${rows}${locked?'<div class="notice">هذا الأسبوع مقفل من الإدارة ويمكنك عرضه فقط.</div>':`<div class="actions"><button class="secondary" name="action" value="save">حفظ كمسودة</button><button class="success-btn" name="action" value="submit">حفظ وتسليم للمدير</button></div>`}</form>`,user);
}
function adminPage(req,user, week=currentSunday(), grade='الكل', msg='', err=''){
 const db=readDb(); const grades=gradesFromDb(db); let teachers=db.users.filter(u=>u.role==='teacher'&&u.active!==false); if(grade!=='الكل')teachers=teachers.filter(u=>u.grade===grade);
 const cards=teachers.map(t=>{const p=db.plans.find(x=>x.userId===t.id&&x.week===week);return `<tr><td>${esc(t.grade)}</td><td>${esc(t.subject)}</td><td><span class="pill ${p?.submitted?'green':p?'amber':'gray'}">${p?.submitted?'تم التسليم':p?'مسودة':'لم يبدأ'}</span></td><td>${p?.updatedAt?new Date(p.updatedAt).toLocaleString('ar-SA'): '—'}</td><td>${p?`<a href="/admin/plan?week=${encodeURIComponent(week)}&userId=${encodeURIComponent(t.id)}">عرض</a>`:'—'}</td></tr>`}).join('');
 const submitted=teachers.filter(t=>db.plans.find(p=>p.userId===t.id&&p.week===week&&p.submitted)).length; const drafts=teachers.filter(t=>{const p=db.plans.find(p=>p.userId===t.id&&p.week===week);return p&&!p.submitted}).length; const locked=db.lockedWeeks.includes(week);
 return layout('لوحة المدير',`<section class="hero"><div><span class="badge">لوحة الإدارة</span><h1>خطة التعلّم الأسبوعية</h1><p>${esc(db.settings.schoolName)} · ${esc(db.settings.schoolYear||'')}</p></div><div class="metric"><b>${submitted}/${teachers.length}</b><span>تم التسليم</span></div></section>${msg?`<div class="success">${esc(msg)}</div>`:''}${err?`<div class="alert">${esc(err)}</div>`:''}<section class="stats"><div><b>${teachers.length}</b><span>المواد</span></div><div><b>${submitted}</b><span>تم التسليم</span></div><div><b>${drafts}</b><span>مسودات</span></div><div><b>${teachers.length-submitted-drafts}</b><span>لم يبدأ</span></div></section><form method="get" class="filters"><label>الأسبوع<input type="date" name="week" value="${esc(week)}"></label><label>الصف<select name="grade"><option ${grade==='الكل'?'selected':''}>الكل</option>${grades.map(g=>`<option ${grade===g?'selected':''}>${esc(g)}</option>`).join('')}</select></label><button class="secondary">تحديث</button><a class="primary button-link" href="/admin/print?week=${encodeURIComponent(week)}&grade=${encodeURIComponent(grade)}">تجميع وتصدير PDF</a></form><div class="admin-actions"><form method="post" action="/admin/lock">${csrfInput(req)}<input type="hidden" name="week" value="${esc(week)}"><input type="hidden" name="grade" value="${esc(grade)}"><button class="${locked?'ghost':'danger'}" name="action" value="${locked?'unlock':'lock'}">${locked?'فتح الأسبوع للتعديل':'قفل الأسبوع'}</button></form><span class="muted">${locked?'المعلمون يستطيعون العرض فقط.':'المعلمون يستطيعون الحفظ والتعديل.'}</span></div><section class="panel"><div class="panel-head"><h2>حالة تسليم المواد</h2><span class="pill ${locked?'amber':'green'}">${locked?'الأسبوع مقفل':'الأسبوع مفتوح'}</span></div><div class="table-wrap"><table><thead><tr><th>الصف</th><th>المادة</th><th>الحالة</th><th>آخر تحديث</th><th>الخطة</th></tr></thead><tbody>${cards||'<tr><td colspan="5">لا توجد حسابات ضمن هذا الاختيار.</td></tr>'}</tbody></table></div></section>`,user);
}
function adminPlanPage(req,user,target,week,msg=''){
 const db=readDb(); const plan=db.plans.find(p=>p.userId===target.id&&p.week===week); if(!plan)return layout('الخطة','<div class="alert">لا توجد خطة محفوظة.</div>',user);
 const rows=days.map((d,i)=>{const e=plan.entries[d]||{};return `<article class="day-card"><h3>${d}</h3><div class="grid"><label>عنوان الدرس<input name="title_${i}" value="${esc(e.title||'')}"></label><label>هدف التعلّم<textarea name="objective_${i}" rows="3">${esc(e.objective||'')}</textarea></label><label>النشاط / الاستراتيجية<textarea name="activity_${i}" rows="3">${esc(e.activity||'')}</textarea></label><label>الواجب / المهمة<textarea name="homework_${i}" rows="3">${esc(e.homework||'')}</textarea></label></div></article>`}).join('');
 return layout('عرض الخطة',`<section class="hero"><div><span class="badge">${esc(target.grade)}</span><h1>${esc(target.subject)}</h1><p>الأسبوع ابتداءً من ${fmtDate(week)}</p></div><div class="status ${plan.submitted?'done':''}">${plan.submitted?'تم التسليم':'مسودة'}</div></section>${msg?`<div class="success">${esc(msg)}</div>`:''}<form method="post" action="/admin/plan/save">${csrfInput(req)}<input type="hidden" name="userId" value="${esc(target.id)}"><input type="hidden" name="week" value="${esc(week)}">${rows}<div class="actions"><a class="ghost button-link" href="/admin?week=${encodeURIComponent(week)}&grade=${encodeURIComponent(target.grade)}">رجوع</a><button class="primary" name="submitted" value="${plan.submitted?'1':'0'}">حفظ تعديلات الإدارة</button></div></form>`,user);
}
function accountsPage(req,user,msg='',err=''){
 const db=readDb(); const teachers=db.users.filter(u=>u.role==='teacher').sort((a,b)=>(a.grade+a.subject).localeCompare(b.grade+b.subject,'ar'));
 const rows=teachers.map(t=>`<tr class="${t.active===false?'inactive':''}"><td>${esc(t.grade)}</td><td>${esc(t.subject)}</td><td><span class="password-code">${t.adminVisiblePassword?esc(t.adminVisiblePassword):'غير متاحة — غيّرها لتظهر'}</span></td><td>${t.active===false?'<span class="pill gray">معطل</span>':'<span class="pill green">نشط</span>'}</td><td><form method="post" action="/admin/account/password" class="inline-form">${csrfInput(req)}<input type="hidden" name="userId" value="${esc(t.id)}"><input name="newPassword" minlength="4" maxlength="128" required inputmode="numeric" placeholder="4 أرقام"><button class="secondary">تغيير</button></form></td><td><form method="post" action="/admin/account/toggle">${csrfInput(req)}<input type="hidden" name="userId" value="${esc(t.id)}"><button class="ghost">${t.active===false?'تفعيل':'تعطيل'}</button></form></td></tr>`).join('');
 return layout('إدارة الحسابات',`<section class="page-title"><div><span class="badge">الإدارة</span><h1>حسابات المواد</h1><p>كل حساب يفتح مادته وصفه تلقائيًا بكلمة مرور فقط.</p></div></section>${msg?`<div class="success">${esc(msg)}</div>`:''}${err?`<div class="alert">${esc(err)}</div>`:''}<section class="panel"><h2>إضافة حساب مادة</h2><form method="post" action="/admin/account/add" class="account-add">${csrfInput(req)}<label>الصف<input name="grade" maxlength="80" required placeholder="مثال: الرابع الابتدائي"></label><label>المادة<input name="subject" maxlength="100" required placeholder="مثال: الرياضيات"></label><label>كلمة المرور<input type="password" name="password" minlength="4" maxlength="128" required inputmode="numeric" autocomplete="new-password"></label><button class="primary">إضافة الحساب</button></form></section><section class="panel"><h2>الحسابات الحالية</h2><div class="table-wrap"><table><thead><tr><th>الصف</th><th>المادة</th><th>كلمة المرور</th><th>الحالة</th><th>تغيير كلمة المرور</th><th>إدارة</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,user);
}
function settingsPage(req,user,msg='',err=''){
 const db=readDb(),s=db.settings;
 return layout('إعدادات المدرسة',`<section class="page-title"><div><span class="badge">الإدارة</span><h1>إعدادات المدرسة</h1><p>تظهر هذه البيانات في لوحة الإدارة وفي نسخة الطباعة.</p></div></section>${msg?`<div class="success">${esc(msg)}</div>`:''}${err?`<div class="alert">${esc(err)}</div>`:''}<section class="panel"><h2>بيانات الترويسة</h2><form method="post" action="/admin/settings" class="settings-form">${csrfInput(req)}<label>اسم المدرسة<input name="schoolName" maxlength="120" value="${esc(s.schoolName||'')}" required></label><label>العام الدراسي<input name="schoolYear" maxlength="40" value="${esc(s.schoolYear||'')}"></label><label>اسم المدير/ة<input name="principalName" maxlength="120" value="${esc(s.principalName||'')}"></label><label>عنوان التقرير<input name="headerNote" maxlength="120" value="${esc(s.headerNote||'خطة التعلّم الأسبوعية')}"></label><button class="primary">حفظ الإعدادات</button></form></section><section class="panel"><h2>كلمة مرور المدير</h2><form method="post" action="/admin/password" class="password-admin">${csrfInput(req)}<input type="password" name="currentPassword" required placeholder="كلمة المرور الحالية"><input type="password" name="newPassword" minlength="8" maxlength="128" required placeholder="كلمة المرور الجديدة"><input type="password" name="confirm" minlength="8" maxlength="128" required placeholder="تأكيد الجديدة"><button class="secondary">تغيير كلمة المرور</button></form></section><section class="panel warning-panel"><h2>نسخة احتياطية</h2><p class="muted">نزّل ملف البيانات للاحتفاظ بنسخة احتياطية من الحسابات والخطط والإعدادات.</p><a class="ghost button-link" href="/admin/backup">تنزيل النسخة الاحتياطية JSON</a></section>`,user);
}
function printPage(user, week, grade){
 const db=readDb();
 const allTeachers=db.users.filter(u=>u.role==='teacher'&&u.active!==false);
 const grades=grade==='الكل'?defaultGrades:[grade];
 const dayDate=(i)=>{const d=new Date(week+'T12:00:00');d.setDate(d.getDate()+i);return new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'numeric',year:'numeric'}).format(d)};
 const cover=(g)=>`<section class="report-cover"><div class="cover-ribbon">الخطة الأسبوعية</div><div class="cover-school">${esc(db.settings.schoolName)}</div><div class="cover-center"><div class="cover-line"></div><h1>الخطة الأسبوعية للصف ${esc(g)}</h1><h2>متابعة أسبوعية لدروس الطالب</h2><p>الأسبوع ابتداءً من ${fmtDate(week)} · ${esc(db.settings.schoolYear||'')}</p></div>${db.settings.principalName?`<div class="cover-principal">مدير/ة المدرسة: ${esc(db.settings.principalName)}</div>`:''}<div class="cover-footer">${esc(db.settings.headerNote||'خطة التعلّم الأسبوعية')} · ${esc(db.settings.schoolYear||'')}</div></section>`;
 const tableFor=(g)=>{
   const teachers=allTeachers.filter(u=>u.grade===g).sort((a,b)=>defaultSubjects[g].indexOf(a.subject)-defaultSubjects[g].indexOf(b.subject));
   const rows=teachers.map((t,idx)=>{const p=db.plans.find(x=>x.userId===t.id&&x.week===week);const cells=(field)=>days.map(d=>`<td>${esc(p?.entries?.[d]?.[field]||'—')}</td>`).join('');return `<tr><th class="subject-cell subject-${idx%6}" rowspan="2">${esc(t.subject)}</th><th class="req-cell">الدرس</th>${cells('title')}</tr><tr><th class="req-cell">الواجب</th>${cells('homework')}</tr>`}).join('');
   return `<section class="weekly-sheet"><h1>خطة التعلم الأسبوعية لمواد (${esc(g)})</h1><h2>الأسبوع ابتداءً من ${fmtDate(week)} · ${esc(db.settings.schoolYear||'')}</h2><table class="weekly-grid"><thead><tr><th>المادة</th><th>المطلب</th>${days.map((d,i)=>`<th>${d}<small>${dayDate(i)}</small></th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="7">لا توجد حسابات مواد لهذا الصف.</td></tr>'}</tbody></table><div class="sheet-sign">${db.settings.principalName?`مدير/ة المدرسة: ${esc(db.settings.principalName)}`:''}</div></section>`;
 };
 const content=grades.map(g=>cover(g)+tableFor(g)).join('');
 return layout('الخطة الأسبوعية',`<div class="print-toolbar"><button onclick="window.print()" class="primary">طباعة / حفظ PDF</button><a class="ghost button-link" href="/admin?week=${encodeURIComponent(week)}&grade=${encodeURIComponent(grade)}">رجوع</a></div>${content}`,user);
}
function serveStatic(res,file,type){try{const p=path.join(ROOT,'public',file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end('Not found')}}
function loginBlocked(ip){const x=loginAttempts.get(ip);if(!x)return false;if(Date.now()-x.first>15*60*1000){loginAttempts.delete(ip);return false;}return x.count>=8;}
function recordBadLogin(ip){const x=loginAttempts.get(ip);if(!x||Date.now()-x.first>15*60*1000)loginAttempts.set(ip,{count:1,first:Date.now()});else x.count++;}

initDb();
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const user=getUser(req); const db=readDb();
  if(url.pathname==='/style.css')return serveStatic(res,'style.css','text/css; charset=utf-8');
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(url.pathname==='/'&&req.method==='GET'){
    if(!user)return html(res,200,loginPage());
    if(user.role==='admin'&&user.mustChangePassword)return redirect(res,'/admin/first-password');
    return redirect(res,user.role==='admin'?'/admin':'/teacher');
  }
  if(url.pathname==='/login'&&req.method==='POST'){
    const ip=req.socket.remoteAddress||'unknown'; if(loginBlocked(ip))return html(res,429,loginPage('محاولات دخول كثيرة. حاول مرة أخرى بعد 15 دقيقة.'));
    const b=await body(req); const found=db.users.find(u=>(u.role==='admin'||u.active!==false)&&verifyPassword(b.password||'',u.passwordHash));
    if(!found){recordBadLogin(ip);return html(res,401,loginPage('كلمة المرور غير صحيحة.'));}
    loginAttempts.delete(ip); makeSession(res,found.id); return redirect(res,found.role==='admin'?(found.mustChangePassword?'/admin/first-password':'/admin'):'/teacher');
  }
  if(url.pathname==='/logout'){clearSession(req,res);return redirect(res,'/');}
  if(!user)return redirect(res,'/');
  if(user.role==='admin'&&user.mustChangePassword&&url.pathname!=='/admin/first-password')return redirect(res,'/admin/first-password');

  if(url.pathname==='/admin/first-password'&&user.role==='admin'&&req.method==='GET')return html(res,200,forcePasswordPage(req,user));
  if(url.pathname==='/admin/first-password'&&user.role==='admin'&&req.method==='POST'){
    const b=await body(req); if(!validCsrf(req,b))return html(res,403,forcePasswordPage(req,user,'انتهت الجلسة. أعد المحاولة.'));
    if((b.password||'').length<8||b.password!==b.confirm)return html(res,400,forcePasswordPage(req,user,'كلمتا المرور غير متطابقتين أو أقصر من 8 أحرف.'));
    const d=readDb(),a=d.users.find(u=>u.id===user.id);a.passwordHash=hashPassword(b.password);a.mustChangePassword=false;writeDb(d);return redirect(res,'/admin?m='+encodeURIComponent('تم تأمين حساب المدير.'));
  }
  if(url.pathname==='/teacher'&&user.role==='teacher'){
    const week=validDate(url.searchParams.get('week'))?url.searchParams.get('week'):currentSunday(); return html(res,200,teacherPage(req,user,week,url.searchParams.get('m')||'',url.searchParams.get('e')||''));
  }
  if(url.pathname==='/teacher/save'&&req.method==='POST'&&user.role==='teacher'){
    const b=await body(req); if(!validCsrf(req,b))return html(res,403,teacherPage(req,user,currentSunday(),'','انتهت الجلسة. أعد المحاولة.'));
    if(!validDate(b.week))return redirect(res,'/teacher?e='+encodeURIComponent('تاريخ الأسبوع غير صالح.'));
    const d=readDb(); if(d.lockedWeeks.includes(b.week))return redirect(res,`/teacher?week=${encodeURIComponent(b.week)}&e=${encodeURIComponent('هذا الأسبوع مقفل من الإدارة.')}`);
    let p=d.plans.find(x=>x.userId===user.id&&x.week===b.week);if(!p){p={id:crypto.randomUUID(),userId:user.id,week:b.week,entries:{},submitted:false,createdAt:new Date().toISOString()};d.plans.push(p)}
    days.forEach((day,i)=>p.entries[day]={title:(b[`title_${i}`]||'').slice(0,180),objective:(b[`objective_${i}`]||'').slice(0,800),activity:(b[`activity_${i}`]||'').slice(0,800),homework:(b[`homework_${i}`]||'').slice(0,800)});p.submitted=b.action==='submit';p.updatedAt=new Date().toISOString();writeDb(d);
    return redirect(res,`/teacher?week=${encodeURIComponent(b.week)}&m=${encodeURIComponent(p.submitted?'تم حفظ الخطة وتسليمها للمدير.':'تم حفظ المسودة.')}`);
  }
  if(url.pathname==='/admin'&&user.role==='admin'){
    const week=validDate(url.searchParams.get('week'))?url.searchParams.get('week'):currentSunday(); const grade=url.searchParams.get('grade')||'الكل'; return html(res,200,adminPage(req,user,week,grade,url.searchParams.get('m')||'',url.searchParams.get('e')||''));
  }
  if(url.pathname==='/admin/lock'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb(); if(validDate(b.week)){if(b.action==='lock'&&!d.lockedWeeks.includes(b.week))d.lockedWeeks.push(b.week);if(b.action==='unlock')d.lockedWeeks=d.lockedWeeks.filter(w=>w!==b.week);writeDb(d);}return redirect(res,`/admin?week=${encodeURIComponent(b.week||currentSunday())}&grade=${encodeURIComponent(b.grade||'الكل')}&m=${encodeURIComponent(b.action==='lock'?'تم قفل الأسبوع.':'تم فتح الأسبوع للتعديل.')}`);
  }
  if(url.pathname==='/admin/print'&&user.role==='admin'){
    const week=validDate(url.searchParams.get('week'))?url.searchParams.get('week'):currentSunday();const grade=url.searchParams.get('grade')||'الكل';return html(res,200,printPage(user,week,grade));
  }
  if(url.pathname==='/admin/plan'&&user.role==='admin'){
    const target=db.users.find(u=>u.id===url.searchParams.get('userId')&&u.role==='teacher');const week=url.searchParams.get('week');if(!target||!validDate(week))return html(res,404,layout('غير موجود','<div class="alert">الخطة غير موجودة.</div>',user));return html(res,200,adminPlanPage(req,user,target,week,url.searchParams.get('m')||''));
  }
  if(url.pathname==='/admin/plan/save'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb(),target=d.users.find(u=>u.id===b.userId&&u.role==='teacher'),p=d.plans.find(p=>p.userId===b.userId&&p.week===b.week);if(!target||!p)return redirect(res,'/admin?e='+encodeURIComponent('الخطة غير موجودة.'));
    days.forEach((day,i)=>p.entries[day]={title:(b[`title_${i}`]||'').slice(0,180),objective:(b[`objective_${i}`]||'').slice(0,800),activity:(b[`activity_${i}`]||'').slice(0,800),homework:(b[`homework_${i}`]||'').slice(0,800)});p.updatedAt=new Date().toISOString();p.adminEditedAt=p.updatedAt;writeDb(d);return redirect(res,`/admin/plan?userId=${encodeURIComponent(target.id)}&week=${encodeURIComponent(b.week)}&m=${encodeURIComponent('تم حفظ تعديلات الإدارة.')}`);
  }
  if(url.pathname==='/admin/accounts'&&user.role==='admin')return html(res,200,accountsPage(req,user,url.searchParams.get('m')||'',url.searchParams.get('e')||''));
  if(url.pathname==='/admin/account/add'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin/accounts?e='+encodeURIComponent('انتهت الجلسة.'));
    const grade=(b.grade||'').trim(),subject=(b.subject||'').trim(),password=b.password||'';if(!grade||!subject||password.length<4)return redirect(res,'/admin/accounts?e='+encodeURIComponent('أكمل البيانات وكلمة مرور من 4 أرقام على الأقل.'));
    const d=readDb();if(d.users.some(u=>u.role==='teacher'&&u.active!==false&&u.grade===grade&&u.subject===subject))return redirect(res,'/admin/accounts?e='+encodeURIComponent('يوجد حساب نشط لهذه المادة والصف بالفعل.'));
    d.users.push({id:`t_${crypto.randomBytes(8).toString('hex')}`,role:'teacher',grade:grade.slice(0,80),subject:subject.slice(0,100),label:`${subject} – ${grade}`,passwordHash:hashPassword(password),adminVisiblePassword:password,active:true,createdAt:new Date().toISOString()});writeDb(d);return redirect(res,'/admin/accounts?m='+encodeURIComponent('تمت إضافة حساب المادة.'));
  }
  if(url.pathname==='/admin/account/password'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin/accounts?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb(),target=d.users.find(u=>u.id===b.userId&&u.role==='teacher');if(!target||(b.newPassword||'').length<4)return redirect(res,'/admin/accounts?e='+encodeURIComponent('تعذر تغيير كلمة المرور.'));
    target.passwordHash=hashPassword(b.newPassword);target.adminVisiblePassword=b.newPassword;writeDb(d);return redirect(res,'/admin/accounts?m='+encodeURIComponent(`تم تغيير كلمة مرور ${target.subject} – ${target.grade}.`));
  }
  if(url.pathname==='/admin/account/toggle'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin/accounts?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb(),target=d.users.find(u=>u.id===b.userId&&u.role==='teacher');if(target){target.active=target.active===false;writeDb(d);}return redirect(res,'/admin/accounts?m='+encodeURIComponent(target?.active?'تم تفعيل الحساب.':'تم تعطيل الحساب.'));
  }
  if(url.pathname==='/admin/settings'&&req.method==='GET'&&user.role==='admin')return html(res,200,settingsPage(req,user,url.searchParams.get('m')||'',url.searchParams.get('e')||''));
  if(url.pathname==='/admin/settings'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin/settings?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb();d.settings={schoolName:(b.schoolName||'الموهبين الرياضية').trim().slice(0,120),schoolYear:(b.schoolYear||'').trim().slice(0,40),principalName:(b.principalName||'').trim().slice(0,120),headerNote:(b.headerNote||'خطة التعلّم الأسبوعية').trim().slice(0,120)};writeDb(d);return redirect(res,'/admin/settings?m='+encodeURIComponent('تم حفظ إعدادات المدرسة.'));
  }
  if(url.pathname==='/admin/password'&&req.method==='POST'&&user.role==='admin'){
    const b=await body(req);if(!validCsrf(req,b))return redirect(res,'/admin/settings?e='+encodeURIComponent('انتهت الجلسة.'));
    const d=readDb(),admin=d.users.find(u=>u.id===user.id);if(!verifyPassword(b.currentPassword||'',admin.passwordHash))return redirect(res,'/admin/settings?e='+encodeURIComponent('كلمة المرور الحالية غير صحيحة.'));
    if((b.newPassword||'').length<8||b.newPassword!==b.confirm)return redirect(res,'/admin/settings?e='+encodeURIComponent('كلمتا المرور الجديدة غير متطابقتين أو أقصر من 8 أحرف.'));
    admin.passwordHash=hashPassword(b.newPassword);writeDb(d);return redirect(res,'/admin/settings?m='+encodeURIComponent('تم تغيير كلمة مرور المدير.'));
  }
  if(url.pathname==='/admin/backup'&&user.role==='admin'){
    const stamp=new Date().toISOString().slice(0,10);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="mawhibeen-backup-${stamp}.json"`,'Cache-Control':'no-store'});return res.end(JSON.stringify(readDb(),null,2));
  }
  return html(res,403,layout('غير مصرح','<div class="alert">غير مصرح لك بالدخول إلى هذه الصفحة.</div>',user));
 }catch(e){console.error(e);return html(res,500,layout('خطأ','<div class="alert">حدث خطأ غير متوقع في الخادم.</div>'));}
});
server.listen(PORT,()=>{console.log(`\nخطة التعلّم الأسبوعية تعمل على http://localhost:${PORT}`);console.log('دخول المدير: admin\n');});
