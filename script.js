/*--------------------------------------------------------------
  Warframe Item Tracker main script
  - Checklist / TODO / Build / Wish List
  - Damage‑type tag → Base64 icon conversion
  - Local‑Storage Export / Import / Clear
--------------------------------------------------------------*/

/***** DOM refs *****/
const g = {
  sidebar: document.getElementById("sidebar"),
  main:    document.getElementById("main"),
  dl:      null,   // datalist node (set later)
  data:    null,   // items.json
  flat:    []      // flattened items for suggestion / desc lookup
};

/* ==== Kuva / Tenet / Coda ==== */
const VARIANT_ELEMENTS = {
  kuva : ["+60% 火炎", "+60% 冷気", "+60% 電気", "+60% 毒",
          "+60% 放射線", "+60% 磁気", "+60% 衝撃"],
  tenet: ["+60% 火炎", "+60% 冷気", "+60% 電気", "+60% 毒",
          "+60% 放射線", "+60% 磁気", "+60% 衝撃"],
  tenet: ["+60% 火炎", "+60% 冷気", "+60% 電気", "+60% 毒",
          "+60% 放射線", "+60% 磁気", "+60% 衝撃"]
};

/* ==== カテゴリ別スロット構成 =====================================
   mods  : 通常スロット数
   aura  : オーラ   (1/0)
   stance: スタンス (1/0)
   exi   : エクシラス(1/0)
   arc   : アルケイン数
==================================================================*/
const SLOT_CFG = {
  "Warframe":              {mods: 8, aura:1, stance:0, exi:1, arc:2},
  "プライマリ":            {mods: 8, aura:0, stance:0, exi:1, arc:1},
  "セカンダリ":            {mods: 8, aura:0, stance:0, exi:1, arc:1},
  "近接":                  {mods: 8, aura:0, stance:1, exi:1, arc:1},
  "センチネル用武器":      {mods: 9, aura:0, stance:0, exi:0, arc:0},
  "アークウイングガン":    {mods: 9, aura:0, stance:0, exi:0, arc:0},
  "アークウイング近接":    {mods: 8, aura:0, stance:0, exi:0, arc:0},
  "センチネル":            {mods: 9, aura:0, stance:0, exi:0, arc:0},
  "モア/ハウンド/クブロウ/キャバット": {mods:10,aura:0,stance:0,exi:0,arc:0},
  "アークウイング":        {mods: 8, aura:0, stance:0, exi:0, arc:0},
  "ネクロメカ":            {mods:12, aura:0, stance:0, exi:0, arc:0}
};

/* ==== Companion (センチネル／その他) 用ユーティリティ ============== */
const getCompanionCfg = sub =>
  (sub && sub.includes("センチネル"))
    ? SLOT_CFG["センチネル"]
    : SLOT_CFG["モア/ハウンド/クブロウ/キャバット"];

/* renderMenu の前にグローバル定義しておく */
const MENU_ORDER = ["all","kuva","tenet","coda","warframe","primary","secondary","melee","pet","sentinelweapon","archwing","archgun","archmelee","mech","mods","arcanes"];


/* ==== utility: simple debounce =================================== */
const debounce = (fn, delay = 200) => {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, args), delay);
  };
};

/* ==== shared Tooltip (Checklist / Build 共用) ===================== */
let _tooltip;
const getTip = () => {
  if (_tooltip) return _tooltip;
  _tooltip = Object.assign(document.createElement("div"), { id: "tooltip" });
  document.body.appendChild(_tooltip);
  document.addEventListener("click", e=>{
    if (!e.target.closest(".tooltip-trigger")) _tooltip.classList.remove("visible");
  });
  return _tooltip;
};
const showTip = (html, target) => {
  const tip = getTip();
  tip.innerHTML = html;
  const r = target.getBoundingClientRect();
  const y = r.bottom + (window.scrollY||document.documentElement.scrollTop) + 8;
  tip.style.left = `${Math.max(8, r.left)}px`;
  tip.style.top  = `${y}px`;
  tip.classList.add("visible");
};

/* Backdrop (mobile) */
const backdrop = document.getElementById("backdrop");

/***** ダメージタイプ → Base64 アイコン (icon_src.jsで定義)*****

/* --- タグ → <img> に変換（未登録タグは非表示） --- */
const withIcons = (txt="") =>
  txt.replace(/<([^>]+)>/g, (_,tag)=>ICON_SRC[tag]?`<img class="dmg-icon" src="data:image/png;base64,${ICON_SRC[tag]}" alt="${tag}">`:"");

/***** ハンバーガー開閉 *****/
const hamburgerBtn = document.getElementById("hamburger");

function closeMenu () {
  g.sidebar.classList.add("hidden");
  document.body.classList.remove("menu-open");
  hamburgerBtn.classList.remove("active");     // ← アイコン状態リセット
}

/* モバイル: 背景タップで閉じる */
backdrop.addEventListener("click", closeMenu);

hamburgerBtn.addEventListener("click", () => {
  g.sidebar.classList.toggle("hidden");
  document.body.classList.toggle("menu-open");
  hamburgerBtn.classList.toggle("active");     // ← アニメーション切替
});

window.addEventListener("DOMContentLoaded",()=>innerWidth>=768?document.body.classList.add("menu-open"):closeMenu());

/***** Local‑storage helpers *****/
const lsKey = (id, scope="checked") => `wf:${scope}:${id}`;
const lsGet = (id, scope="checked", def=false) =>{
  const raw = localStorage.getItem(lsKey(id,scope));
  if(raw===null) return def;
  try{return JSON.parse(raw);}catch{return def;}
};
const lsSet = (id, scope, v)=>localStorage.setItem(lsKey(id,scope),JSON.stringify(v));

/*================== 1. CHECKLIST ==================*/
function renderTable(menu){
  const isPC = innerWidth >= 768;               // PC 判定

  /* ---- Controls ---- */
  g.main.innerHTML = `<h2>${menu.title}</h2>
  <div id="controls">
    <input id="search" type="text" placeholder="検索 …">
    <label><input id="showChecked" type="checkbox" checked> チェック済</label>
    <label><input id="showUnchecked" type="checkbox" checked> 未チェック</label>
    ${isPC ? "" : '<label><input id="showDetails" type="checkbox"> 詳細表示</label>'}
  </div>`;

  /* ---- Table skeleton ---- */
  const table = document.createElement("table"),
        thead = document.createElement("thead"),
        tbody = document.createElement("tbody");
  table.append(thead, tbody); g.main.appendChild(table);

  /* ---- Tooltip node (単一インスタンス) ---- */
  const tip = document.getElementById("tooltip") || Object.assign(document.createElement("div"), {id:"tooltip"});
  if(!tip.isConnected) document.body.appendChild(tip);
  const hideTip = () => tip.classList.remove("visible");
  const showTip = (html, target) => {
    tip.innerHTML = html;
    const r = target.getBoundingClientRect();
    const y = r.bottom + (window.scrollY || document.documentElement.scrollTop) + 8;
    tip.style.left = `${Math.max(8, r.left)}px`;
    tip.style.top  = `${y}px`;
    tip.classList.add("visible");
  };
  document.addEventListener("click", e=>{
    if(!e.target.closest(".tooltip-trigger")) hideTip();
  });

  /* ---- Rebuild ---- */
  const ANIM_LIMIT = 30;              // ← スライドさせる上限行数
  const rebuild = (animate = false)=>{
    const showDetails = isPC || g.main.querySelector("#showDetails")?.checked;
    const cols = isPC ? menu.columns
                      : menu.columns.filter(c=>c.mobileDefault);
    const showExtraRows = showDetails && !isPC; // スマホ詳細ON時のみ

    thead.innerHTML =
      `<tr><th></th>${cols.map(c=>`<th>${c.label}</th>`).join("")}</tr>`;

    const q     = g.main.querySelector("#search").value.trim().toLowerCase(),
          showC = g.main.querySelector("#showChecked").checked,
          showU = g.main.querySelector("#showUnchecked").checked;

    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();  // 追加
    let seq = 0;
    menu.items.forEach(item=>{
      const checked = lsGet(item.id);
      if((checked&&!showC)||(!checked&&!showU)) return;
      if(q && !Object.values(item).join(" ").toLowerCase().includes(q)) return;

      /* ---- Main row ---- */
      const tr = document.createElement("tr");
      // ---- ★ レアリティによるクラス付与 ------------------
      const rarity = (item.rarity || "").toLowerCase();
      if (["common", "uncommon", "rare", "legendary"].includes(rarity)) {
       tr.classList.add(`rarity-${rarity}`);
      }
      const cb = Object.assign(document.createElement("input"),{
        type:"checkbox",checked,
        onchange:e=>{
          lsSet(item.id,"checked",e.target.checked);
          document.querySelectorAll(`input[data-id="${item.id}"]`)
                   .forEach(el=>el.checked=e.target.checked);
          rebuild();
        }
      });
      cb.dataset.id = item.id;
      tr.appendChild(document.createElement("td")).appendChild(cb);

      /* ---- Data cells ---- */
      cols.forEach(col=>{
        const td = document.createElement("td");

        if(col.key === "name"){
          const span = document.createElement("span");
          span.textContent = item[col.key];
          if(!showDetails){
            span.className = "tooltip-trigger";
            span.onclick = e=>{
              e.stopPropagation();
              if(tip.classList.contains("visible")){hideTip();return;}

              const hidden = menu.columns.filter(c=>!c.mobileDefault && c.key!=="desc");
              const rows = hidden.map(c=>{
                const val = item[c.key] ?? "";
                return `<tr><td class="h">${c.label}</td><td>${withIcons(val)}</td></tr>`;
              }).join("");
              const html = `<table>${rows}</table>${item.desc?`<div class="desc">${withIcons(item.desc)}</div>`:""}`;
              showTip(html, span);
            };
          }
          td.appendChild(span);

        }else if(col.type === "select"){
          const sid = `${item.id}:${col.key}`,
                val = lsGet(sid,"val",item[col.key]);
          const sel = document.createElement("select");
          col.options.forEach(o=>sel.add(new Option(`${o}%`,o,false,o==val)));
          sel.onchange=e=>lsSet(sid,"val",parseInt(e.target.value));
          sel.value = val; td.appendChild(sel);

        }else if(col.type === "input"){
          const sid = `${item.id}:${col.key}`,
                val = lsGet(sid,"val",item[col.key]||"");
          const inp = Object.assign(document.createElement("input"),{type:"text",value:val});
          inp.onblur=e=>lsSet(sid,"val",e.target.value);
          td.appendChild(inp);

        }else{
          td.innerHTML = withIcons(item[col.key] || "");
        }
        tr.appendChild(td);
      });
      frag.appendChild(tr);
      /* ---- slide‑in animation (先頭 ANIM_LIMIT 行のみ) ---- */
      if (animate && seq < ANIM_LIMIT) {
        tr.classList.add("slide-row");
        tr.style.animationDelay = `${seq * 10}ms`;
      }
      seq++;

      /* ---- extra rows for hidden columns (mobile only) ---- */
      if(showExtraRows){
        const hidden = menu.columns.filter(c=>!c.mobileDefault && c.key!=="desc");
        if(hidden.length){
          const rows = hidden.map(c=>{
            const val = item[c.key] ?? "";
            return `<tr><td class="h">${c.label}</td><td>${withIcons(val)}</td></tr>`;
          }).join("");
          const er = document.createElement("tr"); er.className = "extra-row";
          er.innerHTML = `<td></td><td colspan="${cols.length}"><table class="mini">${rows}</table></td>`;
          frag.appendChild(er);
          if (animate && seq < ANIM_LIMIT) {
            er.classList.add("slide-row");
            er.style.animationDelay = `${seq * 10}ms`;
          }
          seq++;
        }
      }

      /* ---- desc-row (desc) ---- */
      if(showDetails && item.desc){
        const dr = document.createElement("tr"); dr.className = "desc-row";
        dr.appendChild(document.createElement("td"));
        const dtd = document.createElement("td");
        dtd.colSpan = cols.length;
        dtd.innerHTML = withIcons(item.desc);
        dr.appendChild(dtd);
        frag.appendChild(dr);
        if (animate && seq < ANIM_LIMIT) {
          dr.classList.add("slide-row");
          dr.style.animationDelay = `${seq * 10}ms`;
        }
        seq++;
      }
    });

    /* ---- まとめて挿入（リフロー1回） ---- */
    tbody.appendChild(frag);
  };

  /* ---- Events (検索欄は debounce で負荷軽減) ---- */
  g.main.querySelector("#search")
        .addEventListener("input", debounce(() => rebuild(false), 250));
  ["showChecked","showUnchecked"]
    .forEach(id=>g.main.querySelector(`#${id}`).addEventListener("input",()=>rebuild(false)));

  if(!isPC){
    /* スマホ: 詳細表示トグルはアニメ有り */
    g.main.querySelector("#showDetails").addEventListener("input",()=>rebuild(true));
  }

  rebuild(true);
}

/*================== 2. TODO LIST ==================*/
const TODO_KEY="todo:list";
function renderTodo(){
  g.main.innerHTML="<h2>TODO</h2>";
  const table=document.createElement("table");
  table.innerHTML="<thead><tr><th></th><th>内容</th><th></th><th></th></tr></thead>";
  const tbody=document.createElement("tbody");table.appendChild(tbody);g.main.appendChild(table);

  const rebuild=()=>{
    tbody.innerHTML="";
    const todos=lsGet(TODO_KEY,"todo",[]);
    todos.forEach(t=>{
      const tr=document.createElement("tr");
      const cb=Object.assign(document.createElement("input"),{type:"checkbox",checked:t.checked,onchange:e=>{t.checked=e.target.checked;lsSet(TODO_KEY,"todo",todos);}});
      tr.appendChild(document.createElement("td")).appendChild(cb);
      const txtTd=tr.appendChild(document.createElement("td"));txtTd.textContent=t.text;

      const editBtn=document.createElement("button");editBtn.className="icon-btn";editBtn.innerHTML="✏";
      editBtn.onclick=()=>{
        const inp=document.createElement("input");inp.type="text";inp.value=t.text;inp.setAttribute("list","suggest");
        inp.onblur=()=>{t.text=inp.value.trim();lsSet(TODO_KEY,"todo",todos);rebuild();};
        txtTd.replaceChildren(inp);inp.focus();
      };
      tr.appendChild(document.createElement("td")).appendChild(editBtn);

      const delBtn=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"✖",onclick(){lsSet(TODO_KEY,"todo",todos.filter(x=>x.id!==t.id));rebuild();}});
      tr.appendChild(document.createElement("td")).appendChild(delBtn);
      tbody.appendChild(tr);
    });

    /* add row */
    const addTr=document.createElement("tr");addTr.innerHTML="<td></td>";
    const inpTd=addTr.appendChild(document.createElement("td"));
    const addInp=Object.assign(document.createElement("input"),{type:"text",placeholder:"新しいTODO…"});inpTd.appendChild(addInp);
    const plus=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"＋",onclick(){
      const txt=addInp.value.trim();if(!txt)return;
      todos.push({id:Date.now().toString(36),text:txt,checked:false});lsSet(TODO_KEY,"todo",todos);rebuild();
    }});
    addTr.appendChild(document.createElement("td")).appendChild(plus);
    addTr.appendChild(document.createElement("td"));tbody.appendChild(addTr);
  };
  rebuild();
}

/*================== 3. WISH LIST ==================*/
const WISH_KEY = "wishlist:list";

function renderWishlist () {
  g.main.innerHTML = "<h2>Wish List</h2>";

  /* ---------- table skeleton ---------- */
  const table = document.createElement("table");
  table.innerHTML =
    `<thead>
       <tr>
         <th></th><th>アイテム</th><th>進捗</th><th>備考</th><th></th><th></th>
       </tr>
     </thead>`;
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  g.main.appendChild(table);

  /* ---------- helper ---------- */
  const saveList = list => lsSet(WISH_KEY, "wish", list);

  /* ---------- main builder ---------- */
  const rebuild = () => {
    tbody.innerHTML = "";
    const list = lsGet(WISH_KEY, "wish", []).map(w => ({
      ...w,
      /* 旧 qty → max 移行（後方互換） */
      max: w.max ?? w.qty ?? 0,
      have: w.have ?? 0
    }));

    list.forEach(w => {
      const tr = document.createElement("tr");

      /* ✔ checkbox */
      const cb = Object.assign(document.createElement("input"), {
        type: "checkbox",
        checked: w.checked,
        onchange: e => {
          w.checked = e.target.checked;
          saveList(list);
        }
      });
      tr.appendChild(document.createElement("td")).appendChild(cb);

      /* item name */
      tr.appendChild(document.createElement("td")).textContent = w.item || "";

      /* progress – slider + buttons */
      const progTd = document.createElement("td");
      const minus = Object.assign(document.createElement("button"), { className: "icon-btn", textContent: "－" });
      const plus  = Object.assign(document.createElement("button"), { className: "icon-btn", textContent: "＋" });
      const range = Object.assign(document.createElement("input"), { type: "range", className: "wish-range",
        min: 0, max: w.max || 0, value: w.have });
      const label = document.createElement("span");

      const sync = () => {
        range.max = w.max || 0;
        range.value = w.have;
        label.textContent = `${w.have}/${w.max}`;
      };
      minus.onclick = () => { if (w.have > 0) { w.have--; sync(); saveList(list);} };
      plus.onclick  = () => { if (w.have < w.max) { w.have++; sync(); saveList(list);} };
      range.oninput = e => { w.have = parseInt(e.target.value); label.textContent = `${w.have}/${w.max}`; };
      range.onchange= () => saveList(list);

      progTd.append(minus, range, plus, label);
      sync();
      tr.appendChild(progTd);

      /* note */
      tr.appendChild(document.createElement("td")).textContent = w.note || "";

      /* edit / delete */
      const editBtn = Object.assign(document.createElement("button"), { className: "icon-btn", innerHTML: "✏" });
      const delBtn  = Object.assign(document.createElement("button"), { className: "icon-btn", innerHTML: "✖",
        onclick () { saveList(list.filter(x => x.id !== w.id)); rebuild(); } });

      editBtn.onclick = () => {
        /* replace 3 cells with inputs ( item | have/max | note ) */
        const itmInp  = Object.assign(document.createElement("input"), {
          type: "text", value: w.item
        });
        itmInp.setAttribute("list", "suggest");    /* ← ここも同様 */
        const haveInp = Object.assign(document.createElement("input"), { type: "number", value: w.have, min: 0, style: "width:4em" });
        const maxInp  = Object.assign(document.createElement("input"), { type: "number", value: w.max, min: 0, style: "width:4em" });
        const noteInp = Object.assign(document.createElement("input"), { type: "text", value: w.note });

        tr.children[1].replaceChildren(itmInp);                // item
        tr.children[2].replaceChildren(haveInp, document.createTextNode(" / "), maxInp); // have/max
        tr.children[3].replaceChildren(noteInp);               // note

        /* ── 保存ロジック ────────────────────────── */
        const commit = () => {
          /* 値を書き戻し & 保存 */
          w.item = itmInp.value.trim();
          w.have = parseInt(haveInp.value) || 0;
          w.max  = parseInt(maxInp.value)  || 0;
          w.note = noteInp.value.trim();
          saveList(list);
          rebuild();                      /* 表示モードへ戻す */
        };

        /* 同じ行の別 input にフォーカスが移る場合は commit しない */
        let blurTimer = null;
        const onBlur = () => {
          clearTimeout(blurTimer);
          blurTimer = setTimeout(() => {
            /* 0 ms 後に activeElement が更新されるので判定 */
            if (tr.contains(document.activeElement)) return; // まだ同じ行
            commit();                                        // 行外に出たら確定
          }, 0);
        };

        /* ４つの入力すべてに blur / Enter key ハンドラを付与 */
        [itmInp, haveInp, maxInp, noteInp].forEach(inp => {
          inp.addEventListener("blur", onBlur);
          inp.addEventListener("keydown", e => { if (e.key === "Enter") commit(); });
        });

        itmInp.focus();  /* 最初のフォーカスはアイテム名へ */
      };

      tr.appendChild(document.createElement("td")).appendChild(editBtn);
      tr.appendChild(document.createElement("td")).appendChild(delBtn);
      tbody.appendChild(tr);
    });

    /* ------- add row (bottom) ------- */
    const addTr = document.createElement("tr");
    addTr.innerHTML = "<td></td>";

    /* item */
    const itmTd = addTr.appendChild(document.createElement("td"));
    const itmInp = Object.assign(document.createElement("input"), {
      type: "text", placeholder: "アイテム名"
    });
    itmInp.setAttribute("list", "suggest");        /* ← 属性で指定 */
    itmTd.appendChild(itmInp);

    /* have / max */
    const progTd = addTr.appendChild(document.createElement("td"));
    const haveInp = Object.assign(document.createElement("input"), { type: "number", placeholder: "0", style: "width:4em" });
    const maxInp  = Object.assign(document.createElement("input"), { type: "number", placeholder: "1", style: "width:4em" });
    progTd.append(haveInp, document.createTextNode(" / "), maxInp);

    /* note */
    const noteTd = addTr.appendChild(document.createElement("td"));
    const noteInp = Object.assign(document.createElement("input"), { type: "text", placeholder: "備考" });
    noteTd.appendChild(noteInp);

    /* add button */
    const addBtn = Object.assign(document.createElement("button"), { className: "icon-btn", innerHTML: "＋",
      onclick () {
        if (!itmInp.value.trim()) return;
        list.push({
          id: Date.now().toString(36),
          item: itmInp.value.trim(),
          have: parseInt(haveInp.value) || 0,
          max:  parseInt(maxInp.value)  || 0,
          note: noteInp.value.trim(),
          checked: false
        });
        saveList(list); rebuild();
      }});
    addTr.appendChild(document.createElement("td")).appendChild(addBtn);
    addTr.appendChild(document.createElement("td"));   /* dummy */
    tbody.appendChild(addTr);
  };
  rebuild();
}

/*================== 4. BUILD MANAGER ==================*/
const BUILD_KEY="builds:list";
function renderBuilds(){
  const builds=lsGet(BUILD_KEY,"build",[]);
  const blank = {id:Date.now().toString(36),category:"Warframe",item:"",name:"",
                  element:"",arcanes:["",""],aura:"",exilus:"",
                  mods:Array(12).fill(""),note:""};
                  g.main.innerHTML=`
                    <h2>Builds</h2>
                    <div id="build-controls">
                      <input type="text" id="build-search"
                             placeholder="検索 …"
                             style="width:100%;max-width:320px;margin:0 0 1rem;">
                    </div>`;

                  /* --- 検索フィルタ ------------------------------------ */
                  const filterCards = q=>{
                    q=q.trim().toLowerCase();
                    grid.querySelectorAll(".build-card").forEach(c=>{
                      c.style.display = (q==="" || c.dataset.search.includes(q))?"":"none";
    });
  };
  const grid=document.createElement("div");grid.className="build-grid";g.main.appendChild(grid);

  g.main.querySelector("#build-search")
  .addEventListener("input", e=>filterCards(e.target.value));

  // 旧実装を置き換え
  const slotCfg = (type, sub = "") => {
    if (type === "Warframe")      return { arc: 2, aura: true,  stance: false, exi: true  };
    if (type === "近接")          return { arc: 0, aura: false, stance: true,  exi: true  };
    if (type === "コンパニオン") {          // ★ 追加
      const c = getCompanionCfg(sub);
      return { arc: c.arc, aura: !!c.aura, stance: !!c.stance, exi: !!c.exi };
    }
    return { arc: 2, aura: false, stance: false, exi: true };
  };

  const addCard=obj=>{
    const cfg=slotCfg(obj.type);
    const card=document.createElement("div");card.className="build-card";grid.appendChild(card);
    card.dataset.search = `${obj.category} ${obj.item} ${obj.name}`.toLowerCase();

    /* buttons (先に挿入して“1 段目”に) */
    const btnRow = Object.assign(document.createElement("div"),{className:"btn-row"});
    card.appendChild(btnRow);           /* ← ここが『1 行目』になる */

    /* view (タイトル＋詳細) */
    const headerLine =
      `${obj.category} – ${obj.item || "(no item)"}${obj.element ? ` (${obj.element})` : ""} / ${obj.name || "Unnamed"}`;
    const view = document.createElement("div"); view.className = "view";
    view.appendChild(Object.assign(document.createElement("div"),{
      className: "build-header",
      textContent: headerLine
    }));
    card.appendChild(view);             /* ← 『2 行目』以降 */

    const line = (label, val) => {
      if (!val) return;

      /* ---- 行の骨格 ---- */
      const li = document.createElement("div");
      li.className = "build-line";

      /* ✔チェックボックス */
      const id  = val.replace(/\s+/g, "_");
      const cb  = Object.assign(document.createElement("input"), {
                    type: "checkbox",
                    checked: lsGet(id),
                    onchange: e => {
                      lsSet(id, "checked", e.target.checked);
                      document.querySelectorAll(`input[data-id="${id}"]`)
                               .forEach(el => (el.checked = e.target.checked));
                    }
                  });
      cb.dataset.id = id;
      li.appendChild(cb);

      /* ラベルテキスト */
      const span = Object.assign(document.createElement("span"), {
        innerHTML: `${label}: ${withIcons(val)}`
      });
      li.appendChild(span);

      /* ---- desc 生成 ---- */
      const itm = g.flat.find(x => x.label === val || x.name === val);
      if (itm && itm.desc) {
        /* ① .desc ブロックは常に作成（CSS で開閉） */
        const d = document.createElement("div");
        d.className = "desc";
        d.innerHTML = withIcons(itm.desc);
        li.appendChild(d);

        /* ② 詳細 OFF の時だけツールチップ */
        if (!card.classList.contains("show-details")) {
          span.className = "tooltip-trigger";
          span.onclick = e => {
            e.stopPropagation();
            showTip(`<div class="desc">${withIcons(itm.desc)}</div>`, span);
          };
        }
      }
      /* view へ追加 */
      view.appendChild(li);
    };

      const rec     = g.flat.find(x => x.label === obj.item || x.name === obj.item);
      const cfgView = (obj.category === "コンパニオン")
                        ? getCompanionCfg(rec?.subClass || obj.subClass || "")
                        : (SLOT_CFG[obj.category] || SLOT_CFG["Warframe"]);

    obj.arcanes.slice(0,cfgView.arc).forEach((a,i)=>line(`Arcane${i+1}`,a));
    if(cfg.aura)line("Aura",obj.aura);
    if(cfg.stance)line("Stance",obj.aura);
    if(cfg.exi)line("Exilus",obj.exilus);

    obj.mods.forEach((m,i)=>line(`Mod${i+1}`,m));
    if(obj.note){const p=document.createElement("p");p.className="note";p.innerHTML=withIcons(obj.note);view.appendChild(p);}

    /* ① 詳細表示トグルを追加（編集✏の左） */
    const detailChk = Object.assign(document.createElement("input"),
                                      {type:"checkbox",title:"詳細表示"});
    detailChk.onchange = () =>
        card.classList.toggle("show-details", detailChk.checked);
    btnRow.appendChild(detailChk);          /* ← まず配置 */

    const editBtn=document.createElement("button");editBtn.textContent="✏";
    const delBtn=document.createElement("button");delBtn.textContent="✖";
    btnRow.append(editBtn,delBtn);

    const edit=document.createElement("div");edit.className="edit hidden";card.appendChild(edit);
    const catLabel = document.createElement("span");       // ← ★ 表示専用
    catLabel.textContent = obj.category || "(未定)";
    const itemInp=document.createElement("input");itemInp.type="text";itemInp.value=obj.item;itemInp.setAttribute("list","suggest");
    const nameInp=Object.assign(document.createElement("input"),{type:"text",value:obj.name});
    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"タイトル"}));
    /* 変異武器用の属性行を動的生成 --------------------- */
    const attrWrap = document.createElement("span");      // placeholder
    const buildAttrRow = ()=>{
      attrWrap.innerHTML="";              // 毎回クリア
      const itm = g.flat.find(x=>x.label===itemInp.value||x.name===itemInp.value);
      if(itm?.variant && VARIANT_ELEMENTS[itm.variant]){
        const sel = document.createElement("select");
        VARIANT_ELEMENTS[itm.variant].forEach(elm=>{
          sel.add(new Option(elm,elm,false,elm===obj.element));
        });
        sel.onchange = e => obj.element = e.target.value;
        attrWrap.append(" 属性:", sel);
      }else{
        obj.element="";                   // 非変異武器なら空
      }
    };
    buildAttrRow();
    const updateCategory = () => {
      const itm = g.flat.find(x=>x.label===itemInp.value || x.name===itemInp.value);
      if (itm?.category){
        obj.category       = itm.category;
        obj.type           = itm.category;
        obj.subClass       = itm.subClass || "";
        catLabel.textContent = itm.category;
      }else{
        obj.category       = "(未定)";
        catLabel.textContent = "(未定)";
      }
      buildSlots();      // ← スロットも作り直し
      buildAttrRow();    // ← 属性プルダウンも更新
    };
    itemInp.addEventListener("input", updateCategory);

    edit.append("カテゴリ:",catLabel," アイテム名:",itemInp,attrWrap," ビルド名:",nameInp);

    const inpRow=(lbl,val)=>{
      const d=document.createElement("div");d.className="form-row";
      d.appendChild(Object.assign(document.createElement("label"),{textContent:lbl}));
      const i=document.createElement("input");i.type="text";i.value=val;i.setAttribute("list","suggest");d.appendChild(i);slotBox.appendChild(d);return i;
    };
    /* ---- Slots (カテゴリが変わる度に再構築) ---- */
    const slotBox = document.createElement("div");  // ここに挿入
    const buildSlots = () => {
      slotBox.innerHTML = "";                       // クリア
      /* ----- カテゴリごとのスロット構成 ----------------------------- */
      /* ① item から subClass を確定（既存 Build も補完できるよう毎回評価） */
      const rec      = g.flat.find(x => x.label === obj.item || x.name === obj.item);
      obj.subClass   = rec?.subClass || obj.subClass || "";

      /* ② Companion だけ subClass で分岐 */
      const cfg = (obj.category === "コンパニオン")
                    ? getCompanionCfg(obj.subClass)
                    : (SLOT_CFG[obj.category] || SLOT_CFG["Warframe"]);
      const arc = [];
      for (let i=0;i<cfg.arc;i++) arc.push(inpRow(`Arcane${i+1}`, obj.arcanes[i]||""));

      let auraInp=null, stanceInp=null;
      if (cfg.aura)  auraInp  = inpRow("Aura",   obj.aura);
      if (cfg.stance)stanceInp= inpRow("Stance", obj.aura); // ※Auraと共有プロパティ

      let exiInp=null;
      if (cfg.exi) exiInp = inpRow("Exilus", obj.exilus);

      const mods=[];
      for (let i=0;i<cfg.mods;i++) mods.push(inpRow(`Mod${i+1}`, obj.mods[i]||""));

      /* 保存時に参照できるよう obj.* をクロージャーへ保持 */
      slotBox._refs = {arc, auraInp, stanceInp, exiInp, mods};
    };
    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"Slots"}));
    edit.appendChild(slotBox);
    buildSlots();

    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"Note"}));
    const noteArea=Object.assign(document.createElement("textarea"),{value:obj.note,rows:3});edit.appendChild(noteArea);
    const save=document.createElement("button");save.textContent="保存";
    const cancel=document.createElement("button");cancel.textContent="キャンセル";edit.append(save,cancel);

    editBtn.onclick=()=>{view.classList.add("hidden");edit.classList.remove("hidden");};
    cancel.onclick=()=>{edit.classList.add("hidden");view.classList.remove("hidden");};
    delBtn.onclick=()=>{if(confirm("Delete build?")){lsSet(BUILD_KEY,"build",builds.filter(b=>b.id!==obj.id));card.remove();}};
    save.onclick=()=>{
      obj.type = obj.category;           // ← ★カテゴリをそのまま保存
      obj.item = itemInp.value.trim();
      obj.name = nameInp.value.trim();
      const elmSel = attrWrap.querySelector("select");
      if (elmSel) obj.element = elmSel.value.trim();
      const {arc, auraInp, stanceInp, exiInp, mods} = slotBox._refs;
      obj.arcanes = arc.map(i=>i.value.trim());
      obj.aura    = auraInp ? auraInp.value.trim()
                 : stanceInp? stanceInp.value.trim() : "";
      obj.exilus  = exiInp ? exiInp.value.trim() : "";
      obj.mods    = mods.map(i=>i.value.trim());
      obj.note    = noteArea.value;
      const arr=lsGet(BUILD_KEY,"build",[]);const idx=arr.findIndex(b=>b.id===obj.id);idx===-1?arr.push(obj):arr[idx]=obj;lsSet(BUILD_KEY,"build",arr);
      card.remove();addCard(obj);
    };
  };
　 builds.forEach(b=>addCard({...{id:Date.now().toString(36),type:"Warframe",item:"",name:"",element:"",arcanes:["",""],aura:"",exilus:"",mods:Array(8).fill(""),note:""},...b}));
  const newBtn=document.createElement("button");newBtn.id="add-build";newBtn.textContent="＋ New Build";
  newBtn.onclick=()=>addCard({id:Date.now().toString(36),type:"Warframe",item:"",name:"",arcanes:["",""],aura:"",exilus:"",mods:Array(8).fill(""),note:""});
  g.main.appendChild(newBtn);

  /* ======== 📋 クリップボード JSON 取り込み ======== */
  /* 1) Overframe/自作 JSON → 内部フォーマットへ変換 ---- */
  /* -------------------------------------------------------------
     クリップボード JSON → 内部ビルド形式へ変換
     - アイテム名を大小文字無視で g.flat から検索し、正式表記へ補正
     - mods / arcanes の並び順を反転
     - Exilus 2 個目以降 → Mod 配列末尾へ結合
  ----------------------------------------------------------------*/
  const convertClipBuild = src => {
    /* --- 0) ベースオブジェクト -------------------------------- */
    const b = {
      id:       Date.now().toString(36),
      item:     src.item     ?? "",
      name:     src.name     ?? "",
      element:  src.element  ?? "",
      arcanes:  [],
      aura:     src.aura     ?? "",
      exilus:   "",
      mods:     [],
      note:     (src.note ?? "").replace(/\\n/g, "\n"),
      category: "Warframe",            // 後で上書き
      type:     "Warframe"
    };

    /* --- 1) mods / arcanes を反転 ----------------------------- */
    const srcMods = Array.isArray(src.mods)    ? [...src.mods].reverse()    : [];
    const srcArcs = Array.isArray(src.arcanes) ? [...src.arcanes].reverse() : [];

    /* --- 2) Exilus 処理 -------------------------------------- */
    if (Array.isArray(src.exilus) && src.exilus.length) {
      b.exilus = src.exilus[0];
      b.mods   = [...srcMods, ...src.exilus.slice(1)];
    } else {
      b.exilus = typeof src.exilus === "string" ? src.exilus : "";
      b.mods   = srcMods;
    }
    b.arcanes = srcArcs;

    /* --- 3) 近接 Stance → Aura フォールバック --------------- */
    if (src.stance && !b.aura) b.aura = src.stance;

    /* --- 4) アイテム辞書照合（大文字小文字を無視） ------------ */
    const norm = s => (s ?? "").toLowerCase();
    const target = norm(b.item);
    const itm = g.flat.find(x => norm(x.label) === target || norm(x.name) === target);

    if (itm) {
      /* 4-A) 正式な表記へ置き換え */
      b.item = itm.name ?? itm.label ?? itm.id;

      /* 4-B) カテゴリ & type を補完 */
      if (itm.category) {
        b.category = itm.category;
        b.type     = itm.category;
      }
    }

    return b;
  };



  /* 2) ボタン設置 & ハンドラ ----------------------- */
  const pasteBtn = document.createElement("button");
  pasteBtn.id = "paste-build";
  pasteBtn.textContent = "📋 Paste JSON Build";
  pasteBtn.onclick = async () => {
    let txt = "";
    try {
      txt = (await navigator.clipboard.readText()).trim();
    } catch {
      alert("クリップボードの読み取りに失敗しました。ブラウザ設定をご確認ください。");
      return;
    }
    if (!txt) { alert("クリップボードにテキストがありません。"); return; }

    let raw;
    try { raw = JSON.parse(txt); }
    catch { alert("JSON の解析に失敗しました。"); return; }

    const arr = Array.isArray(raw) ? raw : [raw];
    const list = lsGet(BUILD_KEY, "build", []);
    arr.forEach(r => list.push(convertClipBuild(r)));
    lsSet(BUILD_KEY, "build", list);
    renderBuilds();                /* 画面を再描画 */
  };

  g.main.appendChild(pasteBtn);
}

/*================== 5. STORAGE I/O ==================*/
function renderStorageIO(){
  g.main.innerHTML=`
  <h2>ストレージ入出力</h2>
  <section><h3>エクスポート</h3><button id="btn-export">全データを書き出し (JSON)</button></section>
  <section><h3>インポート</h3>
    <textarea id="import-area" rows="6" style="width:100%;" placeholder="ここに JSON を貼り付け"></textarea><br>
    <button id="btn-import">読み込み</button>
  </section>
<section><h3>チェック状況インポート</h3>
  <textarea id="import-checked" rows="6" style="width:100%;"
            placeholder="Kuva Bramma\nKuva Hek\nSampotes …"></textarea><br>
  <button id="btn-import-checked">チェック済みにする</button>
</section>
  <section><h3>削除</h3><button id="btn-clear" style="background:#d33;color:#fff;">Warframe Item Tracker データを全削除</button></section>`;

  g.main.querySelector("#btn-export").onclick=()=>{
    const data={};Object.keys(localStorage).filter(k=>k.startsWith("wf:")).forEach(k=>data[k]=localStorage.getItem(k));
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="wf_data.json";a.click();
  };
  g.main.querySelector("#btn-import").onclick=()=>{
    try{
      const obj=JSON.parse(g.main.querySelector("#import-area").value.trim());
      Object.entries(obj).forEach(([k,v])=>k.startsWith("wf:")&&localStorage.setItem(k,v));
      alert("読み込みました。再読込してください");
    }catch{alert("JSON 解析失敗");}
  };
  /* ===== 追加: チェック状況インポート ===== */
    g.main.querySelector("#btn-import-checked").onclick = () => {
      const txt = g.main.querySelector("#import-checked").value.trim();
      if (!txt) { alert("入力が空です"); return; }

      const lines = txt.split(/\r?\n/)
                       .map(s => s.trim())
                       .filter(Boolean);
      const norm = s => s.toLowerCase();
      let hit = 0, miss = [];

      lines.forEach(name => {
        const itm = g.flat.find(
          x => norm(x.name || x.label || x.id) === norm(name)
        );
        if (itm) {
          localStorage.setItem(`wf:checked:${itm.id}`, "true");
          hit++;
        } else {
          miss.push(name);
        }
      });

      let msg = `${hit} 件をチェック済みにしました。`;
      if (miss.length) msg += `\n未識別: ${miss.join(", ")}`;
      alert(msg + "\nチェックリストを開き直すと反映されます。");
    };

  g.main.querySelector("#btn-clear").onclick=()=>{if(confirm("本当に削除しますか？")){
    Object.keys(localStorage).filter(k=>k.startsWith("wf:")).forEach(k=>localStorage.removeItem(k));
    alert("削除しました。再読込してください");
  }};
}

/*================== 6. MENU + bootstrap ==================*/
function renderMenu(data){
  /* --- MENU_ORDER に従い並べ替え ------------------------- */
  data.menus.sort((a, b) => {
    const ai = MENU_ORDER.indexOf(a.id);
    const bi = MENU_ORDER.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  /* === 0) 全横断検索メニューを生成 ======================== */
  /* 除外したいメニュー id をここで列挙 */
  const EXCLUDE_IDS = ["kuva","tenet","coda"];

  const globalMenu = {
    id:   "search_all",
    title:"Warframe Item Tracker",
    columns:[
      {key:"name",     label:"名前",   type:"text", mobileDefault:true},
      {key:"category", label:"カテゴリ", type:"text", mobileDefault:true}
    ],
    items:[]
  };
  /* 既存メニューを走査して items をコピーし category を付与（除外 ID を無視） */
  data.menus
      .filter(m => !EXCLUDE_IDS.includes(m.id))
      .forEach(m=>{
        m.items?.forEach(it=>{
          globalMenu.items.push({...it, category:m.title});
        });
      });

  /* 名前順にソート（item.name が無い場合は label / id を fallback） */
  globalMenu.items.sort((a,b)=>
    (a.name || a.label || a.id).localeCompare(b.name || b.label || b.id, "ja")
  );

  g.data = data;
  /* ---- ①  g.flat を (id) でユニーク化しつつ category / variant を補完 ---- */
  const map = new Map();                         // id → item

  data.menus.forEach(menu => menu.items?.forEach(src => {
    const id   = src.id;
    const item = { ...src };                     // 浅クローン

    /* a) category をまだ持っていなければメニュータイトルで補完
          Kuva/Tenet/Coda メニューは除外           */
    if (!item.category && !EXCLUDE_IDS.includes(menu.id)) {
      item.category = menu.title;
    }

    /* b) ユニーク化 & マージ                         */
    if (!map.has(id)) {
      map.set(id, item);                         // 初出
    } else {
      const base = map.get(id);                  // 既存を取得
      for (const [k, v] of Object.entries(item)) {
        if (v == null || v === "") continue;     // 空値は無視
        if (base[k] == null || base[k] === "") { // 未セットなら採用
          base[k] = v;
        }
      }
      /* category だけは「Kuva 等ではない値」を優先 */
      if (EXCLUDE_IDS.includes(base.category ?? "") && !EXCLUDE_IDS.includes(item.category ?? "")) {
        base.category = item.category;
      }
    }
  }));

  g.flat = Array.from(map.values());

  if(!g.dl){g.dl=document.createElement("datalist");g.dl.id="suggest";document.body.appendChild(g.dl);}g.dl.innerHTML="";
  g.flat.forEach(it=>{const o=document.createElement("option");o.value=it.label||it.name||it.id;g.dl.appendChild(o);});

  g.sidebar.innerHTML="";
  /* globalMenu を先頭に挿入 ------------------------------- */
  const menuDefs=[globalMenu, ...data.menus,
    {id:"builds",title:"Builds",type:"builds"},
    {id:"todo",title:"TODO",type:"todo"},
    {id:"wish",title:"Wish List",type:"wish"},          // ★ 追加
    {id:"storage",title:"ストレージ",type:"storage"}
  ];
  menuDefs.forEach((m,i)=>{
    const div=document.createElement("div");div.textContent=m.title;div.className="menu-item"+(i===0?" active":"");
    div.onclick=()=>{
      g.sidebar.querySelectorAll(".menu-item").forEach(x=>x.classList.remove("active"));div.classList.add("active");
      if(m.type==="todo")renderTodo();
      else if(m.type==="builds")renderBuilds();
      else if(m.type==="wish")renderWishlist();
      else if(m.type==="storage")renderStorageIO();
      else renderTable(m);
      /* スマホのみ自動で閉じる。PC は開いたまま */
      if (innerWidth < 768) closeMenu();
    };
    g.sidebar.appendChild(div);
  });
  /* 最初に全横断検索を表示（= menuDefs[0]） */
  renderTable(menuDefs[0]);
}

/***** 起動 *****/
fetch("items.json").then(r=>r.json()).then(data => {
    /* --- 0) mobileDefault を文字列 → Boolean に変換 --- */
    data.menus?.forEach(menu => {
      menu.columns?.forEach(col => {
        if (typeof col.mobileDefault === "string") {
          col.mobileDefault = (col.mobileDefault.toLowerCase() === "true");
        }
      });
    });

    /* --- 1) 既存アイテムを辞書化しておく ---------------- */
    const dict = {};
    data.menus.forEach(m =>
        m.items?.forEach(it => { if (it && typeof it === "object") dict[it.id] = it; })
    );
    /* --- 2) items 配列に文字列(id)があれば差し替える ---- */
    data.menus.forEach(m => {
      if (Array.isArray(m.items)) {
          m.items = m.items.map(it => typeof it === "string" ? { ...dict[it] } : it);
      }
    });

    /* --- 3) Kuva / Tenet / Coda フラグ付与 ------------- */
    data.menus.forEach(m=>{
      if(["kuva","tenet","coda"].includes(m.id)){
        m.items?.forEach(it=>{
          it.variant  = m.id;            // Kuva/Tenet/Coda 判定
        });
      }
    });

    renderMenu(data);           // ← ここで初めて描画へ
  })
  .catch(()=>g.main.textContent="items.json の読み込みに失敗しました。");
