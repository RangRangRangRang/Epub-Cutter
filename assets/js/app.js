/* Giao diện: nhiều quyển → làm sạch → khoảng chương → tạo epub */
const $=s=>document.querySelector(s);
let items=[],outFile=null,pickStart=null,reps=[];const repOff=new Set();
const natural=(a,b)=>a.localeCompare(b,'vi',{numeric:true});
const tick=()=>new Promise(r=>setTimeout(r,30));
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2600)}
function show(id,on=true){$(id).classList.toggle('hide',!on)}

/* ===== Chọn file (nhiều file) ===== */
$('#drop').onclick=()=>$('#file').click();
$('#drop').ondragover=e=>{e.preventDefault();$('#drop').classList.add('over')};
$('#drop').ondragleave=()=>$('#drop').classList.remove('over');
$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('over');addFiles(e.dataTransfer.files)};
$('#file').onchange=e=>{addFiles(e.target.files);e.target.value=''};
async function addFiles(files){
  const list=[...files].filter(f=>/\.epub$/i.test(f.name)).sort((a,b)=>natural(a.name,b.name));
  if(!list.length)return toast('Chỉ nhận file .epub');
  for(const [i,f] of list.entries()){
    try{
      toast(`Đang đọc ${i+1}/${list.length}: ${f.name}`);await tick();
      const book=await readEpub(f);await extractChapters(book);
      items.push({file:f.name,book,name:'',touched:false});
    }catch(e){console.error(e);toast(`${f.name}: ${e.message||'không đọc được file này'}`)}
  }
  afterChange(true);
}
function guessNames(){
  const story=$('#st').value.trim(),cnt={};
  items.forEach(i=>{cnt[i.book.title]=(cnt[i.book.title]||0)+1});
  const re=story?new RegExp('^'+reEsc(story)+'\\s*[-–:_]*\\s*','i'):null;
  items.forEach(it=>{
    if(it.touched)return;
    let n=(cnt[it.book.title]>1||it.book.title===story)?it.file.replace(/\.epub$/i,''):it.book.title;
    it.name=(re?n.replace(re,''):n).trim();
  });
}
function renderVols(){
  $('#vols').innerHTML=items.map((it,i)=>`<div class="vol"><span class="no">${i+1}</span><div class="vi"><input data-i="${i}" value="${esc(it.name)}" placeholder="Tên quyển (có thể để trống)"><small class="meta">${esc(it.file)} · ${it.book.total} chương</small><div style="margin-top:4px"><button class="btn" data-cv="${i}" style="padding:4px 10px;font-size:13px">🖼 ${it.cover?'Đổi':'Chọn'} ảnh bìa</button>${it.cover?`<img src="${it.cover.url}" alt="" style="height:44px;border-radius:4px;vertical-align:middle;margin-left:8px"><button class="btn" data-cvx="${i}" style="padding:4px 10px;font-size:13px;margin-left:6px">Bỏ</button>`:''}</div></div><button class="mini" data-up="${i}" ${i?'':'disabled'}>▲</button><button class="mini" data-dn="${i}" ${i<items.length-1?'':'disabled'}>▼</button><button class="mini" data-rm="${i}">✕</button></div>`).join('');
}
$('#vols').oninput=e=>{const i=e.target.dataset.i;if(i!==undefined){items[i].name=e.target.value;items[i].touched=true}};
$('#vols').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if(d.cv!==undefined){cvIdx=+d.cv;cvIn.click();return}
  if(d.cvx!==undefined){items[+d.cvx].cover=null;renderVols();return}
  if(d.up!==undefined){const i=+d.up;[items[i-1],items[i]]=[items[i],items[i-1]]}
  else if(d.dn!==undefined){const i=+d.dn;[items[i+1],items[i]]=[items[i],items[i+1]]}
  else if(d.rm!==undefined)items.splice(+d.rm,1);
  afterChange(false);
};
/* Ảnh bìa: chọn ảnh, thu nhỏ còn tối đa 1600px, đổi sang JPEG */
const cvIn=document.createElement('input');cvIn.type='file';cvIn.accept='image/*';cvIn.className='hide';document.body.appendChild(cvIn);
let cvIdx=-1;
async function toJpeg(f){
  const bmp=await createImageBitmap(f),k=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);
  const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.drawImage(bmp,0,0,cv.width,cv.height);
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.9));
  if(!blob)throw new Error('toBlob');
  return new Uint8Array(await blob.arrayBuffer());
}
cvIn.onchange=async e=>{
  const f=e.target.files[0];e.target.value='';
  if(!f||!items[cvIdx])return;
  try{const data=await toJpeg(f);items[cvIdx].cover={data,url:URL.createObjectURL(new Blob([data],{type:'image/jpeg'}))};renderVols()}
  catch(err){console.error(err);toast('Không đọc được ảnh này')}
};
$('#clear').onclick=()=>{items=[];$('#st').value='';afterChange(false)};
function afterChange(guess){
  const has=items.length>0;
  show('#meta1',has);['#s2','#s3','#s4'].forEach(i=>show(i,has));show('#s5',false);
  if(!has){$('#vols').innerHTML='';return}
  if(!$('#st').value)$('#st').value=items[0].book.title;
  if(guess)guessNames();
  renderVols();
  reps=findRepeats(allCh());renderReps();
  const ns=allCh().map(c=>c.n);
  $('#a').placeholder=Math.min(...ns);$('#b').placeholder=Math.max(...ns);
  pickStart=null;update();
}

/* ===== Làm sạch ===== */
function renderReps(){
  $('#reps').innerHTML=reps.length
    ?'<div class="meta">Dòng lặp lại ở nhiều chương (có thể là watermark). Bỏ tick nếu muốn giữ:</div>'+reps.map((r,i)=>`<label class="rep"><input type="checkbox" data-r="${i}" ${repOff.has(r.k)?'':'checked'}><span>${esc(r.t)} <i>×${r.c} chương</i></span></label>`).join('')
    :'<div class="meta">Không thấy dòng nào lặp lại bất thường.</div>';
}
$('#reps').onchange=e=>{const r=reps[e.target.dataset.r];if(r)e.target.checked?repOff.delete(r.k):repOff.add(r.k)};
function readOpts(){
  return{notes:$('#o-notes').checked,links:$('#o-links').checked,icons:$('#o-icons').checked,quotes:$('#o-quotes').checked,
    sceneBreak:$('#o-sb').checked,custom:$('#custom').value,repeats:new Set(reps.filter(r=>!repOff.has(r.k)).map(r=>r.k))};
}

/* ===== Khoảng chương ===== */
const allCh=()=>items.flatMap(i=>i.book.chapters);
function range(){
  const all=allCh();if(!all.length)return{err:'Chưa có chương nào.'};
  const ns=all.map(c=>c.n),min=Math.min(...ns),max=Math.max(...ns);
  let a=Math.round(+$('#a').value)||min,b=Math.round(+$('#b').value)||max;
  if(a>b)[a,b]=[b,a];
  const list=all.filter(c=>c.n>=a&&c.n<=b);
  if(!list.length)return{err:`Không có chương nào trong khoảng ${a}–${b} (sách có chương ${min} đến ${max}).`};
  return{a,b,list,min,max,total:all.length};
}
function update(){
  if(!items.length)return;
  const r=range();
  $('#err').textContent=r.err||'';$('#cut').disabled=!!r.err;
  if(r.err){$('#pv').innerHTML='';$('#list').innerHTML='';return}
  const f=r.list[0],l=r.list[r.list.length-1];
  $('#pv').innerHTML=`Sẽ lấy <b>${r.list.length}/${r.total} chương</b> của <b>${items.length} quyển</b><br><small>Từ: ${esc(f.title)}<br>Đến: ${esc(l.title)}</small>`;
  renderList(r.a,r.b);
}
function renderList(a,b){
  const q=$('#q').value.trim().toLowerCase();
  const rows=allCh().filter(c=>!q||`${c.n} ${c.title}`.toLowerCase().includes(q));
  $('#list').innerHTML=rows.slice(0,600).map(c=>`<div class="ch ${c.n>=a&&c.n<=b?'in':''}" data-n="${c.n}"><span>Ch.${c.n}</span><span>${esc(c.title)}</span></div>`).join('')||'<div class="ch">Không tìm thấy.</div>';
  document.querySelectorAll('.ch[data-n]').forEach(el=>el.onclick=()=>{
    const n=+el.dataset.n;
    if(pickStart===null){$('#a').value=n;pickStart=n;toast('Đã chọn chương đầu, chạm chương cuối')}
    else{$('#b').value=n;pickStart=null}
    update();
  });
}
$('#a').oninput=$('#b').oninput=update;
$('#q').oninput=()=>{const r=range();renderList(r.a||0,r.b||0)};

/* ===== Làm sạch & tạo file ===== */
const LABEL={notes:'Note',links:'Link',icons:'Icon',repeat:'Lặp',custom:'Mẫu'};
$('#cut').onclick=async()=>{
  const r=range();if(r.err)return;
  const btn=$('#cut');btn.disabled=true;btn.textContent='Đang xử lý…';
  try{
    await tick();
    const cl=makeCleaner(readOpts());
    const vols=items.map((it,i)=>({...parseVol(it.name,i),cover:it.cover?it.cover.data:null,
      chapters:it.book.chapters.filter(c=>c.n>=r.a&&c.n<=r.b).map(c=>({title:chapterHeading(c),lines:cl.cleanChapter(c)}))
    })).filter(v=>v.chapters.length);
    const title=$('#st').value.trim()||items[0].book.title;
    const o=await buildEpub({title,author:items[0].book.author,vols,onProgress:p=>{btn.textContent=`Đang tạo… ${p}%`}});
    const part=(r.a>r.min||r.b<r.max)?` - C${r.a}-${r.b}`:'';
    const qs=vols.length>1?` - Q${vols[0].num}-${vols[vols.length-1].num}`:'';
    const name=`${title}${qs}${part}.epub`.replace(/[\\/:*?"<>|]/g,'');
    outFile=new File([o.blob],name,{type:'application/epub+zip'});
    const st=cl.st;
    $('#fn').textContent=name;
    $('#fm').textContent=`${vols.length} quyển · ${o.count} chương · ${(o.blob.size/1048576).toFixed(1)} MB`;
    $('#sum').innerHTML=`Đã xóa: <b>${st.notes}</b> note/dịch giả · <b>${st.links}</b> link · <b>${st.icons}</b> icon · <b>${st.repeat}</b> dòng lặp · <b>${st.custom}</b> theo mẫu riêng<br>Đã sửa <b>${st.quotes}</b> lời thoại`;
    $('#log').innerHTML=st.samples.map(([k,t])=>`<div class="ch"><span>${LABEL[k]}</span><span>${esc(t)}</span></div>`).join('')||'<div class="ch">Không có dòng nào bị xóa hẳn.</div>';
    show('#s4',false);show('#s5');
    $('#s5').scrollIntoView({behavior:'smooth'});
  }catch(e){console.error(e);$('#err').textContent=e.message||'Không tạo được file này.'}
  finally{btn.textContent='✨ Làm sạch & tạo file';btn.disabled=false}
};
function save(){
  const u=URL.createObjectURL(outFile),a=document.createElement('a');
  a.href=u;a.download=outFile.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),10000);
}
$('#save').onclick=()=>{if(outFile){save();toast('Đã lưu file')}};
$('#share').onclick=async()=>{
  if(!outFile)return;
  try{
    if(navigator.canShare&&navigator.canShare({files:[outFile]}))await navigator.share({files:[outFile],title:outFile.name});
    else{save();toast('Máy này không hỗ trợ chia sẻ, đã lưu file')}
  }catch(e){if(e.name!=='AbortError'){save();toast('Không chia sẻ được, đã lưu file')}}
};
$('#again').onclick=()=>{show('#s5',false);show('#s4');$('#s2').scrollIntoView({behavior:'smooth'})};

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
