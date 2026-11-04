/* Giao diện: chọn file, nhập khoảng chương, cắt, chia sẻ/lưu */
const $=s=>document.querySelector(s);
let book=null,outFile=null,pickStart=null;

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2200)}
function show(id,on=true){$(id).classList.toggle('hide',!on)}

/* ===== Chọn file ===== */
$('#drop').onclick=()=>$('#file').click();
$('#drop').ondragover=e=>{e.preventDefault();$('#drop').classList.add('over')};
$('#drop').ondragleave=()=>$('#drop').classList.remove('over');
$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('over');pick(e.dataTransfer.files[0])};
$('#file').onchange=e=>{pick(e.target.files[0]);e.target.value=''};
async function pick(f){
  if(!f)return;
  if(!/\.epub$/i.test(f.name))return toast('Đây không phải file .epub');
  try{toast('Đang đọc file…');load(await readEpub(f))}
  catch(e){console.error(e);toast(e.message||'Không đọc được file này')}
}
function load(b){
  book=b;
  $('#cv').textContent=[...b.title][0]||'K';
  $('#bt').textContent=b.title;
  $('#bm').textContent=`${b.author} · ${b.total} chương`+(b.mode==='order'?' · đếm theo thứ tự mục lục':'');
  $('#a').min=$('#b').min=b.min;$('#a').max=$('#b').max=b.max;
  $('#a').value=b.min;$('#b').value=Math.min(b.min+99,b.max);
  const chips=[];
  for(let s=b.min;s<=b.max;s+=100)chips.push([s,Math.min(s+99,b.max)]);
  $('#chips').innerHTML='<span class="meta" style="align-self:center">Chọn nhanh:</span>'+chips.map(([x,y])=>`<button class="chip" data-a="${x}" data-b="${y}">${x}–${y}</button>`).join('')+`<button class="chip" data-a="${b.min}" data-b="${b.max}">Tất cả</button>`;
  document.querySelectorAll('.chip[data-a]').forEach(c=>c.onclick=()=>{$('#a').value=c.dataset.a;$('#b').value=c.dataset.b;update()});
  show('#s1',false);['#s2','#s3','#s4'].forEach(i=>show(i));show('#s5',false);
  pickStart=null;update();
}
$('#change').onclick=()=>{book=null;show('#s1');['#s2','#s3','#s4','#s5'].forEach(i=>show(i,false))};

/* ===== Khoảng chương ===== */
function range(){
  let a=Math.round(+$('#a').value),b=Math.round(+$('#b').value);
  if(!a||!b)return{err:'Nhập đủ số chương bắt đầu và kết thúc.'};
  if(a<book.min||b<book.min||a>book.max||b>book.max)return{err:`Số chương phải từ ${book.min} đến ${book.max}.`};
  if(a>b)[a,b]=[b,a];
  const list=book.chapters.filter(c=>c.n>=a&&c.n<=b);
  if(!list.length)return{err:'Không có chương nào trong khoảng này.'};
  return{a,b,list};
}
function update(){
  if(!book)return;
  const r=range();
  $('#err').textContent=r.err||'';
  $('#cut').disabled=!!r.err;
  if(r.err){$('#pv').innerHTML='';renderList(0,0);return}
  const f=r.list[0],l=r.list[r.list.length-1];
  $('#pv').innerHTML=`Sẽ cắt <b>${r.list.length} chương</b><br><small>Từ: ${esc(f.title)}<br>Đến: ${esc(l.title)}</small>`;
  renderList(r.a,r.b);
}
function renderList(a,b){
  const q=$('#q').value.trim().toLowerCase();
  $('#list').innerHTML=book.chapters.filter(c=>!q||`${c.n} ${c.title}`.toLowerCase().includes(q))
   .map(c=>`<div class="ch ${c.n>=a&&c.n<=b?'in':''}" data-n="${c.n}"><span>Ch.${c.n}</span><span>${esc(c.title)}</span></div>`).join('')||'<div class="ch">Không tìm thấy.</div>';
  document.querySelectorAll('.ch[data-n]').forEach(el=>el.onclick=()=>{
    const n=+el.dataset.n;
    if(pickStart===null){$('#a').value=n;pickStart=n;toast('Đã chọn chương đầu, chạm chương cuối')}
    else{$('#b').value=n;pickStart=null}
    update();
  });
}
$('#a').oninput=$('#b').oninput=update;
$('#q').oninput=()=>{const r=range();renderList(r.a||0,r.b||0)};

/* ===== Cắt ===== */
$('#cut').onclick=async()=>{
  const r=range();if(r.err)return;
  const btn=$('#cut');btn.disabled=true;btn.textContent='Đang cắt…';
  try{
    const o=await cutEpub(book,r.a,r.b,p=>{btn.textContent=`Đang cắt… ${p}%`});
    outFile=new File([o.blob],o.name,{type:'application/epub+zip'});
    $('#fn').textContent=o.name;
    $('#fm').textContent=`${o.count} chương · ${(o.blob.size/1048576).toFixed(1)} MB`;
    show('#s4',false);show('#s5');
    $('#s5').scrollIntoView({behavior:'smooth'});
  }catch(e){console.error(e);$('#err').textContent=e.message||'Không cắt được file này.'}
  finally{btn.textContent='✂️ Cắt & tạo file';btn.disabled=false}
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
$('#again').onclick=()=>{show('#s5',false);show('#s4');$('#s3').scrollIntoView({behavior:'smooth'})};

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
