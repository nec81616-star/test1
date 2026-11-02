/* Teacher-edited fixed questions. Original question numbers are stable even
   when questions are removed; displayed options are shuffled by teacher-core. */
(function (root, factory) {
  const bank = factory();
  if (typeof module === 'object' && module.exports) module.exports = bank;
  else root.GAME_QUESTION_BANK = bank;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const questions = [
  {
    "id": "q01",
    "sourceNumber": 1,
    "category": "事故處置",
    "scope": "all",
    "prompt": "{{A}}與{{B}}發生碰撞，有人受傷倒地。此時最適當的第一個處置是什麼？",
    "options": [
      "確認現場安全並優先通報119救護、110報警",
      "交換聯絡方式、談妥賠償金額後即可離開",
      "在網路直播公布肇事現場畫面",
      "先把車子開去鄰近車廠修好"
    ],
    "correctIndex": 0,
    "explanation": "事故有傷者時應先確保安全、優先救護並報警；現場「放、撥、劃(拍)、移、等」。"
  },
  {
    "id": "q02",
    "sourceNumber": 2,
    "category": "事故處置",
    "scope": "all",
    "prompt": "{{A}}想為本次與{{B}}的碰撞保留客觀證據，哪種做法最有幫助？",
    "options": [
      "拍攝事故位置與車損，保存目擊者聯絡方式",
      "只記住車身顏色即可",
      "立刻向對方索取名片與聯絡方式",
      "對方口頭承諾即可"
    ],
    "correctIndex": 0,
    "explanation": "「劃(拍)」步驟建議拍照、標繪現場，並保留目擊者資訊。"
  },
  {
    "id": "q03",
    "sourceNumber": 3,
    "category": "事故處置",
    "scope": "all",
    "prompt": "{{A}}與{{B}}發生事故後需要保險理賠，哪個處理流程較完整？",
    "options": [
      "報警留存資料、通知保險公司、備妥文件後處理理賠",
      "只在聊天室投票決定責任",
      "不留任何事故證據直接申請賠車價",
      "事故發生後只需換新車牌"
    ],
    "correctIndex": 0,
    "explanation": "理賠流程包括報案、保險出險、調查、和解及理賠。"
  },
  {
    "id": "q04",
    "sourceNumber": 4,
    "category": "保障對象",
    "scope": "all",
    "prompt": "{{A}}與{{B}}發生碰撞，{{A}}也有部分過失。對於{{A}}依法請求強制險給付，何者正確？",
    "options": [
      "不能只因{{A}}有部分過失就逕認一定不得申請",
      "只要有1%過失就永遠不賠",
      "必須先由對方承認全部過失",
      "只能改申請車體損失險"
    ],
    "correctIndex": 0,
    "explanation": "強制險採無過失責任的基本保障制度；仍應依法定被害人資格及給付要件判斷。"
  },
  {
    "id": "q05",
    "sourceNumber": 5,
    "category": "保障對象",
    "scope": "all",
    "prompt": "{{A}}受傷後想申請本次與{{B}}事故的強制險給付，是否必須先得到{{B}}同意？",
    "options": [
      "不必先經加害人同意，可依法向保險人請求",
      "必須取得對方全家同意",
      "必須先更換汽車車牌",
      "必須先購買任意車體險"
    ],
    "correctIndex": 0,
    "explanation": "受害人享有直接請求權，請求權人無須先獲加害人同意或先和解。"
  },
  {
    "id": "q06",
    "sourceNumber": 6,
    "category": "保障範圍",
    "scope": "all",
    "prompt": "本次{{A}}與{{B}}事故產生就醫支出及汽車維修費。強制汽車責任保險主要保障哪一類？",
    "options": [
      "依法定條件給付人身傷害、失能或死亡",
      "全部汽車鈑金與烤漆",
      "被撞壞的交通標誌修復費",
      "手機和隨身財物一律全賠"
    ],
    "correctIndex": 0,
    "explanation": "法定規範包含傷害醫療、失能、死亡三類給付，不含純粹財物損害。"
  },
  {
    "id": "q07",
    "sourceNumber": 7,
    "category": "保障範圍",
    "scope": "all",
    "prompt": "{{A}}與{{B}}碰撞後，某受害人傷勢符合失能認定。下列說法何者正確？",
    "options": [
      "可依法定失能等級及標準申請失能給付",
      "只要住院就一定全額領200萬元",
      "失能給付只補汽車車損",
      "失能與傷害醫療是同一種車輛修理費"
    ],
    "correctIndex": 0,
    "explanation": "失能等級分級給付，不是所有傷者固定領取相同金額。"
  },
  {
    "id": "q08",
    "sourceNumber": 8,
    "category": "保險架構",
    "scope": "all",
    "prompt": "若{{A}}對{{B}}事故負賠償責任，且需賠償{{B}}的車損，哪類保險可依承保條件提供額度內保障？",
    "options": [
      "任意第三人責任險的財損保障",
      "強制險死亡給付",
      "{{A}}的竊盜損失險",
      "{{B}}的駕駛人傷害險"
    ],
    "correctIndex": 0,
    "explanation": "第三人責任險可以依被保險人法律責任及約定補償第三人財物損害。"
  },
  {
    "id": "q10",
    "sourceNumber": 10,
    "category": "風險管理",
    "scope": "all",
    "prompt": "{{A}}與{{B}}發生事故後，老師提醒全班：下雨天改搭大眾運輸，避免自行騎車的危險，屬於哪一種風險管理？",
    "options": [
      "風險規避",
      "風險自留",
      "風險移轉",
      "風險提高"
    ],
    "correctIndex": 0,
    "explanation": "雨季改搭大眾運輸，可避開自行騎車的交通事故風險，屬於風險規避。"
  },
  {
    "id": "q11",
    "sourceNumber": 11,
    "category": "風險管理",
    "scope": "all",
    "prompt": "為預防{{A}}與{{B}}這類事故，下次上路前檢查煞車、戴安全帽、保持距離，屬於哪種風險管理？",
    "options": [
      "風險降低",
      "風險提高",
      "風險自留",
      "風險規避"
    ],
    "correctIndex": 0,
    "explanation": "採取防範措施降低事故機率與損害，屬風險降低。"
  },
  {
    "id": "q12",
    "sourceNumber": 12,
    "category": "保險制度",
    "scope": "all",
    "prompt": "{{A}}與{{B}}事故後討論：為什麼汽機車車主依法須投保強制汽車責任保險？",
    "options": [
      "為使交通事故受害人迅速獲得基本人身保障",
      "為保證每個駕駛都不會發生車禍",
      "為讓每次事故所有財物損失都由政府支付",
      "為免除所有事故的民事責任"
    ],
    "correctIndex": 0,
    "explanation": "制度強調政策性保險的社會安全及保障受害人目的。"
  },
  {
    "id": "q13",
    "sourceNumber": 13,
    "category": "保障對象",
    "scope": "player",
    "prompt": "{{A}}與{{B}}兩位同學各自駕車相撞，{{A}}受傷。關於{{A}}能否申請強制險，哪項正確？",
    "options": [
      "只要{{A}}受傷了，便可以依法去向對方的保險公司申請理賠。",
      "駕駛人只要受傷就只能請求自己的車損保險",
      "兩車相撞時，所有人一律不得申請",
      "雖然{{A}}受傷了，但必須要經過{{B}}的同意才可以理賠"
    ],
    "correctIndex": 0,
    "explanation": "兩車事故的駕駛人與一車自撞駕駛人情況不同，須依法判斷受害人身分。"
  },
  {
    "id": "q14",
    "sourceNumber": 14,
    "category": "責任原則",
    "scope": "player",
    "prompt": "{{A}}與{{B}}互撞，假設雙方都有未注意車前狀況的過失。何種說法較符合強制險制度？",
    "options": [
      "只要有人受傷，不論過失比例，強制險都要賠。",
      "只有過失較少者能申請理賠",
      "過失較大的一方需要承擔所有賠償責任",
      "即使有人受傷，只要雙方都有過失，強制險一概不理賠"
    ],
    "correctIndex": 0,
    "explanation": "強制險採無過失責任，仍按法定受害人資格及項目請求。"
  },
  {
    "id": "q16",
    "sourceNumber": 16,
    "category": "保障對象",
    "scope": "player",
    "prompt": "{{A}}與{{B}}各駕一車相撞，{{A}}的乘客受傷。哪項判斷最適當？",
    "options": [
      "乘客可依事故與法定資格檢視強制險人身給付",
      "乘客不論何時都完全沒有保障",
      "乘客只能要求支付車體烤漆",
      "必須先買車體竊盜險"
    ],
    "correctIndex": 0,
    "explanation": "符合條件的乘客是強制險的重要保障對象。"
  },
  {
    "id": "q17",
    "sourceNumber": 17,
    "category": "保障範圍",
    "scope": "player",
    "prompt": "{{A}}與{{B}}互撞，{{A}}受傷醫療費2萬元、車損5萬元。假設醫療費均屬強制險可給付項目且未達限額，下列何者最正確？",
    "options": [
      "強制險可依法處理2萬元醫療費，但不支付5萬元車損",
      "可用強制險直接領7萬元，包含醫療費用與車損",
      "只能用強制險支付5萬元車損",
      "醫療費完全不是強制險項目"
    ],
    "correctIndex": 0,
    "explanation": "本題將人身傷害醫療與車體損失分開，金額是假設並非自動核准。"
  },
  {
    "id": "q18",
    "sourceNumber": 18,
    "category": "保險制度",
    "scope": "player",
    "prompt": "{{A}}與{{B}}互撞，{{A}}因已有保險給付而與{{B}}協商民事賠償。何者正確？",
    "options": [
      "符合條件的保險給付依法可計入已賠償金額",
      "只有商業保險才能計入民事賠償金額",
      "同一筆費用可重複索賠",
      "只要有保險就可免除其他賠償義務"
    ],
    "correctIndex": 0,
    "explanation": "強制險給付可依法計入被保險人應負的損害賠償金額。"
  },
  {
    "id": "q19",
    "sourceNumber": 19,
    "category": "投保義務",
    "scope": "player",
    "prompt": "{{A}}與{{B}}兩車相撞，{{A}}以為只有汽車要保強制險、機車不用保。哪個說法正確？",
    "options": [
      "汽車及機車均有依法投保強制險的義務",
      "只有超過2000cc汽車與125cc的機車需要投保",
      "只有機車需要，汽車可以免投保",
      "只有職業司機需要投保"
    ],
    "correctIndex": 0,
    "explanation": "保險制度說明強制險適用汽車、機車及依法納管的微型電動二輪車等。"
  },
  {
    "id": "q20",
    "sourceNumber": 20,
    "category": "保險架構",
    "scope": "player",
    "prompt": "{{A}}與{{B}}互撞，雙方均僅投保強制險。哪種風險仍有明顯保障缺口？",
    "options": [
      "事故引起的汽車修復及其他財物賠償責任",
      "符合資格的傷害醫療基本給付",
      "符合資格的死亡基本給付",
      "符合資格的失能基本給付"
    ],
    "correctIndex": 0,
    "explanation": "強制險不賠財損，宜視需求補足任意責任與車體保障。"
  },
  {
    "id": "q22",
    "sourceNumber": 22,
    "category": "保險架構",
    "scope": "npc",
    "prompt": "{{A}}若對與一部小客車發生的碰撞事故有應負的民事責任，且該車需要修車，最相關的任意保障為何？",
    "options": [
      "第三人責任險的財物損害保障",
      "強制險醫療給付",
      "{{A}}的竊盜險",
      "一部小客車的駕駛人死亡給付"
    ],
    "correctIndex": 0,
    "explanation": "對第三人的財物賠償，應看法律責任及任意第三人責任險財損條款。"
  },
  {
    "id": "q23",
    "sourceNumber": 23,
    "category": "特殊補償",
    "scope": "npc",
    "prompt": "假設本次撞上{{A}}的一部小客車其實未投保強制險，{{A}}因此受傷且符合法定條件，理賠金將出自？",
    "options": [
      "汽車交通事故特別補償基金",
      "保險公司之保險金",
      "國家理賠",
      "由受害者自行吸收"
    ],
    "correctIndex": 0,
    "explanation": "相關規定列未保險汽車為特別補償基金可依法申請之情形之一。"
  },
  {
    "id": "q24",
    "sourceNumber": 24,
    "category": "追償例外",
    "scope": "npc",
    "prompt": "假設本次一部小客車的駕駛酒精濃度超過法定標準，撞傷{{A}}。若符合強制險給付要件，保險人後續可能如何處理？",
    "options": [
      "先依法給付受害人，再依法向應負責的被保險人追償",
      "因酒駕就必定不讓受害人有任何基本保障",
      "將所有車損直接當作傷害醫療",
      "酒駕情形屬刑事案件，由法院裁定，強制險不予理賠"
    ],
    "correctIndex": 0,
    "explanation": "相關規定列酒駕屬特定情形下保險給付後得依法追償的原因。"
  },
  {
    "id": "q25",
    "sourceNumber": 25,
    "category": "追償例外",
    "scope": "npc",
    "prompt": "假設一部小客車的駕駛無照駕車撞傷{{A}}，強制險可能出現哪種處理？",
    "options": [
      "符合條件時仍對受害人給付，之後保險人可依法追償",
      "一律改由車商維修費充當人身給付",
      "一部小客車的駕駛沒駕照就代表受害人沒有權利",
      "僅要求一部小客車的駕駛補辦駕照就能消除所有責任"
    ],
    "correctIndex": 0,
    "explanation": "相關規定將無照駕駛列為保險人給付後得依法行使追償的事由之一。"
  },
  {
    "id": "q27",
    "sourceNumber": 27,
    "category": "保障對象",
    "scope": "npc",
    "prompt": "一部小客車與{{A}}相撞，該車駕駛自己也受傷。下列何者較正確？",
    "options": [
      "兩車事故應分別依各人身分、各車保險及法定資格判斷",
      "一部小客車一定可用強制險修好",
      "只有{{A}}的車漆屬於人身損害",
      "只要對方是一部小客車就不需考慮法律保障"
    ],
    "correctIndex": 0,
    "explanation": "兩車事故中不同駕駛、乘客請求資格不可混為一談。"
  },
  {
    "id": "q28",
    "sourceNumber": 28,
    "category": "特殊補償",
    "scope": "npc",
    "prompt": "如果{{A}}因本次與一部小客車發生的事故受傷，且由特別補償基金依法補償後，基金是否可能向應負責者求償？",
    "options": [
      "可能，基金依法補償後仍可能向加害人求償",
      "不可能，任何人都永久免責",
      "基金一定負擔一部小客車的所有車損",
      "基金會自動免除所有交通罰單"
    ],
    "correctIndex": 0,
    "explanation": "特別補償基金補償後，仍可能依法向加害人求償。"
  },
  {
    "id": "q29",
    "sourceNumber": 29,
    "category": "二輪車法規",
    "scope": "npc",
    "prompt": "假設本次與{{A}}碰撞的車輛，從一部小客車改為「微型電動二輪車」，車主依法上路前應完成哪組事項？",
    "options": [
      "投保強制險、登記領牌及懸掛牌照",
      "只有把車噴成黃色",
      "購買車體竊盜險即可免領牌",
      "只帶耳機就可以直接上路"
    ],
    "correctIndex": 0,
    "explanation": "微型電動二輪車投保、領牌後方得依法上路的制度。"
  },
  {
    "id": "q30",
    "sourceNumber": 30,
    "category": "特殊補償",
    "scope": "hitRun",
    "prompt": "撞上{{A}}的一部小客車逃逸，事後仍無法查明肇事車。{{A}}因此受傷，符合條件時應向哪個機制評估補償？",
    "options": [
      "汽車交通事故特別補償基金",
      "汽車烤漆保固",
      "路燈維修基金",
      "觀光旅遊補助"
    ],
    "correctIndex": 0,
    "explanation": "相關規定列事故汽車無法查究為可依規定向特別補償基金請求補償之情形。"
  },
  {
    "id": "q31",
    "sourceNumber": 31,
    "category": "事故處置",
    "scope": "hitRun",
    "prompt": "一部小客車撞上{{A}}後逃逸，下列哪一項資訊較非必要？",
    "options": [
      "車體受損維修估價單",
      "行車紀錄器",
      "事故現場照片",
      "目擊者提供之線索"
    ],
    "correctIndex": 0,
    "explanation": "事故現場處理應包含報警、保存影像與目擊者資訊。"
  },
  {
    "id": "q32",
    "sourceNumber": 32,
    "category": "特殊補償",
    "scope": "hitRun",
    "prompt": "{{A}}遭撞傷，假設一部小客車的駕駛逃逸後隔天已查明車籍及有效強制險。哪項判斷最合理？",
    "options": [
      "不能再僅以「肇車無法查究」為由認定適用該特補情形，應確認保險理賠途徑",
      "只要曾逃逸就必定永遠查無肇事車",
      "一律由基金賠全部車損",
      "不能向任何保險公司提出請求"
    ],
    "correctIndex": 0,
    "explanation": "事故汽車無法查究屬特別補償基金法定事由之一；已查明車輛時應重新判斷保險途徑。"
  }
];
  for (const question of questions) {
    Object.freeze(question.options);
    Object.freeze(question);
  }
  Object.freeze(questions);
  return Object.freeze({ version: '8.4', count: questions.length, questions });
});
