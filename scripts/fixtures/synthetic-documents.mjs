export function syntheticPDF(){
  const lines=['NOME: PESSOA FICTICIA','TITULO: 12345678901','ZONA: 72','SECAO: 372','FONE: 91999990000','MAE: MAE FICTICIA','NASCIMENTO: 02/01/2000'];
  const stream=lines.map((line,i)=>`BT /F1 16 Tf 45 ${780-i*30} Td (${line.replace(/[()\\]/g,'\\$&')}) Tj ET`).join('\n');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let value='%PDF-1.4\n';const offsets=[0];for(const [i,obj]of objects.entries()){offsets.push(Buffer.byteLength(value));value+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';}const start=Buffer.byteLength(value);value+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';return Buffer.from(value);
}
