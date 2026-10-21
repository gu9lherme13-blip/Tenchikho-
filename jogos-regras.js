'use strict';
// Regras de xadrez e dama usadas pelo bot (jogos.js) e pela página de jogos.
const pos=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
// ---------- XADREZ (sem roque nem en passant; peão vira dama automaticamente) ----------
function xInicio(){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  const fila=['R','N','B','Q','K','B','N','R'];
  for(let c=0;c<8;c++){ b[0][c]={t:fila[c],w:false}; b[1][c]={t:'P',w:false}; b[6][c]={t:'P',w:true}; b[7][c]={t:fila[c],w:true}; }
  return b;
}
function xRei(b,w){ for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=b[r][c]; if(p&&p.w===w&&p.t==='K') return [r,c];} return null; }
function xAtacada(b,r,c,porBranco){
  const pr=porBranco?r+1:r-1;
  for(const dc of [-1,1]){ if(pos(pr,c+dc)){const p=b[pr][c+dc]; if(p&&p.w===porBranco&&p.t==='P') return true;} }
  for(const [dr,dc] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
    const rr=r+dr,cc=c+dc; if(pos(rr,cc)){const p=b[rr][cc]; if(p&&p.w===porBranco&&p.t==='N') return true;}
  }
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc) continue; const rr=r+dr,cc=c+dc;
    if(pos(rr,cc)){const p=b[rr][cc]; if(p&&p.w===porBranco&&p.t==='K') return true;}
  }
  for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const reta=dr===0||dc===0; let rr=r+dr,cc=c+dc;
    while(pos(rr,cc)){
      const p=b[rr][cc];
      if(p){ if(p.w===porBranco&&(p.t==='Q'||(reta&&p.t==='R')||(!reta&&p.t==='B'))) return true; break; }
      rr+=dr; cc+=dc;
    }
  }
  return false;
}
function xPseudo(b,w){
  const m=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c]; if(!p||p.w!==w) continue;
    if(p.t==='P'){
      const d=w?-1:1, ini=w?6:1, r1=r+d;
      if(pos(r1,c)&&!b[r1][c]){ m.push([r,c,r1,c]); if(r===ini&&!b[r+2*d][c]) m.push([r,c,r+2*d,c]); }
      for(const dc of [-1,1]){ if(pos(r1,c+dc)){const q=b[r1][c+dc]; if(q&&q.w!==w) m.push([r,c,r1,c+dc]);} }
    } else if(p.t==='N'||p.t==='K'){
      const saltos=p.t==='N'?[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [dr,dc] of saltos){ const rr=r+dr,cc=c+dc; if(pos(rr,cc)&&(!b[rr][cc]||b[rr][cc].w!==w)) m.push([r,c,rr,cc]); }
    } else {
      const dirs=p.t==='R'?[[1,0],[-1,0],[0,1],[0,-1]]:p.t==='B'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [dr,dc] of dirs){
        let rr=r+dr,cc=c+dc;
        while(pos(rr,cc)){
          const q=b[rr][cc];
          if(!q){ m.push([r,c,rr,cc]); }
          else { if(q.w!==w) m.push([r,c,rr,cc]); break; }
          rr+=dr; cc+=dc;
        }
      }
    }
  }
  return m;
}
function xAplica(b,m){
  const nb=b.map(row=>row.map(x=>x?{...x}:null));
  const [fr,fc,tr,tc]=m; const p=nb[fr][fc]; nb[fr][fc]=null;
  if(p.t==='P'&&(tr===0||tr===7)) p.t='Q';
  nb[tr][tc]=p; return nb;
}
function xLegais(b,w){
  return xPseudo(b,w).filter(m=>{ const nb=xAplica(b,m); const k=xRei(nb,w); return k&&!xAtacada(nb,k[0],k[1],!w); });
}
function xEmXeque(b,w){ const k=xRei(b,w); return !!k && xAtacada(b,k[0],k[1],!w); }
// ---------- DAMA (captura obrigatória, captura múltipla, dama na última fileira) ----------
function dInicio(){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    if((r+c)%2!==1) continue;
    if(r<3) b[r][c]={c:'b',k:false};
    else if(r>4) b[r][c]={c:'w',k:false};
  }
  return b;
}
function dDirs(p){ const d=[[-1,-1],[-1,1],[1,-1],[1,1]]; if(p.k) return d; return d.filter(([dr])=>p.c==='w'?dr<0:dr>0); }
function dBusca(b,p,caminho,capt,res,origem){
  const [r,c]=caminho[caminho.length-1]; let achou=false;
  for(const [dr,dc] of dDirs(p)){
    const mr=r+dr,mc=c+dc,lr=r+2*dr,lc=c+2*dc;
    if(!pos(lr,lc)) continue;
    const alvo=b[mr][mc];
    if(alvo&&alvo.c!==p.c&&!capt.some(([a,q])=>a===mr&&q===mc)){
      if(!b[lr][lc]||(lr===origem[0]&&lc===origem[1])){
        achou=true; dBusca(b,p,[...caminho,[lr,lc]],[...capt,[mr,mc]],res,origem);
      }
    }
  }
  if(!achou&&capt.length) res.push({caminho,capt});
}
function dLances(b,cor){
  const capt=[], simples=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=b[r][c]; if(!p||p.c!==cor) continue;
    dBusca(b,p,[[r,c]],[],capt,[r,c]);
    for(const [dr,dc] of dDirs(p)){ const tr=r+dr,tc=c+dc; if(pos(tr,tc)&&!b[tr][tc]) simples.push({caminho:[[r,c],[tr,tc]],capt:[]}); }
  }
  return capt.length?capt:simples;
}
function dAplica(b,lance){
  const nb=b.map(row=>row.map(x=>x?{...x}:null));
  const [or,oc]=lance.caminho[0]; const [fr,fc]=lance.caminho[lance.caminho.length-1];
  const p=nb[or][oc]; nb[or][oc]=null;
  for(const [cr,cc] of lance.capt) nb[cr][cc]=null;
  if((p.c==='w'&&fr===0)||(p.c==='b'&&fr===7)) p.k=true;
  nb[fr][fc]=p; return nb;
}

module.exports={pos,xInicio,xRei,xAtacada,xPseudo,xAplica,xLegais,xEmXeque,dInicio,dLances,dAplica};
