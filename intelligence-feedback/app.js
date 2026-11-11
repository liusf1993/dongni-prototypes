/* 探索问题：嵌入阅卷、集中比较、分步校准，哪种更自然？
 * ?variant=A/B/C 三种布局共享内存状态；全部内容虚构，无业务请求。
 */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const dialog = document.getElementById('workspace-dialog');
  const variants = ['A', 'B', 'C'];
  const variantNames = { A: '边审边教', B: '案例共创', C: '分步校准' };
  const ruleText = '人物形象概括允许同义表达。结合文本写出“把乡亲的事放在自己前面”“主动帮助他人”等意思，可计入“乐于助人”得分点；仅罗列事件、没有概括或解释人物特点，仍不计入该得分点。';
  const materials = '暴雨冲断了进村的路。老陈把自家的农活放到一边，挨户确认独居老人的情况，又主动帮邻居转运粮食。有人劝他歇一歇，他说：“还有两户没去，得先看看。”直到天黑，他才拖着沾满泥的鞋回家。';
  let toastTimer;
  let dialogOpener;

  // 区分原始分数、当前分数、适用规则和核对状态。
  function createState() {
    const rows = [
      ['A-018-01',4,'equivalent','他做事有担当，雨里还逐户查看老人；<mark>他把乡亲们的事放在自己前面</mark>，主动帮忙转运粮食；也很坚持，没有看完最后两户就不肯休息。','完整表达三个特点，但没有直接写“乐于助人”。',6],
      ['A-018-02',6,'standard','老陈有责任心，冒雨逐户确认老人安全；乐于助人，主动帮邻居转运粮食；做事坚持，走完最后两户才回家。','三个特点及其文本依据均完整。',6],
      ['A-018-03',2,'boundary','老陈有责任心，暴雨里还逐户查看老人。<span class="missing">之后又帮邻居搬粮食，一直到晚上才回家。</span>','责任心得 2 分；其他内容仅复述事件，未概括人物特点。',2],
      ['A-018-04',2,'equivalent','他很有责任心，逐户确认老人安全；<mark>看见别人有困难就主动搭把手</mark>，还帮助转运粮食。','两个有效特点，第二个采用同义表达。',4],
      ['A-018-05',4,'standard','他有责任心，冒雨查看独居老人；很坚持，别人劝他休息，他还是把最后两户看完。','两个特点及对应依据清楚。',4],
      ['A-018-06',2,'recognition','老陈<mark>有责任心</mark>，冒雨去看独居老人；他乐于助人，主动帮邻居转运粮食。','识别文本将“责任心”错读为“责任小”，需要人工核对。',4],
      ['A-018-07',4,'equivalent','老陈有担当，先确认老人安全；<mark>他总是先替别人着想</mark>，主动帮邻居抢运粮食；做事坚持，走完最后两户才回家。','三个特点，包含同义表达。',6],
      ['A-018-08',0,'boundary','老陈是个很厉害的人，他什么都会，大家都喜欢他。','没有与文本相对应的分析依据。',0],
      ['A-018-09',6,'standard','有责任心：冒雨逐户查看；乐于助人：帮邻居抢运粮食；坚持负责：不看完最后两户不休息。','标准表达，得分依据完整。',6],
      ['A-018-10',2,'standard','老陈乐于助人，因为他主动帮邻居转运粮食。','一个特点及其依据完整。',2],
      ['A-018-11',4,'reason','他有责任心，在暴雨中去看老人；他乐于助人，主动帮邻居搬粮食。','分数正确，原评分理由却误写成“责任心＋坚持”。',4],
      ['A-018-12',4,'standard','老陈有责任心，先去确认独居老人安全；他很坚持，直到看完最后两户才回家。','两个得分点完整。',4]
    ];
    const initialVariant = new URLSearchParams(location.search).get('variant');
    return {
      variant:variants.indexOf(initialVariant)>=0?initialVariant:'A',
      view:'review',filter:'all',group:'all',classFilter:'all',page:1,flowStep:1,
      rubricVersion:'1.0',ruleRevision:0,ruleConfirmed:false,confirmedRule:'',draftCreated:false,draft:ruleText,blindCalibration:false,
      calScores:{A:'',B:'',C:''},candidates:[],selectedIds:[],records:[],recheckCount:0,lastRecheckCount:0,
      detailId:null,detailScore:0,detailReason:'',detailNote:'',dialogType:null,
      samples:rows.map(function(r,i){return {id:r[0],initial:r[1],score:r[1],kind:r[2],answer:r[3],description:r[4],expected:r[5],status:'pending',reason:'',note:'',className:i%2===0?'1':'2'};})
    };
  }
  let state = createState();

  // 编辑文字按输出上下文转义；答卷标注只来自固定演示文本。
  function esc(value) {
    return String(value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
  }

  // 全部操作使用同一套描边图标。
  function icon(name) {
    const paths = {
      book:'<path d="M4 4h7c2 0 3 1 3 2v14c0-2-2-3-4-3H4z"/><path d="M14 6c0-1 1-2 3-2h3v13h-3c-2 0-3 1-3 3"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
      left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',
      close:'<path d="m6 6 12 12M6 18 18 6"/>',
      chat:'<path d="M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1Z"/><path d="M8 9h8M8 13h5"/>',
      eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      scope:'<path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
      file:'<path d="M5 3h10l4 4v14H5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',
      download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
    };
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.file)+'</svg>';
  }

  // 按钮只触发原型内存操作。
  function btn(label,action,extra,kind,iconName) {
    return '<button class="btn '+(kind||'')+'" data-action="'+action+'" '+(extra||'')+'>'+(iconName?icon(iconName):'')+label+'</button>';
  }

  // 显示审核与修正状态，避免将未操作认作确认。
  function statusTag(s) {
    if(s.status==='reviewed')return '<span class="tag green">'+icon('check')+(s.score!==s.initial?'已修正':'已核对')+'</span>';
    if(s.status==='doubt')return '<span class="tag amber">存疑</span>';
    return '<span class="tag">待审核</span>';
  }

  // 筛选、计数及分页从同一状态计算，避免布局之间状态脱节。
  function filteredSamples() {
    return state.samples.filter(function(s){
      return (state.filter==='all'||(state.filter==='pending'&&s.status==='pending')||(state.filter==='reviewed'&&s.status==='reviewed')||(state.filter==='doubt'&&s.status==='doubt')) &&
        (state.group==='all'||String(s.score)===state.group)&&(state.classFilter==='all'||s.className===state.classFilter);
    });
  }
  // 汇总当前明确标记为已审核的作答。
  function reviewedCount(){return state.samples.filter(function(s){return s.status==='reviewed';}).length;}

  // 只记录明确的反馈事件；无操作不会记为已核对。
  function addRecord(title,description,kind) {
    state.records.unshift({title:title,description:description,kind:kind||'feedback',time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
  }

  // 保留既有阅卷外壳，将原型工具与产品内容分开。
  function shell(content) {
    return '<header class="global-header"><div class="brand"><span class="brand-mark">'+icon('book')+'</span>懂你<span class="brand-sub">精准教学</span></div><div class="row"><span class="demo-label"><span class="demo-dot"></span>交互探索原型<span class="demo-text"> · 全部数据为虚构演示</span></span><span class="avatar" aria-label="演示老师">师</span></div></header>'+
      '<div class="page"><nav class="breadcrumb" aria-label="面包屑">考试管理'+icon('right')+'高二语文期中质量检测'+icon('right')+'<span>智能批改</span></nav>'+
      '<section class="exam-header"><div class="exam-title"><div class="exam-symbol">'+icon('file')+'</div><div><h1>智能批改</h1><p>高二语文 · 期中质量检测 · 阅读理解</p></div></div>'+btn('本题评分标准','reference','','','book')+'</section>'+
      '<section class="filters" aria-label="批改条件"><div class="filter-line"><label class="filter-label" for="class-filter">班级</label><select id="class-filter" class="class-select" data-field="class">'+[['all','全部班级'],['1','高二（1）班'],['2','高二（2）班']].map(function(c){return '<option value="'+c[0]+'" '+(state.classFilter===c[0]?'selected':'')+'>'+c[1]+'</option>';}).join('')+'</select><span class="filter-label" style="margin-left:12px">题号</span><button class="question" disabled title="原型仅演示第18题">17</button><button class="question active" aria-current="true">18</button><button class="question" disabled title="原型仅演示第18题">19</button><span class="muted small">解答题 · 6 分</span></div><div class="row filter-right"><span class="tag green">'+icon('check')+'批改完成 · 12 份</span><span class="small muted">评分标准 v'+state.rubricVersion+'</span></div></section>'+
      (state.variant==='C'?'':tabs())+'<main id="main" tabindex="-1">'+content+'</main><footer class="footer-note"><span>探索原型 · 操作仅在本次浏览中保留，刷新可重新体验。判分与规则验证均为模拟。</span><a href="https://github.com/liusf1993/dongni-prototypes/tree/main/intelligence-feedback" target="_blank" rel="noreferrer">查看原型说明与源码</a></footer></div>'+dock();
  }
  // 在审核、规则档案和反馈记录之间导航。
  function tabs() {
    return '<nav class="work-tabs" aria-label="工作区">'+[['review','批改审核',12-reviewedCount()],['standards','评分标准',state.ruleConfirmed?2:1],['feedback','反馈记录',state.records.length]].map(function(t){return '<button class="tab '+(state.view===t[0]?'active':'')+'" data-action="view" data-value="'+t[0]+'" aria-current="'+(state.view===t[0]?'page':'false')+'">'+t[1]+'<span class="count">'+t[2]+'</span></button>';}).join('')+'<span class="tab-caption">一次纠正，帮助下一份作答</span></nav>';
  }
  // 提供可分享的布局比较入口及共享进度。
  function dock() {
    return '<nav class="prototype-dock" aria-label="原型布局切换"><span class="dock-title">布局比较</span><button class="icon-btn" data-action="variant-prev" aria-label="上一个布局">'+icon('left')+'</button>'+variants.map(function(v){return '<button class="variant-btn '+(state.variant===v?'active':'')+'" data-action="variant" data-value="'+v+'" aria-pressed="'+(state.variant===v)+'">'+v+' · '+variantNames[v]+'</button>';}).join('')+'<button class="icon-btn" data-action="variant-next" aria-label="下一个布局">'+icon('right')+'</button><span class="dock-state">共享进度 <strong>'+reviewedCount()+'/12 已审 · v'+state.rubricVersion+'</strong></span><button class="dock-reset" data-action="reset">重置演示</button></nav>';
  }
  // 按需展开参考材料，保持阅卷页面紧凑。
  function reference() {
    return '<details class="reference"><summary><strong>18. 结合材料，概括老陈的人物形象并简要分析。</strong>参考答案与材料</summary><p>'+materials+'</p><p class="rubric-line"><strong>参考标准：</strong>有责任心、乐于助人、做事坚持。每个特点及其依据各计 2 分，满分 6 分。</p></details>';
  }
  // 按规则是否确认，给出当前可执行的下一步。
  function promptStrip() {
    if(state.ruleConfirmed)return '<div class="prompt-strip"><span class="prompt-symbol">'+icon('check')+'</span><div class="grow"><strong>“同义表达”规则已用于本题</strong><p>已按您确认的范围复查 '+state.recheckCount+' 份作答，仍可逐份核对结果。</p></div>'+btn('查看规则与记录','view','data-value="standards"','soft')+'</div>';
    return '<div class="prompt-strip"><span class="prompt-symbol">'+icon('chat')+'</span><div class="grow"><strong>有一类表达，想请您定个标准</strong><p>没有写“乐于助人”，但意思完整，应该给分吗？</p></div>'+btn(state.draftCreated?'查看规则草稿':'用 3 份样卷确认','calibrate','','soft','arrow')+'</div>';
  }
  // 显示与切换审核状态，计数来自共享状态。
  function reviewToolbar() {
    const counts={all:12,pending:state.samples.filter(function(s){return s.status==='pending';}).length,reviewed:reviewedCount(),doubt:state.samples.filter(function(s){return s.status==='doubt';}).length};
    return '<div class="review-toolbar"><div class="segmented" aria-label="审核状态">'+[['all','全部'],['pending','待审'],['doubt','存疑'],['reviewed','已审']].map(function(t){return '<button class="'+(state.filter===t[0]?'active':'')+'" data-action="filter" data-value="'+t[0]+'" aria-pressed="'+(state.filter===t[0])+'">'+t[1]+' '+counts[t[0]]+'</button>';}).join('')+'</div><span class="review-count">已核对 <strong>'+reviewedCount()+'</strong> / 12 份</span></div>';
  }
  // 按当前得分分组，改分后同步更新数量。
  function scoreNavigation() {
    return '<aside class="score-nav" aria-label="分数分组"><h3>按得分查看</h3>'+['all','6','4','2','0'].map(function(score){
      const count=state.samples.filter(function(s){return score==='all'||s.score===Number(score);}).length;
      return '<button class="score-group '+(state.group===score?'active':'')+'" data-action="group" data-value="'+score+'" aria-pressed="'+(state.group===score)+'"><span>'+(score==='all'?'全部作答':score+' 分')+'</span><small>'+count+' 份</small></button>';
    }).join('')+'<p class="nav-note">审核状态与评分分开记录。<br>没有改分，不代表已经核对。</p></aside>';
  }
  // 呈现模拟作答、原分与当前分，保留逐份核对入口。
  function answerCard(s) {
    return '<article class="answer-card"><div class="answer-top"><span>作答 '+s.id+'</span>'+statusTag(s)+'</div><div class="answer-paper">'+s.answer+'</div><div class="answer-bottom"><div>'+(s.score!==s.initial?'<span class="old-score">'+s.initial+'</span>':'')+'<span class="score">'+s.score+'<small> / 6 分</small></span></div><div class="answer-actions">'+btn('核对','review','data-id="'+s.id+'"','','eye')+btn('存疑','doubt','data-id="'+s.id+'"','text')+'</div></div>'+(s.reason?'<div class="answer-feedback">'+icon('check')+' '+esc(s.reason)+'</div>':'')+'</article>';
  }
  // 控制当前筛选的分页与空态，支持网格及表格展示。
  function answerList(asTable) {
    const list=filteredSamples(),pages=Math.max(1,Math.ceil(list.length/6));
    state.page=Math.min(state.page,pages);
    const visible=list.slice((state.page-1)*6,state.page*6);
    let result;
    if(!list.length)result='<div class="empty"><h3>当前条件下没有作答</h3><p>可切换审核状态，或清除分数与班级筛选。</p>'+btn('查看全部作答','clear-filters','','soft')+'</div>';
    else if(asTable)result='<div class="surface table-wrap"><table class="record-table"><thead><tr><th>作答</th><th>关键表达</th><th>当前得分</th><th>状态</th><th>操作</th></tr></thead><tbody>'+visible.map(function(s){return '<tr><td>'+s.id+'</td><td>'+s.answer+'</td><td><strong>'+s.score+' / 6</strong></td><td>'+statusTag(s)+'</td><td>'+btn('核对','review','data-id="'+s.id+'"','compact')+'</td></tr>';}).join('')+'</tbody></table></div>';
    else result='<div class="answers-grid">'+visible.map(answerCard).join('')+'</div>';
    return result+'<div class="pagination"><span>共 '+list.length+' 份作答 · 每页 6 份</span><div class="row">'+btn('上一页','page-prev',state.page===1?'disabled':'','compact')+'<span class="page-index">'+state.page+' / '+pages+'</span>'+btn('下一页','page-next',state.page===pages?'disabled':'','compact')+'</div></div>';
  }
  // 把待请教的问题与规则去向嵌入日常审核。
  function feedbackAside() {
    return '<aside class="feedback-aside"><div class="aside-title"><h3 class="row">'+icon('chat')+'标准共创</h3><span class="tag '+(state.ruleConfirmed?'green':'amber')+'">'+(state.ruleConfirmed?'已确认':'待请教 1')+'</span></div>'+
      (state.ruleConfirmed?'<div class="aside-body"><span class="tag green">'+icon('check')+'仅本次考试 · 第 18 题</span><h2 class="aside-question">您的判断，已成为本题的评分依据</h2><p>同义表达可以给分，只有事件复述仍不给分。规则与使用范围均可查看。</p>'+btn('核对复查结果','view','data-value="feedback"','primary','arrow')+'</div>':'<div class="aside-body"><span class="tag amber">同义表达 · 3 份候选作答</span><h2 class="aside-question">意思答到了，<br>一定要出现关键词吗？</h2><p>这几份作答都涉及“乐于助人”，表达方式不同。想借助您的判断，明确给分边界。</p>'+btn('一起看样卷','calibrate','','primary','arrow')+'</div><div class="aside-meta"><p>先用给分与不给分的例子确认边界，再查看影响范围。您可以暂不决定。</p></div>')+
      '<div class="aside-rule"><div class="between"><h4>本题评分依据</h4><span class="small muted">v'+state.rubricVersion+'</span></div><p>参考答案 '+(state.ruleConfirmed?'＋ 1 条已确认规则':'· 同义表达规则待澄清')+'</p>'+btn('查看评分档案','view','data-value="standards"','text','book')+'</div><div class="aside-rule"><h4>最近的反馈</h4>'+(state.records.length?state.records.slice(0,2).map(function(r){return '<div class="activity-entry"><span class="activity-dot"></span><div>'+esc(r.title)+'<time>'+r.time+' · '+esc(r.kind==='rule'?'已用于本题':'已记录')+'</time></div></div>';}).join(''):'<p>您的确认、改分和补充依据，会在这里留下记录。</p>')+'</div><div class="aside-footer">'+btn('查看全部反馈','view','data-value="feedback"','text')+'</div></aside>';
  }
  // 方案 A 保留作答网格，以右栏承接轻量标准共创。
  function VariantA() {
    return '<div class="workbench">'+scoreNavigation()+'<section class="review-area" aria-label="作答审核">'+reviewToolbar()+reference()+promptStrip()+answerList(false)+'</section>'+feedbackAside()+'</div>';
  }

  // 正例、反例及部分给分例共同解释规则，校准评分独立于当前作答评分。
  function calibrationContent(inDialog) {
    const prefix=inDialog?'dialog-':'';
    const cases=[
      {key:'A',title:'意思完整，换了一种说法',id:'A-018-01',hint:'未出现关键词，但是否已经表达了人物特点？'},
      {key:'B',title:'一个特点明确，其余仅复述',id:'A-018-03',hint:'责任心得 2 分。搬粮食仅复述事件，是否还应算第二个特点？'},
      {key:'C',title:'表达成立，但只有两个特点',id:'A-018-04',hint:'认可同义表达，也仍然需要按有效得分点计分。'}
    ];
    return '<div class="comparison-grid">'+cases.map(function(c){
      const s=state.samples.find(function(x){return x.id===c.id;});
      return '<section class="sample-column"><div class="sample-label"><strong>样卷 '+c.key+'</strong><span class="tag">'+(state.blindCalibration?'先独立判断':'系统初判 '+s.initial+' 分')+'</span></div><h4 style="margin-top:10px">'+c.title+'</h4><div class="answer-paper">'+s.answer+'</div><p>'+c.hint+'</p><label class="field-label" for="'+prefix+'cal-'+c.key+'">您认为应得</label><select id="'+prefix+'cal-'+c.key+'" class="select-score" data-cal="'+c.key+'"><option value="">请选择分数</option>'+[0,1,2,3,4,5,6].map(function(n){return '<option value="'+n+'" '+(state.calScores[c.key]===String(n)?'selected':'')+'>'+n+' 分</option>';}).join('')+'</select></section>';
    }).join('')+'</div><div class="rule-editor"><div class="between"><h3>把您的判断整理成一条规则</h3><span class="tag">规则草稿 · 尚未生效</span></div><label class="field-label" for="'+prefix+'rule-draft">本题补充给分规则</label><textarea id="'+prefix+'rule-draft" data-field="draft" rows="3" maxlength="800">'+esc(state.draft)+'</textarea><div class="scope-note">'+icon('scope')+'适用范围：仅本次考试 · 语文第 18 题；其他题目保持各自标准。</div><div data-cal-error class="field-error" role="alert"></div></div>';
  }
  // 方案 B 集中比较案例，并区分识别和判分问题。
  function VariantB() {
    return '<div class="studio"><aside class="issue-list" aria-label="需要澄清的案例"><h3>从具体分歧开始</h3><button class="issue-button active" data-action="focus-calibration"><span class="tag amber">评分边界</span><strong>同义表达是否应计分？</strong><p>比较 3 种作答，帮助更多相似情况。</p></button><button class="issue-button" data-action="review" data-id="A-018-06"><span class="tag">识别核对</span><strong>“责任心”有没有被读对？</strong><p>先核对原作答，再判断得分。</p></button><button class="issue-button" data-action="review" data-id="A-018-11"><span class="tag">理由核对</span><strong>分数对了，依据也对吗？</strong><p>补充正确得分点，保留原分数。</p></button><p class="issue-bottom">每个分歧有不同的处理方式。已确认的标准在三种布局中共享。</p></aside><section class="surface studio-content"><div class="studio-heading"><div class="between"><h2>用三个例子，定清一条标准</h2><span class="tag '+(state.ruleConfirmed?'green':'amber')+'">'+(state.ruleConfirmed?'已有确认记录':'等待您的判断')+'</span></div><p>本题考查人物形象的概括与分析。请比较下面的表达，给出您认可的分数。系统据此整理规则，再由您决定是否应用。</p></div>'+reference()+calibrationContent()+'<div class="editor-footer"><p>样卷用于共同澄清规则，后续另留新样本检查边界。</p><div class="row">'+btn('暂不确定','defer','','text')+btn('预览规则影响','preview','','primary','arrow')+'</div></div></section></div>';
  }
  // 展示每个得分点及其文本依据。
  function criteria() {
    return '<div class="criteria">'+[['有责任心','冒雨逐户确认独居老人的安全。'],['乐于助人','主动帮助邻居转运粮食。'],['做事坚持','不看完最后两户不休息。']].map(function(c){return '<div class="criterion"><span class="points">2 分</span><div><strong>'+c[0]+'</strong><p>'+c[1]+'</p></div></div>';}).join('')+'</div>';
  }
  // 先说明考查目标，允许隐藏系统初判再校准。
  function setupContent() {
    return '<section class="surface"><div class="setup-layout"><div><h2>先对齐，这道题在考什么</h2><p class="muted">概括老陈的人物形象，并结合文本分析。参考标准包含三个得分点，每点 2 分。</p>'+criteria()+'<p class="small muted">可以先沿用参考标准。遇到表达边界，再通过样卷共同澄清。</p></div><div class="setup-side"><h3>有一个边界需要您确认</h3><p>学生换一种说法，没有写出标准中的关键词，但意思已经表达完整。</p><label class="choice-row"><input type="radio" name="setup" value="meaning" '+(!state.blindCalibration?'checked':'')+'>允许同义表达，按意思判断</label><label class="choice-row"><input type="radio" name="setup" value="examples" '+(state.blindCalibration?'checked':'')+'>先隐藏系统初判，独立判断样卷</label><div class="scope-note">'+icon('scope')+'本次考试 · 第 18 题</div><p class="small muted">下一步会同时展示给分、不给分与部分给分的例子，确认您的要求是否被准确理解。</p></div></div><div class="flow-footer"><p>参考标准 v'+state.rubricVersion+' · 您可以随时返回调整</p>'+btn('用样卷校准','flow','data-step="2"','primary','arrow')+'</div></section>';
  }
  // 方案 C 通过顺序步骤串起定标与反馈。
  function VariantC() {
    const steps=[['确认标准','考查目标与得分点'],['样卷校准','明确表达边界'],['审核作答','纠正与复查'],['反馈回看','查看规则的去向']];
    let content;
    if(state.flowStep===1)content=setupContent();
    else if(state.flowStep===2)content='<section class="surface studio-content"><div class="studio-heading"><h2>这样的表达，您会给几分？</h2><p>比较正例与边界例，让同义表达规则既能覆盖有效作答，也能保留不给分的边界。</p></div>'+calibrationContent()+'<div class="editor-footer">'+btn('返回确认标准','flow','data-step="1"','text')+'<div class="row">'+btn('稍后再定，先审核','flow','data-step="3"','text')+btn('预览规则影响','preview','','primary','arrow')+'</div></div></section>';
    else if(state.flowStep===3)content='<section>'+promptStrip()+reviewToolbar()+answerList(true)+'<div class="flow-footer">'+btn('返回校准','flow','data-step="2"','text')+btn('查看反馈回看','flow','data-step="4"','primary','arrow')+'</div></section>';
    else content=feedbackContent();
    return '<nav class="flow-header" aria-label="校准与审核流程">'+steps.map(function(s,i){return '<button class="flow-step '+(state.flowStep===i+1?'active':'')+'" data-action="flow" data-step="'+(i+1)+'" aria-current="'+(state.flowStep===i+1?'step':'false')+'"><span class="step-num">'+(i+1)+'</span><span><strong>'+s[0]+'</strong><small>'+s[1]+'</small></span></button>';}).join('')+'</nav><div class="flow-content">'+content+'</div>';
  }
  // 已确认规则读取不可变快照，编辑草稿不污染生效标准。
  function standardsContent() {
    return '<div class="records-layout"><section class="surface rules-content"><div class="between"><div><h2>本题评分档案</h2><p class="muted small" style="margin-top:5px">保留标准、样例与判分边界，供本题共同使用。</p></div><span class="tag green">v'+state.rubricVersion+'</span></div><article class="rule-row"><span class="tag">参考标准</span><h3>人物特点与文本依据分别对应</h3><p>有责任心、乐于助人、做事坚持。每个特点及其文本依据计 2 分，总计 6 分。不同得分点独立计分。</p>'+criteria()+'<p class="meta">来源：演示参考答案 · 适用：第 18 题</p></article><article class="rule-row"><span class="tag '+(state.ruleConfirmed?'green':'amber')+'">'+(state.ruleConfirmed?'老师已确认 · 已用于本题':'待澄清 · 尚未生效')+'</span><h3>允许同义表达，保留概括与分析的要求</h3><p>'+esc(state.ruleConfirmed?state.confirmedRule:state.draft)+'</p><p class="meta">'+(state.ruleConfirmed?'来源：三份样卷校准 · 已按选择范围复查 '+state.recheckCount+' 份':'来源：候选作答中的表达差异 · 需要老师确认')+' · 仅本次考试</p><div class="row">'+btn(state.ruleConfirmed?'查看校准样卷':'比较样卷并确认','calibrate','','soft')+btn('查看使用记录','view','data-value="feedback"','text')+'</div></article></section>'+feedbackAside()+'</div>';
  }
  // 把已记录与已应用区分，效果数字只表示处理进度。
  function feedbackContent() {
    const events=state.records.map(function(r){return '<tr><td>'+r.time+'</td><td><strong>'+esc(r.title)+'</strong><p>'+esc(r.description)+'</p></td><td><span class="tag '+(r.kind==='rule'?'green':'')+'">'+(r.kind==='rule'?'已用于本题':r.kind==='defer'?'待确认':'已记录')+'</span></td></tr>';}).join('');
    return '<section><div class="report-result"><div class="between"><h2>'+(state.ruleConfirmed?'这次确认，已经帮助本题继续批改':'每一条反馈，都有明确的去向')+'</h2><span class="tag green">本次演示</span></div><p style="margin-top:8px">'+(state.ruleConfirmed?'您确认了“同义表达”的给分边界，并选择了需要重新核对的作答。其他题目的标准保持各自独立。':'核对一份作答，或共同澄清一条评分规则，系统会记录依据、适用范围与处理结果。')+'</p><div class="impact-summary"><div><strong>'+reviewedCount()+'</strong><span>份明确核对</span></div><div><strong>'+(state.ruleConfirmed?1:0)+'</strong><span>条确认规则</span></div><div><strong>'+state.recheckCount+'</strong><span>份规则复查</span></div></div><p class="small muted">这些数字表示处理进度。整体评分是否改善，需要使用独立抽检样本验证。</p>'+btn('返回作答审核','return-review','','soft','arrow')+' '+btn('导出反馈记录','export','','text','download')+'</div><section class="surface"><div class="section-head"><div><h3>反馈与使用记录</h3><p>区分已经记录、等待确认和已经实际使用的反馈。</p></div><span class="small muted">'+state.records.length+' 条记录</span></div>'+(state.records.length?'<div class="table-wrap"><table class="record-table"><thead><tr><th style="width:90px">时间</th><th>反馈及处理结果</th><th style="width:115px">当前状态</th></tr></thead><tbody>'+events+'</tbody></table></div>':'<div class="empty" style="margin:0 22px 22px"><h3>还没有反馈记录</h3><p>先核对一份作答，或比较三份样卷，体验反馈如何进入评分流程。</p>'+btn('从样卷开始','calibrate','','primary')+'</div>')+'<p class="report-note">本原型中的规则复查与新样本检查均为预设模拟。不会修改真实分数，也不代表已完成模型训练或实际效果验证。</p></section></section>';
  }

  // 切换结构不清空共享审核进度、规则版本和记录。
  function render() {
    let content;
    if(state.variant==='C')content=VariantC();
    else if(state.view==='standards')content=standardsContent();
    else if(state.view==='feedback')content=feedbackContent();
    else content=state.variant==='A'?VariantA():VariantB();
    app.innerHTML=shell(content);
  }
  // 反馈操作结果，短时提示不阻断阅卷。
  function showToast(message) {
    clearTimeout(toastTimer);
    const node=document.getElementById('toast');
    node.textContent=message;node.classList.add('show');
    toastTimer=setTimeout(function(){node.classList.remove('show');},3500);
  }
  // 统一受保护任务的标题、滚动正文和独立底部动作。
  function dialogFrame(title,subtitle,body,footer) {
    return '<div class="dialog-header"><div><h2 id="dialog-title">'+title+'</h2><p>'+subtitle+'</p></div><button class="icon-btn" data-action="close-dialog" aria-label="关闭对话框">'+icon('close')+'</button></div><div class="dialog-scroll">'+body+'</div><div class="dialog-footer">'+footer+'</div>';
  }

  // 比较任务由原生弹窗管理焦点，正文单独滚动且不遮挡底部动作。
  function openDialog(type) {
    dialogOpener=document.activeElement;state.dialogType=type;renderDialog();
    if(!dialog.open)dialog.showModal();
  }
  // 同步草稿显示并将焦点交还给原工作区。
  function closeDialog() {
    const action=dialogOpener&&dialogOpener.dataset?dialogOpener.dataset.action:null;
    const id=dialogOpener&&dialogOpener.dataset?dialogOpener.dataset.id:null;
    dialog.close();state.dialogType=null;render();
    const returnTarget=action?app.querySelector('[data-action="'+action+'"]'+(id?'[data-id="'+id+'"]':'')):null;
    if(returnTarget)returnTarget.focus();else document.getElementById('main').focus();
  }
  // 核对面板的评分依据与当前样例对应，避免所有作答显示同一套理由。
  function scoringEvidence(s){
    if(s.status==='reviewed')return '当前得分 '+s.score+' 分，已记录依据：'+(s.reason||'老师明确核对')+'。';
    if(s.kind==='recognition')return '识别文字：“老陈有责任小，冒雨去看独居老人……”';
    if(s.kind==='reason')return '当前评分理由：“责任心、坚持各 2 分。”需要核对是否与实际作答一致。';
    if(s.kind==='equivalent')return '当前评分依据：'+(s.initial===2?'责任心计 2 分':'责任心、坚持各计 2 分')+'；未使用“乐于助人”原词，该点未计分。';
    if(s.kind==='boundary')return s.initial===2?'当前评分依据：责任心与依据完整计 2 分；其他内容仅复述事件。':'当前评分依据：未找到有文本依据的人物特点。';
    return '当前评分依据：'+s.description+' 得 '+s.score+' 分。';
  }
  // 根据当前任务呈现校准、核对、影响预览或处理结果。
  function renderDialog() {
    let body,footer,title,subtitle;
    if(state.dialogType==='calibration'){
      title='用样卷，共同确认判分边界';subtitle='语文第 18 题 · 样卷和分数均为虚构演示';
      body=calibrationContent(true);
      footer='<p>先给三份样卷评分，再检查规则影响。</p><div class="row">'+btn('暂不确定','defer','','text')+btn('预览规则影响','preview','','primary','arrow')+'</div>';
    }else if(state.dialogType==='review'){
      const s=state.samples.find(function(x){return x.id===state.detailId;});
      title='核对作答 '+s.id;subtitle='系统初判 '+s.initial+' 分 · 当前 '+s.score+' 分 · 满分 6 分';
      const evidence=scoringEvidence(s);
      body='<div class="review-detail"><section><h3>学生作答 <span class="small muted">模拟文字</span></h3><div class="answer-paper">'+s.answer+'</div><h4>核对线索</h4><p class="muted small" style="margin-top:9px">'+esc(s.description)+'</p><p class="small" style="margin-top:12px">'+evidence+'</p>'+criteria()+'</section><section><h3>您的判断</h3><label class="field-label" for="detail-score">本份作答应得</label><div class="score-input-wrap"><input id="detail-score" class="score-input" type="number" min="0" max="6" step="1" value="'+state.detailScore+'" data-field="detail-score"><span class="muted">/ 6 分</span></div><p class="field-label">补充原因 <span class="optional">（可选）</span></p><div class="reason-options">'+['同义表达未计分','漏算得分点','识别有误','分数正确，理由需修正','核对无误'].map(function(r){return '<button class="reason-option '+(state.detailReason===r?'active':'')+'" data-action="reason" data-value="'+r+'">'+r+'</button>';}).join('')+'</div><label class="field-label" for="detail-note">补充一句判分依据 <span class="optional">（可选）</span></label><textarea id="detail-note" class="text-input" data-field="detail-note" rows="3" maxlength="500" placeholder="例如：这句话已经体现了乐于助人，应计入该得分点。">'+esc(state.detailNote)+'</textarea><p class="small muted" style="margin-top:12px">只改分也可以保存。补充原因后，系统才能更准确地区分评分、识别或标准问题。</p><div id="review-error" class="field-error" role="alert"></div></section></div>';
      footer='<p>保存本份判断后，再决定是否整理为共同规则。</p><div class="row">'+btn('取消','close-dialog','','text')+btn('保存本份判断','save-review','','primary','check')+'</div>';
    }else if(state.dialogType==='preview'){
      title='确认前，先看规则会影响什么';subtitle='本次仅模拟“完整同义表达计分”的规则 · 仅本次考试第 18 题';
      const matching=state.calScores.A==='6'&&state.calScores.B==='2'&&state.calScores.C==='4';
      body='<div class="row between"><h3>待确认的规则</h3><span class="tag amber">尚未应用</span></div><p style="margin-top:12px;font-size:13px;line-height:1.9">'+esc(state.draft)+'</p>'+(!matching?'<div class="inline-note">您的样卷评分与这条规则的预期不一致。请先调整草稿或重新校准，再确认应用。</div>':'')+'<div class="impact-summary"><div><strong>'+state.candidates.length+'</strong><span>份评分可能变化</span></div><div><strong>2</strong><span>份新样本边界检查</span></div><div><strong>本题</strong><span>限定适用范围</span></div></div>'+
        (state.candidates.length?'<div class="table-wrap"><table class="record-table"><thead><tr><th class="check-cell"><input type="checkbox" aria-label="选择全部候选作答" data-field="select-all" '+(state.selectedIds.length===state.candidates.length?'checked':'')+'></th><th>候选作答</th><th>当前得分</th><th>拟调整</th><th>关联依据</th></tr></thead><tbody>'+state.candidates.map(function(c){return '<tr><td class="check-cell"><input type="checkbox" aria-label="选择 '+c.id+'" data-select="'+c.id+'" '+(state.selectedIds.indexOf(c.id)>=0?'checked':'')+'></td><td>'+c.id+'</td><td>'+c.from+' 分</td><td class="change-arrow">'+c.to+' 分</td><td>已表达人物特点，未使用原关键词</td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty"><h3>没有需要调整的候选作答</h3><p>相关作答已按这条规则评分，可保留规则用于本题后续核对。</p></div>')+
        '<div class="holdout"><h3>用两份新样本，再检查边界 <span class="tag">模拟检查</span></h3><p>新样本甲：“他先想着邻居，帮忙抢运粮食。” → 特点与依据完整，该得分点计 2 分。<br>新样本乙：“他搬了粮食，又去了两户人家。” → 仅复述事件，该得分点不计分。</p><p style="margin-top:8px">这两份样本未参与刚才的校准，用于演示验证过程；不代表已证明整体评分改善。</p></div><div class="scope-note">'+icon('scope')+'确认后创建标准 v1.'+(state.ruleRevision+1)+'；仅更新您勾选的候选作答。</div>';
      footer='<p id="selection-summary">已选择 '+state.selectedIds.length+' / '+state.candidates.length+' 份候选作答</p><div class="row">'+btn('返回校准','calibrate','','text')+btn(state.selectedIds.length?'确认规则并复查所选':'仅确认规则，暂不复查','apply-rule',matching?'':'disabled','primary','check')+'</div>';
    }else if(state.dialogType==='success'){
      title='规则已确认，处理结果已记录';subtitle='标准 v'+state.rubricVersion+' · 仅本次考试第 18 题';
      body='<div class="dialog-success"><div class="success-symbol">'+icon('check')+'</div><h2>这一次判断，可以继续帮助批改</h2><p>已保存同义表达规则，并复查您选择的 '+state.lastRecheckCount+' 份作答。您可以回到作答中逐份检查，也可以查看完整使用记录。</p><p>跨题复用与通用模型改进，需要后续独立验证。</p></div>';
      footer='<p>全部结果只在本次演示中生效。</p><div class="row">'+btn('继续审核','continue-review','','text')+btn('查看反馈记录','open-feedback','','primary','arrow')+'</div>';
    }else{
      title='第 18 题 · 参考材料与评分标准';subtitle='本题全部内容为独立编写的虚构演示';
      body='<h3>阅读材料</h3><p style="margin-top:12px;line-height:2">'+materials+'</p><h3 style="margin-top:24px">题目与评分依据</h3><p style="margin-top:10px">结合材料，概括老陈的人物形象并简要分析。（6 分）</p>'+criteria()+'<h3>补充规则</h3><p style="margin-top:10px;font-size:13px;line-height:1.9">'+(state.ruleConfirmed?esc(state.confirmedRule):'同义表达的给分边界尚待老师确认，可通过三份样卷共同澄清。')+'</p>';
      footer='<p>当前标准 v'+state.rubricVersion+'</p>'+btn('完成查看','close-dialog','','primary');
    }
    dialog.innerHTML=dialogFrame(title,subtitle,body,footer);
  }

  // 预览计算候选副本，确认前不修改分数。
  function previewRule(){
    if(!state.calScores.A||!state.calScores.B||!state.calScores.C){(dialog.open?dialog:app).querySelector('[data-cal-error]').textContent='请先为三份样卷选择分数，帮助系统理解您认可的边界。';return;}
    if(!state.draft.trim()){(dialog.open?dialog:app).querySelector('[data-cal-error]').textContent='规则草稿不能为空，请补充本题的给分要求。';return;}
    state.draftCreated=true;
    state.candidates=state.samples.filter(function(s){return s.kind==='equivalent'&&s.score!==s.expected;}).map(function(s){return {id:s.id,from:s.score,to:s.expected};});
    state.selectedIds=state.candidates.map(function(c){return c.id;});
    openDialog('preview');
  }
  // 规则及评分变更只在明确确认时应用于选择范围。
  function applyRule(){
    state.ruleConfirmed=true;state.confirmedRule=state.draft;state.ruleRevision+=1;state.rubricVersion='1.'+state.ruleRevision;
    let changed=0;
    state.candidates.forEach(function(c){
      if(state.selectedIds.indexOf(c.id)<0)return;
      const s=state.samples.find(function(x){return x.id===c.id;});
      s.score=c.to;s.status='reviewed';s.reason='依据已确认规则：同义表达计分';changed+=1;
    });
    state.recheckCount+=changed;state.lastRecheckCount=changed;
    addRecord('确认同义表达规则，并复查 '+changed+' 份','范围：本次考试第 18 题；选中作答按 v'+state.rubricVersion+' 处理。其他作答未自动改分。','rule');
    render();state.dialogType='success';renderDialog();
  }
  // 校验给分范围，只保存当前作答及可选依据。
  function saveReview(){
    const score=Number(state.detailScore);
    if(state.detailScore===''||!Number.isFinite(score)||Math.floor(score)!==score||score<0||score>6){document.getElementById('review-error').textContent='请输入 0 到 6 之间的整数分数。';return;}
    const s=state.samples.find(function(x){return x.id===state.detailId;}),before=s.score;
    s.score=score;s.status='reviewed';s.reason=state.detailReason;s.note=state.detailNote;
    addRecord(s.id+(before!==score?'：'+before+' → '+score+' 分':'：完成核对'),(state.detailReason||'未补充原因')+(state.detailNote?'；'+state.detailNote:'')+'。本次只保存该份作答。');
    if(state.detailReason==='同义表达未计分')state.draftCreated=true;
    closeDialog();render();showToast(state.draftCreated?'已保存本份判断；可在标准共创中查看规则草稿。':'已保存本份判断与反馈记录。');
  }
  // 切换布局入口但保留共享评分、规则和反馈。
  function setVariant(v){
    state.variant=v;state.view='review';const url=new URL(location.href);url.searchParams.set('variant',v);history.replaceState(null,'',url);render();
  }
  // 反馈导出为本地文件，不向服务器传送老师在演示中的输入。
  function exportFeedback(){
    const payload={prototype:true,variant:state.variant,version:state.rubricVersion,rule:state.ruleConfirmed?state.confirmedRule:null,samples:state.samples.map(function(s){return {id:s.id,initial:s.initial,current:s.score,status:s.status,reason:s.reason,note:s.note};}),records:state.records};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='intelligence-feedback-demo.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);showToast('已导出本次演示的反馈记录。');
  }

  // 三种结构使用同一事件与数据流。
  document.addEventListener('click',function(event){
    const button=event.target.closest('[data-action]');
    if(!button||button.disabled)return;
    const action=button.dataset.action,value=button.dataset.value;
    if(action==='variant')setVariant(value);
    else if(action==='variant-prev'||action==='variant-next')setVariant(variants[(variants.indexOf(state.variant)+(action==='variant-prev'?2:1))%3]);
    else if(action==='view'){state.view=value;if(state.variant==='C')state.flowStep=value==='feedback'?4:value==='standards'?1:3;render();}
    else if(action==='flow'){state.flowStep=Number(button.dataset.step);render();}
    else if(action==='filter'){state.filter=value;state.page=1;render();}
    else if(action==='group'){state.group=value;state.page=1;render();}
    else if(action==='clear-filters'){state.filter='all';state.group='all';state.classFilter='all';state.page=1;render();}
    else if(action==='page-next'){state.page+=1;render();}
    else if(action==='page-prev'){state.page=Math.max(1,state.page-1);render();}
    else if(action==='reference')openDialog('reference');
    else if(action==='calibrate')openDialog('calibration');
    else if(action==='focus-calibration'){const field=document.getElementById('cal-A');if(field)field.focus();}
    else if(action==='preview')previewRule();
    else if(action==='apply-rule')applyRule();
    else if(action==='close-dialog')closeDialog();
    else if(action==='review'){
      const s=state.samples.find(function(x){return x.id===button.dataset.id;});
      state.detailId=s.id;state.detailScore=s.score;state.detailReason=s.reason;state.detailNote=s.note;openDialog('review');
    }else if(action==='reason'){
      state.detailReason=value;dialog.querySelectorAll('.reason-option').forEach(function(node){node.classList.toggle('active',node.dataset.value===value);});
    }else if(action==='save-review')saveReview();
    else if(action==='doubt'){
      const s=state.samples.find(function(x){return x.id===button.dataset.id;});
      s.status='doubt';addRecord(s.id+'：标记存疑','保留当前分数 '+s.score+' 分，等待进一步判断。','defer');render();showToast('已标记存疑，当前分数保持不变。');
    }else if(action==='defer'){
      addRecord('同义表达规则：暂不确定','保留为待确认问题，评分标准与已有分数均未改变。','defer');if(dialog.open)closeDialog();render();showToast('已保留为待确认，您可以继续审核。');
    }else if(action==='continue-review'||action==='return-review'){
      if(dialog.open)closeDialog();state.view='review';if(state.variant==='C')state.flowStep=3;render();
    }else if(action==='open-feedback'){
      closeDialog();state.view='feedback';if(state.variant==='C')state.flowStep=4;render();
    }else if(action==='export')exportFeedback();
    else if(action==='reset'){
      const v=state.variant;state=createState();state.variant=v;if(dialog.open)closeDialog();render();showToast('演示已重置，三种布局从同一份初始数据开始。');
    }
  });
  // 输入写入独立草稿，切换理由与预览时不丢失。
  document.addEventListener('input',function(event){
    const field=event.target.dataset.field;
    if(field==='draft')state.draft=event.target.value;
    else if(field==='detail-score')state.detailScore=event.target.value;
    else if(field==='detail-note')state.detailNote=event.target.value;
  });
  document.addEventListener('change',function(event){
    const node=event.target;
    if(node.dataset.cal){state.calScores[node.dataset.cal]=node.value;const error=(dialog.open?dialog:app).querySelector('[data-cal-error]');if(error)error.textContent='';}
    else if(node.name==='setup'){state.blindCalibration=node.value==='examples';}
    else if(node.dataset.field==='class'){state.classFilter=node.value;state.page=1;render();}
    else if(node.dataset.select){
      if(node.checked&&state.selectedIds.indexOf(node.dataset.select)<0)state.selectedIds.push(node.dataset.select);
      else if(!node.checked)state.selectedIds=state.selectedIds.filter(function(id){return id!==node.dataset.select;});renderDialog();
    }else if(node.dataset.field==='select-all'){
      state.selectedIds=node.checked?state.candidates.map(function(c){return c.id;}):[];renderDialog();
    }
  });
  // 输入时不抢占方向键；其他场景可快速比较布局。
  document.addEventListener('keydown',function(event){
    if(dialog.open||event.target.closest('input,textarea,select,[contenteditable]')||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setVariant(variants[(variants.indexOf(state.variant)+(event.key==='ArrowLeft'?2:1))%3]);}
  });
  dialog.addEventListener('cancel',function(event){event.preventDefault();closeDialog();});
  render();
})();
