/* Dựng EPUB mới chỉ chứa các chương từ A đến B */
const REF=/(?:src|href|xlink:href)\s*=\s*["']([^"'#][^"']*)["']|url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi;

function findRefs(text,basePath){
  const dir=basePath.replace(/[^/]*$/,''),out=new Set();let m;
  REF.lastIndex=0;
  while((m=REF.exec(text))){
    const h=m[1]||m[2]||m[3];
    if(!h||/^(https?:|data:|mailto:|#)/i.test(h))continue;
    out.add(resolvePath(dir,h));
  }
  return out;
}

/* Xoá nội dung trước neo (keepAfter) hoặc từ neo trở đi. Trả null nếu không parse được. */
function trimXhtml(text,ops){
  let doc;try{doc=parseXml(text,'application/xhtml+xml')}catch{return null}
  const body=doc.getElementsByTagName('body')[0];if(!body)return null;
  for(const{frag,keepAfter}of ops){
    let id=frag;try{id=decodeURIComponent(frag)}catch{}
    const el=[...doc.querySelectorAll('[id],[name]')].find(e=>e.getAttribute('id')===id||e.getAttribute('name')===id);
    if(!el)continue;
    let n=el;
    while(n&&n!==body){
      const par=n.parentNode,side=keepAfter?'previousSibling':'nextSibling';
      while(n[side])par.removeChild(n[side]);
      n=par;
    }
    if(!keepAfter)el.parentNode.removeChild(el);
  }
  const empty=!body.textContent.trim()&&!body.querySelector('img,image,svg');
  return{empty,text:'<?xml version="1.0" encoding="utf-8"?>\n'+new XMLSerializer().serializeToString(doc)};
}

async function cutEpub(book,a,b,onProgress=()=>{}){
  const all=book.chapters,sel=all.filter(c=>c.n>=a&&c.n<=b);
  if(!sel.length)throw new Error('Không có chương nào trong khoảng này');
  const first=sel[0],last=sel[sel.length-1],next=all[all.indexOf(last)+1];
  const start=first.spineIdx;
  const cutAfter=next&&next.frag?next:null; /* chương kế bắt đầu giữa file → file đó chỉ lấy phần trước neo */
  const end=cutAfter?Math.max(next.spineIdx,last.spineIdx)+1:Math.max(next?next.spineIdx:book.spine.length,last.spineIdx+1);
  let keep=book.spine.slice(start,end);

  /* Gom file cần giữ: các chương + CSS/ảnh/font mà chúng dùng + ảnh bìa */
  const byPath={};Object.values(book.manifest).forEach(i=>{byPath[i.path]=i});

  /* Cắt theo neo #id khi nhiều chương nằm chung 1 file */
  const override=new Map(),ops={};
  if(first.frag)(ops[first.path]=ops[first.path]||[]).push({frag:first.frag,keepAfter:true});
  if(cutAfter)(ops[next.path]=ops[next.path]||[]).push({frag:next.frag,keepAfter:false});
  for(const path of Object.keys(ops)){
    const f=byPath[path]&&book.zip.file(path);if(!f)continue;
    const r=trimXhtml(await f.async('string'),ops[path]);
    if(!r)continue; /* không cắt được thì giữ nguyên cả file */
    if(r.empty)keep=keep.filter(i=>i.path!==path);else override.set(path,r.text);
  }
  if(!keep.length)throw new Error('Không có nội dung để cắt');
  const files=new Map();keep.forEach(it=>files.set(it.path,it));
  const queue=[...keep];
  while(queue.length){
    const it=queue.shift();
    if(!/html|css|svg/.test(it.type))continue;
    const f=book.zip.file(it.path);if(!f)continue;
    for(const p of findRefs(override.get(it.path)??await f.async('string'),it.path)){
      const r=byPath[p];
      if(!r||files.has(p)||/html|dtbncx/.test(r.type))continue;
      files.set(p,r);queue.push(r);
    }
  }
  if(book.cover&&!files.has(book.cover.path))files.set(book.cover.path,book.cover);
  const keepIds=new Set([...files.values()].map(i=>i.id));

  /* OPF mới */
  const title=`${book.title} (Chương ${first.n}–${last.n})`;
  const opf=book.opf.cloneNode(true);
  const man=opf.getElementsByTagName('manifest')[0];
  for(const it of [...man.getElementsByTagName('item')])if(!keepIds.has(it.getAttribute('id')))man.removeChild(it);
  const mk=(id,href,type,props)=>{
    const e=opf.createElementNS(man.namespaceURI,'item');
    e.setAttribute('id',id);e.setAttribute('href',href);e.setAttribute('media-type',type);
    if(props)e.setAttribute('properties',props);man.appendChild(e);
  };
  mk('cut-ncx','toc.ncx','application/x-dtbncx+xml');
  mk('cut-nav','nav.xhtml','application/xhtml+xml','nav');
  const sp=opf.getElementsByTagName('spine')[0];
  while(sp.firstChild)sp.removeChild(sp.firstChild);
  sp.setAttribute('toc','cut-ncx');
  keep.forEach(it=>{const r=opf.createElementNS(sp.namespaceURI,'itemref');r.setAttribute('idref',it.id);sp.appendChild(r)});
  const guide=opf.getElementsByTagName('guide')[0];if(guide)guide.parentNode.removeChild(guide);
  const t=opf.getElementsByTagNameNS('*','title')[0];if(t)t.textContent=title;
  const opfText='<?xml version="1.0" encoding="utf-8"?>\n'+new XMLSerializer().serializeToString(opf).replace(/^<\?xml[^>]*\?>\s*/,'');

  /* Mục lục mới */
  const link=c=>book.spine[c.spineIdx].href+(c.frag?'#'+c.frag:'');
  const li=sel.map(c=>`<li><a href="${esc(link(c))}">${esc(c.title)}</a></li>`).join('');
  const nav=`<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc" id="toc"><h1>Mục lục</h1><ol>${li}</ol></nav></body></html>`;
  const pts=sel.map((c,i)=>`<navPoint id="n${i+1}" playOrder="${i+1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${esc(link(c))}"/></navPoint>`).join('');
  const ncx=`<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(book.uid)}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${pts}</navMap></ncx>`;

  /* Ghi zip: mimetype đầu tiên, không nén */
  const nz=new JSZip();
  const put=(n,d,o={})=>nz.file(n,d,{createFolders:false,...o});
  put('mimetype','application/epub+zip',{compression:'STORE'});
  put('META-INF/container.xml',book.containerText);
  put(book.opfPath,opfText);
  put(book.opfDir+'nav.xhtml',nav);
  put(book.opfDir+'toc.ncx',ncx);
  let done=0;
  for(const p of files.keys()){
    const f=book.zip.file(p);
    if(f)put(p,override.get(p)??await f.async('uint8array'));
    onProgress(Math.round(++done/files.size*90));
  }
  const blob=await nz.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
  const name=`${book.title} - C${first.n}-${last.n}.epub`.replace(/[\\/:*?"<>|]/g,'');
  return{blob,name,count:sel.length};
}
