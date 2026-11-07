/* Làm sạch chữ: xóa note/watermark/link/icon, sửa lời thoại, tìm dòng lặp */
const SEP=' - ';           /* dấu nối giữa "Quyển 1" / "Chương 12" và tên */
const SB=Symbol('sb');     /* dấu ngắt cảnh */
const ZW=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\u2060\uFEFF\u00AD]/g;
const ICON=/[\p{Extended_Pictographic}\uFE0F\u20E3◆◇●○■□▲△▼▽★☆※♠♣♥♦♪♫✦✧❖❀✿❁❂❃☘♡❤]/gu;
const URL_RE=/(?:https?:\/\/|www\.)\S+|(?<![\p{L}\p{N}@])[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.(?:com|net|org|vn|info|xyz|top|vip|club|site|online|cc|jpe?g|png|gif|webp)(?![\p{L}\p{N}])(?:\/\S*)?/giu;
const IMG_TAG=/[(\[（【]\s*(?:hình ảnh|hình|ảnh|image|img|minh họa)[^)\]）】]{0,40}[)\]）】]/giu;
/* Dòng bắt đầu bằng: Note:, Ghi chú:, Lời dịch giả:, Người dịch:, Nguồn:, Editor:... */
const NOTE_HEAD=/^[\s(\[（【<《*_~\-–—]*(?:note|n\.?b|p\.?s|ghi chú|chú thích|chú ý|lưu ý|lời (?:của )?(?:dịch giả|người dịch|tác giả|editor|biên tập|converter|cvt|nhóm dịch)|dịch giả|người dịch|biên dịch|dịch thuật|dịch|edit|editor|biên tập|beta|converter|cvt|nhóm dịch|team dịch|translator|translated by|edited by|nguồn|source|tác giả|t\/n|a\/n|tg|dg)\s*(?:[:：)\]）】>》]|$)/i;
/* Dòng có cụm từ kiểu quảng cáo/watermark (chỉ xét dòng ngắn) */
const KEY_LINE=/bản (?:dịch|edit|convert)[^.]{0,30}(?:nâng cấp|cập nhật|chỉnh sửa|sửa lại|thuộc|chỉ)|(?:nâng cấp|cập nhật|chỉnh sửa) (?:vào )?ngày|chỉ đăng tại|đọc (?:truyện|tại)(?: online)? (?:tại|ở|trên|:)|vui lòng (?:không )?(?:reup|copy|sao chép)|re-?up|ủng hộ (?:nhóm|dịch giả|editor|converter|team)|donate|fan ?page|nhóm dịch|team dịch|dịch bởi|edit bởi|biên tập bởi|converted by|translated by|edited by|hết chương|còn tiếp|bấm (?:vào )?đây|click (?:here|vào)|đăng ký kênh/i;
/* Ghi chú nằm giữa câu: (Note: ...), 【Lời dịch giả: ...】, [1] */
const INLINE_NOTE=/[(\[（【]\s*(?:note|n\.?b|ghi chú|chú thích|dịch giả|người dịch|tác giả|editor|biên tập|t\/n|a\/n|tg|dg|lời dịch|lưu ý)(?![\p{L}\p{N}])[^)\]）】]*[)\]）】]/giu;
const FOOT=/\[\d{1,3}\]|［\d{1,3}］|[①-⑳]/g;
/* Nút quay lại đầu trang đứng trước mỗi chú thích cuối chương: [Lên trên], Back to top... */
const BACK=/^[\s(\[（【<《↑⬆↩]*(?:lên trên|về đầu(?: trang)?|lên đầu(?: trang)?|trở về|quay lại|back to top)?[\s)\]）】>》]*$/i;
const SCENE=/^[\s*＊\-–—=~_#─━]{3,}$/;
const HEAD=/^(?:chương|chuong|chapter|hồi|hoi)\s*\d+/i;
const TITLE_RE=/^(chương|chuong|chapter|hồi|hoi)\s*(\d+)\s*[:：.\-–—]*\s*(.*)$/i;
const VOL_RE=/^(?:quyển|quyen|tập|tap|vol(?:ume)?\.?)\s*(\d+)\s*[:：.\-–—]*\s*(.*)$/i;

const key=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const repKey=t=>t.toLowerCase().replace(/\d+/g,'#');
const norm=s=>s.replace(ZW,'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const hasText=s=>/[\p{L}\p{N}]/u.test(s);

/* "Chương 12: Tên" → "Chương 12 - Tên" (chuẩn hóa); không nhận ra thì giữ nguyên */
function chapterHeading(c){
  const m=TITLE_RE.exec(c.title);if(!m)return c.title;
  const w=/^h/i.test(m[1])?'Hồi':'Chương';
  return m[3]?`${w} ${m[2]}${SEP}${m[3]}`:`${w} ${m[2]}`;
}
function parseVol(name,i){
  const m=VOL_RE.exec(name.trim());
  return m?{num:+m[1],name:m[2].trim()}:{num:i+1,name:name.trim()};
}
const volHeading=v=>`Quyển ${v.num}`+(v.name?SEP+v.name:'');

/* Tìm các dòng lặp lại ở nhiều chương (thường là watermark) để người dùng tick xóa */
function findRepeats(chapters){
  const N=chapters.length,edge=new Map(),mid=new Map();
  for(const ch of chapters){
    const seen=new Set(),n=ch.lines.length;
    ch.lines.forEach((l,i)=>{
      const t=norm(l);if(t.length<8||t.length>200)return;
      const k=repKey(t);if(seen.has(k))return;seen.add(k);
      const m=(i<4||i>=n-4)?edge:mid,e=m.get(k)||{k,t,c:0};e.c++;m.set(k,e);
    });
  }
  const te=Math.max(3,Math.ceil(N*.08)),tm=Math.max(6,Math.ceil(N*.3)),out=new Map();
  for(const e of edge.values())if(e.c>=te)out.set(e.k,e);
  for(const e of mid.values())if(e.c>=tm&&!out.has(e.k))out.set(e.k,e);
  return[...out.values()].sort((a,b)=>b.c-a.c).slice(0,40);
}

/* o = {notes,links,icons,quotes,sceneBreak,custom,repeats:Set}. Trả về {cleanChapter, st} */
function makeCleaner(o){
  const custom=(o.custom||'').split('\n').map(s=>s.trim()).filter(Boolean).map(s=>{
    try{return new RegExp(/^re:/i.test(s)?s.slice(3):s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')}catch{return null}
  }).filter(Boolean);
  const st={notes:0,links:0,icons:0,quotes:0,repeat:0,custom:0,samples:[]},seen=new Set();
  const log=(k,t)=>{st[k]++;if(st.samples.length<400&&!seen.has(t)){seen.add(t);st.samples.push([k,t])}};

  /* Trả về chuỗi sạch, SB (ngắt cảnh) hoặc null (bỏ dòng) */
  function cleanLine(raw){
    let t=norm(raw);if(!t)return null;
    if(o.repeats&&o.repeats.has(repKey(t))){log('repeat',raw);return null}
    if(custom.some(r=>r.test(t))){log('custom',raw);return null}
    if(o.icons){
      const u=t.replace(ICON,'').replace(/\s+/g,' ').trim();
      if(u!==t){st.icons++;if(!u){seen.add(raw);return null}t=u}
    }
    if(o.links){
      const u=t.replace(URL_RE,'').replace(IMG_TAG,'').replace(/\s+/g,' ').trim();
      if(u!==t){if(!hasText(u)||(u.length<60&&/(?:tại|ở|trên|link|nguồn|xem|đọc)[\s:：]*$/i.test(u))){log('links',raw);return null}st.links++;t=u}
    }
    if(SCENE.test(t)&&t.replace(/\s/g,'').length>=3)return o.sceneBreak?SB:null;
    if(!hasText(t)&&!/["“”.…?!]/.test(t))return null;
    if(o.notes){
      if(NOTE_HEAD.test(t)||(t.length<=200&&KEY_LINE.test(t))){log('notes',raw);return null}
      const u=t.replace(INLINE_NOTE,'').replace(FOOT,'').replace(/\s+/g,' ').trim();
      if(u!==t){st.notes++;if(!hasText(u))return null;t=u}
    }
    if(o.quotes){
      let u=t.replace(/[“”„‟«»「」『』]/g,'"');
      const base=u;
      u=u.replace(/\*{1,3}([^*]+?)\*{1,3}/g,(m,a,off)=>{
        if(!hasText(a))return m;
        if((base.slice(0,off).match(/"/g)||[]).length%2)return a.trim(); /* đang trong ngoặc kép: chỉ bỏ dấu * */
        st.quotes++;return '"'+a.trim()+'"';
      }).replace(/\*+/g,'');
      t=u.trim();
    }
    return t||null;
  }

  /* Bỏ dòng tiêu đề lặp lại ở đầu chương (vì sẽ tự thêm tiêu đề chuẩn) */
  function dropHead(out,title){
    const k=key(title);
    for(let i=0;i<2&&out.length;i++){
      const s=out[0];if(s===SB){out.shift();continue}
      const ks=key(s);
      if(HEAD.test(s)||ks===k||(ks.length>=4&&k.endsWith(ks)))out.shift();else break;
    }
    while(out[0]===SB)out.shift();
  }

  function cleanChapter(ch){
    const out=[];
    for(const raw of ch.lines){
      const r=norm(raw);
      if(o.notes&&r&&BACK.test(r)&&/[a-zA-Zê]/.test(r)){
        if(!out.length){st.notes++;continue}   /* nằm đầu chương: chỉ bỏ dòng này */
        log('notes','[Lên trên] và toàn bộ chú thích cuối chương');break; /* từ đây trở xuống là chú thích */
      }
      const t=cleanLine(raw);if(t===null)continue;
      const last=out[out.length-1];
      if(t===SB&&(!out.length||last===SB))continue;
      if(t===last&&t!==SB&&t.length>=25)continue; /* dòng giống hệt dòng liền trước (bị lặp) */
      out.push(t);
    }
    while(out[out.length-1]===SB)out.pop();
    dropHead(out,ch.title);
    return out;
  }
  return{cleanChapter,st};
}
