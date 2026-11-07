/* Dựng EPUB mới từ đầu: mỗi quyển = trang "Quyển - Tên" + Mục lục bấm được + các chương (chỉ chữ) */
const CSS=`body{margin:5%;line-height:1.6;font-family:serif}
h1,h2{text-align:center;line-height:1.3}h1{font-size:1.6em;margin:1.5em 0 .8em}h2{font-size:1.25em;margin:1em 0}
p{margin:.6em 0;text-indent:1.2em;text-align:justify}p.sb{text-align:center;text-indent:0;margin:1em 0}
ol.toc{list-style:none;padding:0}ol.toc li{margin:.4em 0}ol.toc a{text-decoration:underline}a{color:inherit}`;

const page=(title,body)=>`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="vi" xml:lang="vi"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
const link=p=>`<a href="${p.id}.xhtml">${esc(p.title)}</a>`;

/* vols: [{num,name,chapters:[{title,lines}]}] → {blob,count} */
async function buildEpub({title,author,vols,onProgress=()=>{}}){
  if(!vols.length)throw new Error('Không có chương nào để tạo file');
  const pages=[],tree=[];let ci=0;
  for(const [vi,v] of vols.entries()){
    const vp={id:'v'+(vi+1),title:volHeading(v)};
    const kids=v.chapters.map(c=>({id:'c'+(++ci),title:c.title,lines:c.lines}));
    pages.push({...vp,body:`<h1>${esc(vp.title)}</h1><h2>Mục lục</h2><ol class="toc">${kids.map(k=>`<li>${link(k)}</li>`).join('')}</ol>`});
    kids.forEach(k=>pages.push({...k,body:`<h2>${esc(k.title)}</h2>`+k.lines.map(l=>l===SB?'<p class="sb">* * *</p>':`<p>${esc(l)}</p>`).join('')}));
    tree.push({...vp,kids});
  }
  const uid='urn:uuid:'+(crypto.randomUUID?crypto.randomUUID():Date.now());
  const nav=page(title,`<nav epub:type="toc" id="toc"><h1>Mục lục</h1><ol>${tree.map(v=>`<li>${link(v)}<ol>${v.kids.map(k=>`<li>${link(k)}</li>`).join('')}</ol></li>`).join('')}</ol></nav>`);
  let po=0;
  const pt=(p,inner='')=>`<navPoint id="n${++po}" playOrder="${po}"><navLabel><text>${esc(p.title)}</text></navLabel><content src="${p.id}.xhtml"/>${inner}</navPoint>`;
  const ncx=`<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${esc(uid)}"/></head><docTitle><text>${esc(title)}</text></docTitle><navMap>${tree.map(v=>{const head=pt(v).replace('</navPoint>','');return head+v.kids.map(k=>pt(k)).join('')+'</navPoint>'}).join('')}</navMap></ncx>`;
  const opf=`<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="vi"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${esc(uid)}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dc:language>vi</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/,'Z')}</meta></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${pages.map(p=>`<item id="${p.id}" href="${p.id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine toc="ncx">${pages.map(p=>`<itemref idref="${p.id}"/>`).join('')}</spine></package>`;

  /* Ghi zip: mimetype đầu tiên, không nén */
  const z=new JSZip();
  z.file('mimetype','application/epub+zip',{compression:'STORE'});
  z.file('META-INF/container.xml','<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  z.file('OEBPS/content.opf',opf);z.file('OEBPS/nav.xhtml',nav);z.file('OEBPS/toc.ncx',ncx);z.file('OEBPS/style.css',CSS);
  pages.forEach((p,i)=>{z.file(`OEBPS/${p.id}.xhtml`,page(p.title,p.body));if(i%200===0)onProgress(Math.round(i/pages.length*60))});
  const blob=await z.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'},m=>onProgress(60+Math.round(m.percent*.4)));
  return{blob,count:ci};
}
