(function(root){
  'use strict';
  const W=595.28,H=841.89,M=36,WIDTH=W-2*M;
  const COLORS=['#1262ae','#27a39a','#53ad62','#e2a13b','#7864b6','#278ba0','#ca5f6f','#8d9d45','#d77b43','#697b91'];
  const cpExtra='€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
  const hexText=s=>Array.from(String(s).replace(/\u2212/g,'-')).map(char=>{const code=char.codePointAt(0),index=cpExtra.indexOf(char);return (code<256?code:index>=0?128+index:63).toString(16).padStart(2,'0');}).join('');
  const color=s=>{const hex=s.replace('#','');return [0,2,4].map(i=>(parseInt(hex.slice(i,i+2),16)/255).toFixed(3)).join(' ');};
  const f=n=>Number(n).toFixed(2);
  const integer=n=>new Intl.NumberFormat('pt-BR').format(n);
  function width(s,size=11){return Array.from(String(s)).reduce((n,c)=>{const b=c.normalize('NFD')[0];return n+(/[ilI.,:;'!|]/.test(b)?0.26:/[mwMW@]/.test(b)?0.87:/[ft r]/.test(b)?0.32:/[A-Z0-9]/.test(b)?0.64:0.53)*size;},0);}
  function wrap(s,max,size){const lines=[];let current='';for(const word of String(s??'—').split(/\s+/)){if(width(current?(current+' '+word):word,size)<=max){current=current?current+' '+word:word;continue;}if(current)lines.push(current);current='';for(const char of word){if(width(current+char,size)>max&&current){lines.push(current);current='';}current+=char;}}if(current||!lines.length)lines.push(current);return lines;}
  class PDF {
    constructor(report){this.report=report;this.compact=report.paperFormat==='compact';this.pages=[];this.newPage();}
    newPage(){this.commands=[];this.pages.push(this.commands);this.y=this.compact?70:85;this.rect(0,0,W,this.compact?49:59,'#071a33');this.text('ANÁLISE ELEITORAL PARÁ',M,this.compact?22:26,13,true,'#ffffff');this.text(this.report.headerSubtitle||`${this.report.electionYear||2026} • ${this.report.turn||1}º turno`,M,this.compact?39:45,this.compact?9:10,false,'#b8cbe0');}
    ensure(h){if(this.y+h>H-53)this.newPage();}
    text(s,x,y,size=11,bold=false,ink='#24415f'){this.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color(ink)} rg 1 0 0 1 ${f(x)} ${f(H-y)} Tm <${hexText(s)}> Tj ET`);}
    rect(x,y,w,h,ink){this.commands.push(`${color(ink)} rg ${f(x)} ${f(H-y-h)} ${f(w)} ${f(h)} re f`);}
    line(x1,y1,x2,y2,ink='#dce5ef',thickness=.7){this.commands.push(`${color(ink)} RG ${thickness} w ${f(x1)} ${f(H-y1)} m ${f(x2)} ${f(H-y2)} l S`);}
    paragraph(s,size=11,ink='#54677d'){if(this.compact)size=Math.min(size,10);for(const line of wrap(s,WIDTH,size)){this.ensure(size*1.3);this.text(line,M,this.y,size,false,ink);this.y+=size*(this.compact?1.3:1.4);}this.y+=this.compact?3:5;}
    heading(s,max=WIDTH){const size=this.compact?12:14,lineHeight=this.compact?16:20,lines=wrap(s,max,size);this.ensure(lines.length*lineHeight+16);this.y+=this.compact?6:9;for(const line of lines){this.text(line,M,this.y,size,true,'#0b294d');this.y+=lineHeight;}this.y+=3;}
    section(s,compact=false){if(this.compact){this.ensure(60);}else if(compact){this.ensure(250);this.y+=7;this.line(M,this.y,M+WIDTH,this.y,'#c2d1df');this.y+=8;}else this.newPage();this.heading(s);}
    indicators(items,compact=false,columns=3){compact||=this.compact;const labelSize=compact?9.5:10,valueSize=compact?15:17,labelLine=compact?12:13,valueLine=compact?18:21,noteLine=compact?11:12;
      for(let i=0;i<items.length;i+=columns){const row=items.slice(i,i+columns),cell=(WIDTH-(columns-1)*9)/columns;const h=Math.max(...row.map(item=>(compact?20:31)+wrap(item.value,cell-20,valueSize).length*valueLine+wrap(item.label,cell-20,labelSize).length*labelLine+(item.note?wrap(item.note,cell-20,9).length*noteLine:0)));this.ensure(h+12);row.forEach((item,j)=>{const x=M+j*(cell+9);this.rect(x,this.y,cell,h,'#edf4fb');let y=this.y+(compact?13:18);wrap(item.label,cell-20,labelSize).forEach(line=>{this.text(line,x+10,y,labelSize,true);y+=labelLine;});y+=compact?4:8;const ink=item.color||(item.label.includes('Variação')&&String(item.value).startsWith('+')?'#208a5b':item.label.includes('Variação')&&String(item.value).startsWith('-')?'#bc3030':'#0b4f8a');wrap(item.value,cell-20,valueSize).forEach(line=>{this.text(line,x+10,y,valueSize,true,ink);y+=valueLine;});if(item.note)wrap(item.note,cell-20,9).forEach(line=>{this.text(line,x+10,y,9);y+=noteLine;});});this.y+=h+12;}
    }
    table(block){if(block.pageBreakBefore)this.newPage();const weights=block.widths||block.headers.map(()=>1),sum=weights.reduce((a,b)=>a+b,0),sizes=weights.map(n=>WIDTH*n/sum),size=9.5,lineHeight=this.compact||block.compact?12:13,padding=this.compact?4:block.compact?8:14,charted=Array.isArray(block.comparison);
      const plotIndex=sizes.length-1,plotX=M+sizes.slice(0,-1).reduce((a,b)=>a+b,0)+6,plotWidth=sizes[plotIndex]-12;
      const max=charted?Math.max(1,...block.comparison.flatMap(row=>[row.current,row.previous||0])):1;
      const paired=Array.isArray(block.pairedComparison),pairedMax=paired?Math.max(1,...block.pairedComparison.flatMap(r=>[...r.values,...r.previousValues.filter(v=>v!=null)])):1;
      const inset=Math.max(12,Number(block.cellInset)||12);
      const rowHeight=cells=>Math.max(Math.max(1,...cells.map((s,i)=>wrap(s,sizes[i]-inset,size).length))*lineHeight+padding,charted?28:paired?34:0);
      const titleWidth=WIDTH-Math.max(0,Number(block.titleInset)||0),titleHeight=wrap(block.title,titleWidth,this.compact?12:14).length*(this.compact?16:20)+20;
      this.ensure(titleHeight+rowHeight(block.headers)+(block.rows.length?rowHeight(block.rows[0]):0));this.heading(block.title,titleWidth);
      const paint=(cells,header=false,comparison=null,pair=null,cellColors=[],rowColor=null)=>{const lines=cells.map((s,i)=>wrap(s,sizes[i]-inset,size)),h=rowHeight(cells);if(this.y+h>H-53){this.newPage();this.heading(block.title+' • continuação',titleWidth);if(!header)paint(block.headers,true);}this.rect(M,this.y,WIDTH,h,header?'#173f67':rowColor||'#f4f7fb');let x=M;lines.forEach((parts,i)=>{parts.forEach((line,j)=>this.text(line,x+6,this.y+size+padding/2+j*lineHeight,size,header,header?'#ffffff':cellColors[i]||(/(Variação|Diferença: votos e %)/.test(block.headers[i]||'')&&String(cells[i]).startsWith('+')?'#208a5b':/(Variação|Diferença: votos e %)/.test(block.headers[i]||'')&&String(cells[i]).startsWith('-')?'#bc3030':'#24415f')));x+=sizes[i];});
        if(!header&&comparison){const historical=comparison.previous!=null,top=this.y+(h-(historical?17:7))/2;this.rect(plotX,top,plotWidth,7,'#e4edf6');if(comparison.current>0)this.rect(plotX,top,plotWidth*comparison.current/max,7,'#1262ae');if(historical){this.rect(plotX,top+10,plotWidth,7,'#e4edf6');if(comparison.previous>0)this.rect(plotX,top+10,plotWidth*comparison.previous/max,7,'#9cacbf');}}
        if(!header&&pair){const top=this.y+(h-28)/2;pair.values.forEach((value,i)=>{this.rect(plotX,top+i*15,plotWidth,5,'#e4edf6');if(value>0)this.rect(plotX,top+i*15,plotWidth*value/pairedMax,5,pair.colors[i]);const old=pair.previousValues[i];if(old!=null){this.rect(plotX,top+i*15+6,plotWidth,5,'#e4edf6');if(old>0)this.rect(plotX,top+i*15+6,plotWidth*old/pairedMax,5,'#9cacbf');}});}
        this.y+=h;this.line(M,this.y,M+WIDTH,this.y);
      };
      paint(block.headers,true);block.rows.forEach((row,i)=>paint(row,false,charted?block.comparison[i]:null,paired?block.pairedComparison[i]:null,block.cellColors?.[i]||[],block.rowColors?.[i]));this.y+=10;
    }
    duel(block){
      const cell=(WIDTH-12)/2,names=block.candidates.map(c=>wrap(c.number+' — '+c.name,cell-20,12)),height=Math.max(...names.map(n=>n.length))*16+181;
      this.ensure(height+wrap(block.title,WIDTH,14).length*20+40);this.heading(block.title);
      const top=this.y,max=Math.max(1,...block.candidates.flatMap(c=>[c.votes,c.previous||0]));
      block.candidates.forEach((c,i)=>{const x=M+i*(cell+12);this.rect(x,top,cell,height,'#f4f7fb');this.rect(x,top,cell,4,c.color);let y=top+24;
        names[i].forEach(line=>{this.text(line,x+10,y,12,true,c.color);y+=16;});y=top+Math.max(...names.map(n=>n.length))*16+33;
        this.text('Votos 2026',x+10,y,10);this.text(integer(c.votes),x+10,y+26,21,true,'#0b294d');this.text(c.share+' do cargo no filtro',x+10,y+46,9.5);
        this.text('2022: '+(c.previous==null?'—':integer(c.previous)),x+10,y+67,10);
        const delta=c.previous==null?0:c.votes-c.previous,ink=delta>0?'#208a5b':delta<0?'#bc3030':'#54677d';
        this.text(c.change,x+10,y+88,13,true,ink);this.text(c.difference,x+10,y+106,9.5,true,ink);
        for(const [j,v]of [c.votes,c.previous].entries()){this.text(j===0?'2026':'2022',x+10,y+127+j*14,9);this.rect(x+48,y+119+j*14,cell-62,8,'#e4edf6');if(v!=null&&v>0)this.rect(x+48,y+119+j*14,(cell-62)*v/max,8,j===0?c.color:'#9cacbf');}
      });this.y+=height+12;
    }
    bars(block){this.heading(block.title);if(!block.rows.length){this.paragraph('Sem resultados neste recorte.');return;}
      const max=Math.max(1,...block.rows.flatMap(r=>r.values.map(v=>v.value||0))),labelWidth=157,trackWidth=WIDTH-labelWidth-83;
      for(const row of block.rows){const labels=wrap(row.label,labelWidth-12,10.5),h=Math.max(labels.length*14,row.values.length*18+(row.change?15:0))+13;this.ensure(h);labels.forEach((line,i)=>this.text(line,M,this.y+12+i*14,10.5,true));row.values.forEach((v,i)=>{const y=this.y+i*18;this.text(v.label,M+labelWidth,y+12,8.5);const x=M+labelWidth+52;this.rect(x,y+3,trackWidth-52,10,'#edf2f7');if(v.value!==null&&v.value!==undefined)this.rect(x,y+3,(trackWidth-52)*v.value/max,10,v.color||'#1262ae');this.text(v.display||(v.value==null?'—':integer(v.value)),M+WIDTH-67,y+12,10,true);});if(row.change)this.text(row.change,M+labelWidth,this.y+row.values.length*18+10,9,true,row.change.startsWith('+')?'#208a5b':row.change.startsWith('-')?'#bc3030':'#54677d');this.y+=h;}this.y+=8;
    }
    pie(block){const rows=block.rows.filter(r=>r.value>0),total=rows.reduce((n,r)=>n+r.value,0),legendWidth=WIDTH-191;const h=Math.max(173,rows.reduce((n,r)=>n+wrap(r.label,legendWidth,10).length*13+19,0));this.ensure(h+10+wrap(block.title,WIDTH,14).length*20+32);this.heading(block.title);if(!total){this.paragraph('Sem votos neste recorte.');return;}const cy=this.y+82,cx=M+79,radius=69;let angle=-Math.PI/2;
      rows.forEach((row,i)=>{const end=angle+row.value/total*Math.PI*2;let command=`${color(row.color||COLORS[i%COLORS.length])} rg ${f(cx)} ${f(H-cy)} m ${f(cx+radius*Math.cos(angle))} ${f(H-cy-radius*Math.sin(angle))} l `;for(let a=angle;a<end-1e-8;){const b=Math.min(end,a+Math.PI/2),k=4/3*Math.tan((b-a)/4),x0=cx+radius*Math.cos(a),y0=cy+radius*Math.sin(a),x3=cx+radius*Math.cos(b),y3=cy+radius*Math.sin(b);command+=`${f(x0-radius*Math.sin(a)*k)} ${f(H-y0-radius*Math.cos(a)*k)} ${f(x3+radius*Math.sin(b)*k)} ${f(H-y3+radius*Math.cos(b)*k)} ${f(x3)} ${f(H-y3)} c `;a=b;}this.commands.push(command+'h f');angle=end;});
      let y=this.y+12;rows.forEach((row,i)=>{this.rect(M+176,y-8,8,8,row.color||COLORS[i%COLORS.length]);wrap(row.label,legendWidth,10).forEach(line=>{this.text(line,M+190,y,10,true);y+=13;});const share=(row.value/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';this.text(block.unit==='percent'?share:`${integer(row.value)} votos • ${share}`,M+190,y,9);y+=19;});this.text(block.unit==='percent'?'Distribuição (%)':`${integer(total)} votos`,M+17,cy+90,11,true);this.y+=h+15;
    }
    scatter(block){
      const height=330+block.datasets.length*18;
      this.ensure(height+wrap(block.title,WIDTH,14).length*20+40);this.heading(block.title);
      const top=this.y,left=M+43,bottom=top+252,plotWidth=WIDTH-70,plotHeight=222;
      const x=v=>left+plotWidth*v/block.maxX,y=v=>bottom-plotHeight*v/block.maxY;
      const tick=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:block.basis==='share'?1:0});
      this.text('Federal'+(block.basis==='share'?' (%)':' (votos)'),left,top+12,10,true);
      for(let i=0;i<=4;i++){
        const xv=block.maxX*i/4,yv=block.maxY*i/4;
        this.line(left,y(yv),left+plotWidth,y(yv));this.line(x(xv),top+30,x(xv),bottom);
        this.text(tick(yv),M+2,y(yv)+3,9);this.text(tick(xv),x(xv)-8,bottom+18,9);
      }
      this.text('Estadual'+(block.basis==='share'?' (%)':' (votos)'),left+plotWidth/2-45,bottom+38,10,true);
      for(const d of [...block.datasets].reverse()){
        for(const p of d.points){
          const cx=x(p.x),cy=y(p.y),r=Math.min(4,1.4+Math.log2(p.count)*.5),k=.55228475*r;
          this.commands.push(`${color(d.color)} rg ${f(cx+r)} ${f(H-cy)} m ${f(cx+r)} ${f(H-cy+k)} ${f(cx+k)} ${f(H-cy+r)} ${f(cx)} ${f(H-cy+r)} c ${f(cx-k)} ${f(H-cy+r)} ${f(cx-r)} ${f(H-cy+k)} ${f(cx-r)} ${f(H-cy)} c ${f(cx-r)} ${f(H-cy-k)} ${f(cx-k)} ${f(H-cy-r)} ${f(cx)} ${f(H-cy-r)} c ${f(cx+k)} ${f(H-cy-r)} ${f(cx+r)} ${f(H-cy-k)} ${f(cx+r)} ${f(H-cy)} c h f`);
        }
        if(d.r!==null){
          const ends=[[0,d.intercept],[block.maxX,d.intercept+d.slope*block.maxX]];
          if(d.slope!==0)ends.push([-d.intercept/d.slope,0],[(block.maxY-d.intercept)/d.slope,block.maxY]);
          const inside=ends.filter(([a,b])=>a>=0&&a<=block.maxX&&b>=0&&b<=block.maxY);
          if(inside.length>=2){this.commands.push('[5 4] 0 d');this.line(x(inside[0][0]),y(inside[0][1]),x(inside[1][0]),y(inside[1][1]),d.color,1.5);this.commands.push('[] 0 d');}
        }
      }
      let legendY=bottom+64;
      for(const d of block.datasets){this.rect(M,legendY-7,8,8,d.color);this.text(`${d.label} • ${integer(d.n)} seções • Pearson ${d.r==null?'indisponível':d.r.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})}`,M+15,legendY,10);legendY+=18;}
      this.y=legendY+7;this.paragraph('Pontos agrupam seções com valores próximos; tamanho indica quantidade. O coeficiente usa todas as observações válidas.',9);
    }
    heat(block){
      const labelWidth=74,cellWidth=(WIDTH-labelWidth)/block.headers.length;
      const header=()=>{this.heading(block.title);const lines=block.headers.map(s=>wrap(s,cellWidth-14,10)),height=Math.max(...lines.map(a=>a.length))*14+14;this.ensure(height);lines.forEach((parts,i)=>parts.forEach((s,j)=>this.text(s,M+labelWidth+i*cellWidth+7,this.y+14+j*14,10,true)));this.y+=height;};header();
      for(const row of block.rows){const height=Math.max(...row.cells.map(c=>wrap(c.note,cellWidth-16,9).length))*13+38;if(this.y+height>H-53){this.newPage();header();}this.text(row.label,M,this.y+24,11,true);row.cells.forEach((c,i)=>{const x=M+labelWidth+i*cellWidth;this.rect(x+3,this.y+3,cellWidth-6,height-6,c.color);this.text(c.value,x+10,this.y+24,14,true,c.textColor);wrap(c.note,cellWidth-16,9).forEach((s,j)=>this.text(s,x+10,this.y+42+j*13,9,false,c.textColor));});this.y+=height;}
      this.y+=12;this.paragraph(block.note,9);
    }
    map(block){
      this.ensure(455+block.legend.length*20);this.heading(block.title);const [bx,by,bw,bh]=block.bounds,scale=Math.min(WIDTH/bw,355/bh),x=M+(WIDTH-bw*scale)/2,top=this.y,height=bh*scale;
      this.rect(M,top,WIDTH,height,'#f6f9fc');
      for(const item of block.polygons){let path='';for(const polygon of item.polygons)for(const ring of polygon){for(const [i,[px,py]]of ring.entries())path+=`${f(x+(px-bx)*scale)} ${f(H-top-(py-by)*scale)} ${i?'l':'m'} `;path+='h ';}this.commands.push(`${color(item.color)} rg ${color('#667c91')} RG .3 w ${path}B*`);}
      this.y+=height+19;for(const item of block.legend){this.rect(M,this.y-8,9,9,item.color);for(const line of wrap(item.label,WIDTH-19,10)){this.text(line,M+17,this.y,10);this.y+=14;}this.y+=5;}this.paragraph(block.note,9);
    }
    candles(block){this.heading(block.title);const max=Math.max(1,...block.rows.map(r=>r.stats.max));for(const row of block.rows){this.ensure(70);this.paragraph(row.label,10);const x=M+18,y=this.y+11,w=WIDTH-40,pos=n=>x+n/max*w;this.line(x,y,x+w,y,'#c2d1df');this.line(pos(row.stats.min),y,pos(row.stats.max),y,'#173f67',2);this.rect(pos(row.stats.q1),y-7,Math.max(1,pos(row.stats.q3)-pos(row.stats.q1)),14,row.color||'#1262ae');this.line(pos(row.stats.median),y-9,pos(row.stats.median),y+9,'#071a33',2);this.y+=33;this.paragraph(`Mínimo ${integer(Math.round(row.stats.min))} • Q1 ${integer(Math.round(row.stats.q1))} • Mediana ${integer(Math.round(row.stats.median))} • Q3 ${integer(Math.round(row.stats.q3))} • Máximo ${integer(Math.round(row.stats.max))}`,9);}}
    finish(){const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];const kids=[];
      this.pages.forEach((commands,i)=>{const pageId=objects.length,streamId=pageId+1;kids.push(pageId+' 0 R');commands.push(`BT /F1 9 Tf ${color('#687b90')} rg 1 0 0 1 ${M} 27 Tm <${hexText('Relatório gerado em '+this.report.generatedAt+' • Página '+(i+1)+' de '+this.pages.length)}> Tj ET`);const stream=commands.join('\n');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});objects[2]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`;let result='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=result.length;result+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}const start=result.length;result+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;const bytes=new Uint8Array(result.length);for(let i=0;i<result.length;i++)bytes[i]=result.charCodeAt(i);return bytes;}
  }
  function reachBand(pdf,data,y,title='Alcance estimado da base'){
    const percent=data.ratio===null?(data.total?'Sem cobertura':'Sem base'):new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(data.ratio);
    const counts=(data.reached===null?'Teto indisponível':integer(data.reached))+' de '+integer(data.total)+' cadastros'+(data.remaining===null?'':' • '+integer(data.remaining)+' fora do teto');
    const lines=wrap(counts,WIDTH-155,9.5),height=Math.max(57,lines.length*12+35);
    pdf?.rect(M,y,WIDTH,height,'#edf8f2');pdf?.text(title,M+10,y+15,10,true,'#145e4c');
    lines.forEach((line,i)=>pdf?.text(line,M+10,y+30+i*12,9.5));
    pdf?.text(percent,M+WIDTH-125,y+28,data.ratio===null?11:20,true,'#00765e');
    pdf?.rect(M+10,y+height-12,WIDTH-20,6,'#dce5e1');
    if(data.ratio!==null&&data.ratio>0)pdf?.rect(M+10,y+height-12,(WIDTH-20)*data.ratio,6,'#008068');
    return y+height+8;
  }
  function summaryLayout(report,size,pdf=null){
    let y=78;
    const lineHeight=size*1.3,padding=report.finalResult?4:6;
    const text=(s,x,top,font=size,bold=false,ink='#24415f')=>pdf?.text(s,x,top,font,bold,ink);
    const paragraph=(s,font=size,bold=false,ink='#54677d')=>{for(const line of wrap(s,WIDTH,font)){text(line,M,y,font,bold,ink);y+=font*1.3;}y+=3;};
    paragraph(report.title,15,true,'#0b294d');paragraph(report.subtitle,size);
    for(const candidate of report.candidates||[])paragraph(candidate,size,true);
    for(const [label,value]of report.meta||[])paragraph(label+': '+value,size);
    y+=3;
    if(report.indicators?.length){
      const columns=Math.min(4,report.indicators.length),cell=(WIDTH-(columns-1)*6)/columns;
      for(let start=0;start<report.indicators.length;start+=columns){const items=report.indicators.slice(start,start+columns);
        const height=Math.max(...items.map(item=>wrap(item.label,cell-12,size).length*lineHeight+wrap(item.value,cell-12,13).length*16+12));
        items.forEach((item,i)=>{const x=M+i*(cell+6);pdf?.rect(x,y,cell,height,'#edf4fb');let top=y+size+6;for(const line of wrap(item.label,cell-12,size)){text(line,x+6,top,size,true);top+=lineHeight;}top+=3;for(const line of wrap(item.value,cell-12,13)){text(line,x+6,top,13,true,item.color||'#0b4f8a');top+=16;}});y+=height+8;
      }
    }
    if(report.dashboard)y=reachBand(pdf,report.dashboard,y,report.dashboardTitle);
    if(report.summaryChart?.rows?.length){
      paragraph(report.summaryChart.title,11,true,'#0b294d');
      const chart=report.summaryChart,max=Math.max(1,...chart.rows.flatMap(row=>row.values.map(value=>Number(value.value)||0))),labelWidth=145,trackX=M+labelWidth+60,trackWidth=WIDTH-labelWidth-140;
      for(const row of chart.rows){const labels=wrap(row.label,labelWidth-8,size),height=Math.max(labels.length*lineHeight,row.values.length*14)+5;
        labels.forEach((line,i)=>text(line,M,y+size+i*lineHeight,size,true));
        row.values.forEach((value,i)=>{const top=y+i*14,label=String(value.label).replace('Máximo possível','Máximo').replace('Proximidade ponderada','Proximidade'),short=width(label,8)>54?label.slice(0,10)+'…':label;text(short,M+labelWidth,top+size,8);pdf?.rect(trackX,top+2,trackWidth,7,'#edf2f7');if(value.value!=null&&value.value>0)pdf?.rect(trackX,top+2,trackWidth*value.value/max,7,value.color||'#1262ae');text(value.display||(value.value==null?'Sem dado':integer(value.value)),trackX+trackWidth+7,top+size,8.5,true);});y+=height;
      }
      y+=4;
    }
    for(const block of report.blocks||[]){
      y+=5;paragraph(block.title,11,true,'#0b294d');
      const weights=block.widths||block.headers.map(()=>1),sum=weights.reduce((n,v)=>n+v,0),sizes=weights.map(v=>WIDTH*v/sum);
      const row=(cells,header=false,index=0)=>{const lines=cells.map((value,i)=>wrap(value,sizes[i]-12,size)),height=Math.max(1,...lines.map(v=>v.length))*lineHeight+padding;pdf?.rect(M,y,WIDTH,height,header?'#173f67':block.rowColors?.[index]||(index%2?'#ffffff':'#f4f7fb'));let x=M;lines.forEach((parts,i)=>{const ink=block.cellColors?.[index]?.[i]||(/(Variação|Diferença)/.test(block.headers[i]||'')&&String(cells[i]).startsWith('+')?'#208a5b':/(Variação|Diferença)/.test(block.headers[i]||'')&&String(cells[i]).startsWith('-')?'#bc3030':'#24415f');parts.forEach((line,j)=>text(line,x+6,y+size+padding/2+j*lineHeight,size,header,header?'#ffffff':ink));x+=sizes[i];});y+=height;pdf?.line(M,y,M+WIDTH,y);};
      row(block.headers,true);block.rows.forEach((cells,i)=>row(cells,false,i));
      if(!block.rows.length){y+=size+5;paragraph('Sem resultados neste recorte.',size);}
      y+=5;
    }
    y+=4;if(report.note)paragraph(report.note,Math.max(8,size-.5));
    if(report.sources?.length)paragraph('Fontes: '+report.sources.join(' • '),8);
    if(report.finalResult)y=finalResultBand(pdf,{...report.finalResult,detail:''},y,Math.min(size,9.5));
    return y;
  }
  function finalResultBand(pdf,result,y,size=9.5){
    const heading=result.title||'Resultado final',headline=wrap(result.summary,WIDTH-20,size+1),details=result.detail?wrap(result.detail,WIDTH-20,Math.max(8,size-.5)):[],line=(size+1)*1.3,small=Math.max(8,size-.5),height=29+headline.length*line+details.length*small*1.3;
    pdf?.rect(M,y,WIDTH,height,'#e9f2ff');pdf?.rect(M,y,4,height,'#2358ed');pdf?.text(heading.toUpperCase(),M+11,y+15,9,true,'#1943b8');
    let top=y+30;for(const value of headline){pdf?.text(value,M+11,top,size+1,true,'#12345c');top+=line;}
    for(const value of details){pdf?.text(value,M+11,top,small,false,'#415775');top+=small*1.3;}
    return y+height+8;
  }
  function resolveSummary(report){
    for(const candidate of [report,...(report.summaryVariants||[])]){
      const size=[9.5,9,8.5].find(value=>summaryLayout(candidate,value)<=H-53);
      if(size)return {report:candidate,size};
    }
    throw Error('O conteúdo essencial excede uma página legível. Escolha o formato Enxuto para preservar as informações.');
  }
  function buildSummary(report){
    const selected=resolveSummary(report),pdf=new PDF(selected.report);summaryLayout(selected.report,selected.size,pdf);return pdf.finish();
  }
  // Summary tables are excerpts, never sums of percentages, ceilings or overlapping groups.
  // Only the producer's existing indicators and consolidated result are authoritative totals.
  function executiveSummary(report){
    if(report.layout==='single-page-summary')return report;
    const tables=(report.blocks||[]).filter(block=>block.type==='table'&&Array.isArray(block.rows)),nominal=block=>block.headers.some(value=>/\bnome\b|\btítulo\b|\bcontato\b/i.test(value));
    const sources=[...(report.sources||[]),...(report.meta||[]).filter(([label])=>/fonte|versão|origem/i.test(label)).map(([label,value])=>label+': '+value)];
    const sourceSet=[...new Set(sources.filter(Boolean).map(String))];
    const metadata=(report.meta||[]).filter(([label])=>!/fonte|versão|origem/i.test(label));
    const chart=report.summaryChart||(report.blocks||[]).find(block=>block.type==='bars'&&block.rows?.length);
    const essential=tables.filter(block=>block.summaryEssential&&!nominal(block)),aggregate=tables.filter(block=>!block.summaryEssential&&!nominal(block));
    const nominalLines=tables.filter(nominal).reduce((sum,block)=>sum+block.rows.length,0);
    const content=tables.length+' quadro(s) de dados'+(nominalLines?' • '+integer(nominalLines)+' linhas com nomes disponíveis no formato Enxuto':'');
    const brief=(value,max)=>{const text=String(value??'—');return text.length<=max?text:text.slice(0,max-17).trimEnd()+'… [abreviado]';};
    const note=String(report.summaryNote||report.note||'');
    const shortNote=note.length<=580?note:note.slice(0,510).replace(/\s+\S*$/,'')+'… Metodologia integral no formato Enxuto.';
    const privacy=/teto|compatibilidade/i.test(note)&&!/votos? individua(?:l|is)/i.test(note)?' Estimativas agregadas não identificam votos individuais.':'';
    const make=(rowLimit,tableLimit,chartLimit,metaLimit)=>{
      const abbreviated=metadata.some(([,value])=>String(value).length>metaLimit);
      const selected=[...essential,...aggregate.slice(0,tableLimit).map(block=>{
        const indices=Array.from({length:Math.min(rowLimit,block.rows.length)},(_,i)=>i),total=block.rows.findIndex(row=>/^total(?:\s|$)/i.test(String(row[0]).trim()));
        if(total>=0&&!indices.includes(total))indices.push(total);
        const shown=indices.filter(i=>i!==total).length,available=block.rows.length-(total>=0?1:0);
        return {...block,title:block.title+(indices.length<block.rows.length?' • '+shown+' de '+integer(available)+' linhas'+(total>=0?' + total':''):''),rows:indices.map(i=>block.rows[i]),rowColors:indices.map(i=>block.rowColors?.[i]),cellColors:indices.map(i=>block.cellColors?.[i])};
      })];
      const summaryChart=chart&&chartLimit?{title:chart.title+(chart.rows.length>chartLimit?' • '+chartLimit+' de '+integer(chart.rows.length)+' itens':''),rows:chart.rows.slice(0,chartLimit)}:null;
      const explanation='Resumo executivo: indicadores e totais mantidos; quadros mostram apenas as linhas indicadas. Listagens completas no formato Enxuto.'+(abbreviated?' Campos extensos estão identificados como abreviados.':'');
      return {...report,title:report.title,layout:'single-page-summary',summaryVariants:undefined,paperFormat:undefined,summaryChart,
        meta:[...metadata.map(([label,value])=>[nominalLines&&label==='Listagem'?'Listagem selecionada':label,brief(nominalLines&&label==='Listagem'?String(value).replace(/neste PDF/gi,'na seleção; nomes no formato Enxuto'):value,metaLimit)]),['Conteúdo',content]],sources:sourceSet,blocks:selected,
        note:explanation+(shortNote?' '+shortNote:'')+privacy,
        summaryInfo:{consolidated:true,abbreviated,nominalLines,tableCount:tables.length,shownTables:selected.length,shownRows:selected.reduce((sum,block)=>sum+block.rows.length,0),chartItems:summaryChart?.rows.length||0,description:explanation}};
    };
    const variants=[[18,2,3,220],[5,2,3,220],[3,1,3,180],[2,1,2,150],[0,0,0,120]].map(values=>make(...values));
    return {...variants[0],summaryVariants:variants.slice(1)};
  }
  function formatReport(report,format='summary'){
    if(!['summary','compact','original'].includes(format))throw Error('Escolha um formato de relatório válido.');
    if(format==='summary'&&report.layout==='leadership-pages')throw Error('Este relatório preserva nomes e páginas por liderança. Use Enxuto ou Original.');
    if(format==='summary')return resolveSummary(executiveSummary(report)).report;
    return report.layout==='single-page-summary'?resolveSummary(report).report:{...report,paperFormat:format==='compact'?'compact':undefined};
  }
  function build(report){if(report.layout==='single-page-summary')return buildSummary(report);const pdf=new PDF(report);pdf.heading(report.title);pdf.paragraph(report.subtitle);for(const [label,value]of report.meta||[])pdf.paragraph(`${label}: ${value}`,10);pdf.indicators(report.indicators||[],report.compactIndicators,report.indicatorColumns||(pdf.compact?4:3));if(report.dashboard){pdf.ensure(80);pdf.y=reachBand(pdf,report.dashboard,pdf.y,report.dashboardTitle);}if(report.note)pdf.paragraph(report.note,10);for(const block of report.blocks||[]){if(block.type==='section')pdf.section(block.title,block.compact);if(block.type==='heading')pdf.heading(block.title);if(block.type==='paragraph')pdf.paragraph(block.text,block.size||10,block.color||'#54677d');if(block.type==='indicators')pdf.indicators(block.items,block.compact);if(block.type==='table')pdf.table(block);if(block.type==='duel')pdf.duel(block);if(block.type==='bars')pdf.bars(block);if(block.type==='pie')pdf.pie(block);if(block.type==='candles')pdf.candles(block);if(block.type==='scatter')pdf.scatter(block);if(block.type==='map')pdf.map(block);if(block.type==='heat')pdf.heat(block);}if(report.finalResult){const height=finalResultBand(null,report.finalResult,0);pdf.ensure(height);pdf.y=finalResultBand(pdf,report.finalResult,pdf.y);}return pdf.finish();}
  function inspect(bytes){const text=new TextDecoder('latin1').decode(bytes);return {pages:Number(text.match(/\/Type \/Pages \/Count (\d+)/)?.[1]||0),size:bytes.length};}
  function downloadBytes(bytes,filename){const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return bytes.length;}
  function download(report,filename){return downloadBytes(build(report),filename);}
  const api={build,resolveSummary,executiveSummary,formatReport,inspect,downloadBytes,download};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportPDF=api;
})(typeof window!=='undefined'?window:globalThis);
