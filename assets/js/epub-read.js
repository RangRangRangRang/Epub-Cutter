/* Đọc EPUB: metadata, spine, mục lục, danh sách chương */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function parseXml(s,type='application/xml'){
  const d=new DOMParser().parseFromString(s,type);
  if(d.getElementsByTagName('parsererror').length)throw new Error('Cấu trúc EPUB bị lỗi');
  return d;
}
function resolvePath(base,href){
  let h=href.split('#')[0].split('?')[0];
  try{h=decodeURIComponent(h)}catch{}
  const out=[];
  for(const p of (base+h).split('/')){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p)}
  return out.join('/');
}
const clean=s=>s.replace(/\s+/g,' ').trim();

async function readNav(zip,item){
  const text=await zip.file(item.path).async('string');
  let doc;try{doc=parseXml(text,'application/xhtml+xml')}catch{doc=new DOMParser().parseFromString(text,'text/html')}
  const navs=[...doc.getElementsByTagName('nav')];
  const nav=navs.find(n=>(n.getAttribute('epub:type')||'').includes('toc'))||navs[0];
  if(!nav)return[];
  const dir=item.path.replace(/[^/]*$/,'');
  return [...nav.getElementsByTagName('a')].filter(a=>a.getAttribute('href')).map(a=>{
    const h=a.getAttribute('href');
    return{title:clean(a.textContent),path:resolvePath(dir,h),frag:h.split('#')[1]||''};
  });
}
async function readNcx(zip,item){
  const doc=parseXml(await zip.file(item.path).async('string'));
  const dir=item.path.replace(/[^/]*$/,'');
  return [...doc.getElementsByTagName('navPoint')].map(p=>{
    const lab=p.getElementsByTagName('navLabel')[0]?.textContent||'';
    const src=p.getElementsByTagName('content')[0]?.getAttribute('src')||'';
    return{title:clean(lab),path:resolvePath(dir,src),frag:src.split('#')[1]||''};
  }).filter(e=>e.path);
}

async function readEpub(file){
  let zip;
  try{zip=await JSZip.loadAsync(file)}catch{throw new Error('File này không phải EPUB hợp lệ')}
  const cf=zip.file('META-INF/container.xml');
  if(!cf)throw new Error('File này không phải EPUB hợp lệ');
  const containerText=await cf.async('string');
  const opfPath=parseXml(containerText).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  const of=opfPath&&zip.file(opfPath);
  if(!of)throw new Error('Không tìm thấy file mô tả sách (.opf)');
  const opf=parseXml(await of.async('string'));
  const opfDir=opfPath.replace(/[^/]*$/,'');
  const dc=n=>opf.getElementsByTagNameNS('*',n)[0]?.textContent.trim()||'';

  const manifest={};
  for(const it of opf.getElementsByTagName('item')){
    const id=it.getAttribute('id'),href=it.getAttribute('href')||'';
    manifest[id]={id,href,path:resolvePath(opfDir,href),type:it.getAttribute('media-type')||'',props:it.getAttribute('properties')||''};
  }
  const spine=[...opf.getElementsByTagName('itemref')].map(r=>manifest[r.getAttribute('idref')]).filter(Boolean);
  const spineIdx={};spine.forEach((it,i)=>{spineIdx[it.path]=i});

  const items=Object.values(manifest);
  const navItem=items.find(i=>i.props.split(' ').includes('nav'));
  const ncxItem=manifest[opf.getElementsByTagName('spine')[0]?.getAttribute('toc')]||items.find(i=>i.type==='application/x-dtbncx+xml');
  let entries=[];
  try{if(navItem&&zip.file(navItem.path))entries=await readNav(zip,navItem)}catch{}
  if(!entries.length&&ncxItem&&zip.file(ncxItem.path))entries=await readNcx(zip,ncxItem);
  entries=entries.filter(e=>e.path in spineIdx).map(e=>({...e,spineIdx:spineIdx[e.path]}));
  if(!entries.length)throw new Error('Không tìm thấy mục lục');

  /* Nhận diện số chương thật; không được thì đếm theo thứ tự mục lục */
  const re=/(?:chương|chuong|chapter|hồi|hoi)\s*(\d+)/i;
  const nums=entries.map(e=>{const m=re.exec(e.title);return m?+m[1]:null});
  const hits=nums.filter(n=>n!==null);
  const increasing=hits.every((n,i)=>i===0||n>=hits[i-1]); /* cho phép lặp: 1 chương tách nhiều phần */
  const SKIP=/^(bìa|cover|mục lục|table of contents|contents|giới thiệu|lời nói đầu|lời dịch|lời tác giả|thông tin|credits)/i;
  const owner=entries.map(()=>null); /* owner[i] = chương sở hữu mục lục thứ i (null = bỏ nội dung) */
  let chapters=[],mode;
  if(hits.length>=entries.length/2&&increasing){
    mode='number';
    entries.forEach((e,i)=>{
      if(nums[i]===null)return; /* mục không có số (bìa, quyển...) bỏ qua */
      const prev=chapters[chapters.length-1];
      if(prev&&prev.n===nums[i]){prev.parts++;owner[i]=prev;return} /* phần (2), (3) của cùng chương */
      const c={...e,n:nums[i],parts:1};chapters.push(c);owner[i]=c;
    });
  }else{
    mode='order';
    entries.forEach((e,i)=>{if(SKIP.test(e.title))return;const c={...e,n:chapters.length+1,parts:1};chapters.push(c);owner[i]=c});
  }
  if(!chapters.length)throw new Error('Không tìm thấy chương nào trong mục lục');

  let cover=items.find(i=>i.props.split(' ').includes('cover-image'));
  if(!cover){
    const m=[...opf.getElementsByTagName('meta')].find(x=>x.getAttribute('name')==='cover');
    cover=m&&manifest[m.getAttribute('content')];
  }
  return{zip,entries,owner,opf,opfPath,opfDir,containerText,manifest,spine,chapters,mode,cover,
    title:dc('title')||file.name.replace(/\.epub$/i,''),author:dc('creator')||'Không rõ tác giả',uid:dc('identifier')||'cut-'+Date.now(),
    total:chapters.length,min:chapters[0].n,max:chapters[chapters.length-1].n};
}

/* ===== Rút chữ từng chương (bỏ ảnh, script, style) ===== */
const BLK=/^(?:p|div|h[1-6]|li|ul|ol|blockquote|section|article|tr|table|pre|figure|figcaption|dd|dt|center|header|footer)$/;
const SKIPT=/^(?:script|style|head|title|svg|img|image|rt|rp)$/;
function parseDoc(text){try{return parseXml(text,'application/xhtml+xml')}catch{return new DOMParser().parseFromString(text,'text/html')}}

/* Trả về mảng {line} (một đoạn văn) và {mark} (vị trí neo #id) theo thứ tự đọc */
function docLines(doc){
  const out=[];let buf='';
  const flush=()=>{const t=clean(buf);buf='';if(t)out.push({line:t})};
  const walk=n=>{
    for(const c of n.childNodes){
      if(c.nodeType===3){buf+=c.nodeValue;continue}
      if(c.nodeType!==1)continue;
      const tag=c.localName.toLowerCase(),id=c.getAttribute('id')||c.getAttribute('name');
      if(id){flush();out.push({mark:id})}
      if(SKIPT.test(tag))continue;
      const blk=BLK.test(tag)||tag==='br';
      if(blk)flush();
      if(tag!=='br')walk(c);
      if(blk)flush();
    }
  };
  walk(doc.getElementsByTagName('body')[0]||doc.documentElement);
  flush();return out;
}

/* Gán chữ vào book.chapters[i].lines; nội dung của mục không phải chương bị bỏ */
async function extractChapters(book){
  const at={};
  book.entries.forEach((e,i)=>{let f=e.frag;try{f=decodeURIComponent(f)}catch{}(at[e.path]=at[e.path]||new Map()).set(f,i)});
  book.chapters.forEach(c=>{c.lines=[]});
  let cur=null;
  for(const it of book.spine){
    const f=book.zip.file(it.path);
    if(!f||!/html/.test(it.type)||it.props.split(' ').includes('nav'))continue;
    const st=at[it.path];
    if(st&&st.has(''))cur=book.owner[st.get('')];
    let items;try{items=docLines(parseDoc(await f.async('string')))}catch{continue}
    for(const x of items){
      if(x.mark!==undefined){if(st&&st.has(x.mark))cur=book.owner[st.get(x.mark)];continue}
      if(cur)cur.lines.push(x.line);
    }
  }
}
