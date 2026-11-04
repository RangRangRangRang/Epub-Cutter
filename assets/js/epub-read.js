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
  let chapters,mode;
  if(hits.length>=entries.length/2&&increasing){
    mode='number';
    chapters=[];
    entries.forEach((e,i)=>{
      if(nums[i]===null)return; /* mục không có số (bìa, quyển...) bỏ qua */
      const prev=chapters[chapters.length-1];
      if(prev&&prev.n===nums[i]){prev.parts++;return} /* phần (2), (3) của cùng chương */
      chapters.push({...e,n:nums[i],parts:1});
    });
  }else{
    mode='order';
    chapters=entries.map((e,i)=>({...e,n:i+1}));
  }

  let cover=items.find(i=>i.props.split(' ').includes('cover-image'));
  if(!cover){
    const m=[...opf.getElementsByTagName('meta')].find(x=>x.getAttribute('name')==='cover');
    cover=m&&manifest[m.getAttribute('content')];
  }
  return{zip,opf,opfPath,opfDir,containerText,manifest,spine,chapters,mode,cover,
    title:dc('title')||file.name.replace(/\.epub$/i,''),author:dc('creator')||'Không rõ tác giả',uid:dc('identifier')||'cut-'+Date.now(),
    total:chapters.length,min:chapters[0].n,max:chapters[chapters.length-1].n};
}
