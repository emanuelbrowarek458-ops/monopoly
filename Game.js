import { randomInt, randomUUID } from 'node:crypto';
import { BOARD, GROUPS, RULES, PURCHASABLE_IDS, STATION_IDS, UTILITY_IDS, interest, redemption, createPropertyState } from './board.js';
import { CARDS, createDecks } from './cards.js';

export class GameError extends Error {}
const need = (condition, message) => { if (!condition) throw new GameError(message); };
const integer = (n, min=0, max=1_000_000_000) => Number.isSafeInteger(n) && n>=min && n<=max;

// Every action is synchronous and transactional. No await occurs between validation
// and mutation. The server never accepts a client balance, dice result or position.
export class Game {
  constructor(players, { rng=randomInt, now=Date.now }={}) {
    need(players.length>=2 && players.length<=6, 'Gra wymaga od 2 do 6 graczy.');
    this.rng=rng; this.now=now;
    this.s={
      players:players.map(p=>({id:p.id,name:p.name,color:p.color,cash:1500,pos:0,jail:false,jailAttempts:0,cards:[],bankrupt:false,skipped:false})),
      properties:createPropertyState(),bank:{houses:32,hotels:12},decks:createDecks(rng),
      phase:'order',order:[],orderGroups:[players.map(p=>p.id)],orderRolls:{},orderHistory:[],
      turn:null,turnNumber:0,doubles:0,extraRoll:false,dice:[1,1],diceId:0,
      pending:null,queue:[],trades:[],log:[],lastCard:null,movement:null,
      startedAt:now(),endedAt:null,winner:null,revision:0
    };
    this.log('Wszyscy otrzymują 1500€. Rzućcie kośćmi, aby ustalić kolejność.');
  }
  player(id) { const p=this.s.players.find(p=>p.id===id); need(p,'Nie ma takiego gracza.'); return p; }
  alive() { return this.s.players.filter(p=>!p.bankrupt); }
  property(id) { need(integer(id,0,39) && this.s.properties[id], 'To pole nie jest nieruchomością.'); return this.s.properties[id]; }
  owned(p) { return PURCHASABLE_IDS.filter(id=>this.s.properties[id].ownerId===p.id); }
  group(id) { return GROUPS[BOARD[id].group]?.ids || [id]; }
  complete(p,id) { return this.group(id).every(i=>this.s.properties[i].ownerId===p.id && !this.s.properties[i].mortgaged); }
  log(text) { this.s.log.push({id:randomUUID(),time:this.now(),text}); this.s.log=this.s.log.slice(-150); }
  dice() { const d=[this.rng(1,7),this.rng(1,7)]; this.s.dice=d; this.s.diceId++; return d; }
  liquidValue(p) { return p.cash+this.owned(p).reduce((n,id)=>{ const f=BOARD[id],a=this.property(id); return n+(!a.mortgaged?f.mortgage:0)+(a.buildings*(f.houseCost||0)/2); },0); }
  wealth(p) { return p.cash+this.owned(p).reduce((n,id)=>{const f=BOARD[id],a=this.property(id);return n+f.price-(a.mortgaged?f.mortgage:0)+a.buildings*(f.houseCost||0);},0); }
  available(p) { const a=this.s.pending; return p.cash-(a?.kind==='auction' && a.highId===p.id?a.high:0); }
  spend(p,amount) { need(integer(amount),'Nieprawidłowa kwota.'); need(this.available(p)>=amount,'Za mało wolnej gotówki (oferta aukcyjna rezerwuje pieniądze).'); p.cash-=amount; }
  current(p) { need(this.s.turn===p.id,'Teraz jest tura innego gracza.'); }
  clearPending() { need(!this.s.pending,'Najpierw rozstrzygnij trwającą akcję.'); }
  transaction(fn) {
    const before=structuredClone(this.s);
    try { fn(); this.settle(); this.pump(); this.checkWinner(); this.s.revision++; this.assertInvariants(); }
    catch(e) { this.s=before; throw e; }
  }
  action(id, type, data={}) {
    this.transaction(()=>{
      const p=this.player(id);
      need(!p.bankrupt,'Jesteś już poza grą.');
      need(this.s.phase!=='finished','Rozgrywka została zakończona.');
      need(data && typeof data==='object' && !Array.isArray(data),'Nieprawidłowe dane akcji.');
      if(this.s.phase==='order') { need(type==='orderRoll','Najpierw ustalcie kolejność graczy.'); this.orderRoll(p); return; }
      switch(type) {
        case 'roll': this.roll(p); break;
        case 'end': this.current(p); this.clearPending(); need(this.s.phase==='end'&&!this.s.extraRoll,'Musisz najpierw rzucić kośćmi.'); this.nextTurn(); break;
        case 'buy': this.buy(p); break;
        case 'decline': need(this.s.pending?.kind==='buy' && this.s.pending.playerId===p.id,'Nie masz pola do kupienia.'); this.startAuction(this.s.pending.field); break;
        case 'bid': this.bid(p,data.amount); break;
        case 'pass': this.pass(p); break;
        case 'build': this.build(p,data.field,false); break;
        case 'sell': this.build(p,data.field,true); break;
        case 'mortgage': this.mortgage(p,data.field); break;
        case 'redeem': this.redeem(p,data.field); break;
        case 'jailPay': this.jailPay(p); break;
        case 'jailCard': this.jailCard(p,data.card); break;
        case 'mortgageChoice': this.mortgageChoice(p,data.redeem===true); break;
        case 'tradeOffer': this.tradeOffer(p,data); break;
        case 'tradeAccept': this.tradeAccept(p,data); break;
        case 'tradeReject': this.tradeReject(p,data.id); break;
        case 'bankrupt': need(this.s.pending?.kind==='debt' && this.s.pending.playerId===p.id,'Nie masz wymagalnego długu.'); need(this.liquidValue(p)<this.s.pending.amount,'Możesz jeszcze spłacić dług: sprzedaj budynki lub zastaw pola.'); this.bankrupt(p,this.s.pending.creditorId); break;
        case 'surrender': this.bankrupt(p,this.s.pending?.kind==='debt' && this.s.pending.playerId===p.id?this.s.pending.creditorId:null); break;
        default: throw new GameError('Nieznana akcja.');
      }
    });
  }
  orderRoll(p) {
    const group=this.s.orderGroups.find(g=>g.length>1);
    need(group?.includes(p.id),'Teraz rzucają inni gracze rozstrzygający remis.');
    need(!Object.hasOwn(this.s.orderRolls,p.id),'Już rzuciłeś w tej rundzie.');
    const d=this.dice(),sum=d[0]+d[1];
    this.s.orderRolls[p.id]=sum;
    this.s.orderHistory.push({playerId:p.id,dice:d,sum});
    this.log(`${p.name}: rzut o kolejność ${d[0]} + ${d[1]}.`);
    if(group.every(id=>Object.hasOwn(this.s.orderRolls,id))) {
      const scores=[...new Set(group.map(id=>this.s.orderRolls[id]))].sort((a,b)=>b-a);
      const split=scores.map(score=>group.filter(id=>this.s.orderRolls[id]===score));
      this.s.orderGroups.splice(this.s.orderGroups.indexOf(group),1,...split);
      this.s.orderRolls={};
      if(this.s.orderGroups.every(g=>g.length===1)) {
        this.s.order=this.s.orderGroups.flat(); this.s.turn=this.s.order[0];
        this.s.phase='roll'; this.s.turnNumber=1;
        this.log(`Zaczyna ${this.player(this.s.turn).name}.`);
      } else this.log('Pozostał remis. Rzucają gracze z wyróżnionej grupy.');
    }
  }
  nextTurn() {
    if(this.checkWinner()) return;
    const i=this.s.order.indexOf(this.s.turn);
    const rotated=[...this.s.order.slice(i+1),...this.s.order.slice(0,i+1)];
    const next=rotated.find(id=>!this.player(id).bankrupt&&!this.player(id).skipped);
    if(!next) { this.s.phase='paused'; this.s.turn=null; return; }
    this.s.turn=next; this.s.phase='roll'; this.s.doubles=0; this.s.extraRoll=false; this.s.turnNumber++;
    this.log(`Tura: ${this.player(next).name}.`);
  }
  roll(p) {
    this.current(p); this.clearPending();
    need(this.s.phase==='roll' || (this.s.phase==='end'&&this.s.extraRoll),'Już rzuciłeś. Zakończ turę.');
    const d=this.dice(),sum=d[0]+d[1],double=d[0]===d[1];
    this.log(`${p.name} rzuca ${d[0]} + ${d[1]}.`);
    this.s.phase='end'; this.s.extraRoll=false;
    if(p.jail) {
      p.jailAttempts++;
      if(double) { p.jail=false;p.jailAttempts=0;this.move(p,sum); }
      else if(p.jailAttempts>=3) {
        this.s.queue.unshift({type:'pay',playerId:p.id,amount:50,creditorId:null,reason:'trzecia próba wyjścia z więzienia'},{type:'jailReleaseMove',playerId:p.id,steps:sum});
      } else this.log(`${p.name} pozostaje w więzieniu (${p.jailAttempts}/3).`);
      return;
    }
    this.s.doubles=double?this.s.doubles+1:0;
    if(this.s.doubles===3) { this.sendJail(p); return; }
    this.s.extraRoll=double;
    this.move(p,sum);
  }
  move(p,steps,{back=false,stationDouble=false,utilityTen=false}={}) {
    const from=p.pos;
    if(!back && from+steps>=40) { p.cash+=200;this.log(`${p.name} przechodzi przez START: +200€.`); }
    p.pos=(from+steps+40)%40;
    this.s.movement={id:randomUUID(),playerId:p.id,from,to:p.pos,steps,teleport:false};
    this.log(`${p.name} wchodzi na ${BOARD[p.pos].name}.`);
    this.land(p,{stationDouble,utilityTen});
  }
  moveTo(p,to,options={}) { this.move(p,(to-p.pos+40)%40 || (to===0?40:0),options); }
  sendJail(p) {
    this.s.movement={id:randomUUID(),playerId:p.id,from:p.pos,to:10,steps:0,teleport:true};
    p.pos=10;p.jail=true;p.jailAttempts=0;this.s.extraRoll=false;this.s.doubles=0;
    this.log(`${p.name} trafia do więzienia. Tura kończy się natychmiast.`);
    this.s.queue.push({type:'nextTurn'});
  }
  land(p,options={}) {
    const f=BOARD[p.pos];
    if(f.price!==null) {
      const a=this.property(f.id);
      if(!a.ownerId) { this.s.pending={kind:'buy',playerId:p.id,field:f.id};return; }
      if(a.ownerId!==p.id&&!a.mortgaged) {
        const amount=this.rent(f.id,options);
        this.s.queue.unshift({type:'pay',playerId:p.id,creditorId:a.ownerId,amount,reason:`czynsz: ${f.name}`});
      }
    } else if(f.type==='tax') this.s.queue.unshift({type:'pay',playerId:p.id,creditorId:null,amount:f.amount,reason:f.name});
    else if(f.type==='goToJail') this.sendJail(p);
    else if(f.type==='chance'||f.type==='chest') this.drawCard(p,f.type);
  }
  rent(id,{stationDouble=false,utilityTen=false}={}) {
    const f=BOARD[id],a=this.property(id);
    if(!a.ownerId||a.mortgaged) return 0;
    const owner=this.player(a.ownerId);
    if(f.type==='city') return f.rents[a.buildings]*(a.buildings===0&&this.complete(owner,id)?2:1);
    if(f.type==='station') { const count=STATION_IDS.filter(i=>this.property(i).ownerId===owner.id).length;return f.rents[count-1]*(stationDouble?2:1); }
    const count=UTILITY_IDS.filter(i=>this.property(i).ownerId===owner.id).length;
    let dice=this.s.dice;
    if(utilityTen) { dice=this.dice();this.log(`Rzut dla medium: ${dice[0]} + ${dice[1]}.`); }
    return (dice[0]+dice[1])*(utilityTen||count===2?10:4);
  }
  drawCard(p,deck) {
    const id=this.s.decks[deck].shift(),c=CARDS[id],e=c.effect;
    this.s.lastCard={...c,eventId:randomUUID(),playerId:p.id};
    this.log(`${p.name} — ${deck==='chance'?'Szansa':'Kasa społeczna'}: ${c.text}`);
    if(e.type==='jailFree') { p.cards.push(id);return; }
    this.s.decks[deck].push(id);
    switch(e.type) {
      case 'receive':p.cash+=e.amount;break;
      case 'pay':this.s.queue.unshift({type:'pay',playerId:p.id,creditorId:null,amount:e.amount,reason:c.text});break;
      case 'move':this.moveTo(p,e.to);break;
      case 'back':this.move(p,-e.steps,{back:true});break;
      case 'jail':this.sendJail(p);break;
      case 'nearest': {
        const ids=e.kind==='station'?STATION_IDS:UTILITY_IDS;
        const to=ids.find(id=>id>p.pos)??ids[0];
        this.moveTo(p,to,{stationDouble:e.kind==='station',utilityTen:e.kind==='utility'});break;
      }
      case 'repairs': {
        const amount=this.owned(p).reduce((n,id)=>{const b=this.property(id).buildings;return n+(b===5?e.hotel:b*e.house);},0);
        this.s.queue.unshift({type:'pay',playerId:p.id,creditorId:null,amount,reason:'remont budynków'});break;
      }
      case 'payEach': this.s.queue.unshift(...this.alive().filter(x=>x.id!==p.id).map(x=>({type:'pay',playerId:p.id,creditorId:x.id,amount:e.amount,reason:'przewodniczący rady'})));break;
      case 'collectEach': this.s.queue.unshift(...this.alive().filter(x=>x.id!==p.id).map(x=>({type:'pay',playerId:x.id,creditorId:p.id,amount:e.amount,reason:`urodziny: ${p.name}`})));break;
    }
  }
  pump() {
    let limit=0;
    while(!this.s.pending && this.s.queue.length && this.s.phase!=='finished') {
      need(++limit<200,'Przekroczono limit operacji.');
      const t=this.s.queue.shift();
      const p=t.playerId?this.player(t.playerId):null;
      if(p?.bankrupt) continue;
      if(t.type==='pay') {
        if(t.creditorId && this.player(t.creditorId).bankrupt) continue;
        if(!t.amount) continue;
        if(p.cash>=t.amount) this.pay(p,t); else { this.s.pending={kind:'debt',...t};this.log(`${p.name} musi zapłacić ${t.amount}€. Sprzedaj budynki, zastaw pola lub handluj.`); }
      } else if(t.type==='jailReleaseMove') { p.jail=false;p.jailAttempts=0;this.move(p,t.steps); }
      else if(t.type==='jailRelease') {p.jail=false;p.jailAttempts=0;}
      else if(t.type==='auction') { if(!this.property(t.field).ownerId) this.startAuction(t.field); }
      else if(t.type==='mortgageTransfer') { if(this.property(t.field).ownerId===p.id&&this.property(t.field).mortgaged) this.s.pending={kind:'mortgage',playerId:p.id,field:t.field}; }
      else if(t.type==='unmortgage') {if(this.property(t.field).ownerId===p.id)this.property(t.field).mortgaged=false;}
      else if(t.type==='nextTurn') this.nextTurn();
    }
    if(!this.s.pending && this.s.turn && this.player(this.s.turn).skipped && this.s.phase!=='order' && this.s.phase!=='finished') this.nextTurn();
  }
  pay(p,t) {
    p.cash-=t.amount;
    if(t.creditorId) this.player(t.creditorId).cash+=t.amount;
    this.log(`${p.name} płaci ${t.amount}€ → ${t.creditorId?this.player(t.creditorId).name:'bank'} (${t.reason}).`);
  }
  settle() {
    const d=this.s.pending;
    if(d?.kind==='debt') {
      const p=this.player(d.playerId);
      if(p.cash>=d.amount) {this.pay(p,d);this.s.pending=null;}
    }
  }
  buy(p) {
    const a=this.s.pending;
    need(a?.kind==='buy'&&a.playerId===p.id,'Nie masz pola do kupienia.');
    this.spend(p,BOARD[a.field].price);this.property(a.field).ownerId=p.id;
    this.log(`${p.name} kupuje ${BOARD[a.field].name} za ${BOARD[a.field].price}€.`);
    this.s.pending=null;
  }
  startAuction(field) {
    need(!this.property(field).ownerId,'Pole ma już właściciela.');
    this.s.pending={kind:'auction',field,high:0,highId:null,bids:{},passed:[],endsAt:this.now()+RULES.auctionDurationMs};
    this.log(`Aukcja: ${BOARD[field].name}. Cena wywoławcza 10€.`);
  }
  bid(p,amount) {
    const a=this.s.pending;
    need(a?.kind==='auction','Nie trwa aukcja.');
    need(!a.passed.includes(p.id),'Spasowałeś w tej aukcji.');
    need(a.highId!==p.id,'Twoja oferta jest już najwyższa.');
    need(integer(amount,Math.max(10,a.high+1)),'Oferta musi być wyższa od aktualnej i wynosić co najmniej 10€.');
    need(p.cash>=amount,'Nie masz tyle gotówki.');
    a.high=amount;a.highId=p.id;a.bids[p.id]=amount;a.endsAt=this.now()+RULES.auctionDurationMs;
    this.log(`${p.name} licytuje ${amount}€.`);
    this.maybeFinishAuction();
  }
  pass(p) {
    const a=this.s.pending;
    need(a?.kind==='auction','Nie trwa aukcja.');
    need(a.highId!==p.id,'Najwyższa oferta jest wiążąca.');
    need(!a.passed.includes(p.id),'Już spasowałeś.');
    a.passed.push(p.id);delete a.bids[p.id];this.maybeFinishAuction();
  }
  maybeFinishAuction() {
    const a=this.s.pending;
    if(a?.kind==='auction' && this.alive().every(p=>p.id===a.highId||a.passed.includes(p.id))) this.finishAuction();
  }
  finishAuction() {
    const a=this.s.pending;if(a?.kind!=='auction')return;
    if(a.highId) {
      const p=this.player(a.highId);
      need(!p.bankrupt&&p.cash>=a.high,'Oferta aukcyjna utraciła pokrycie.');
      p.cash-=a.high;this.property(a.field).ownerId=p.id;
      this.log(`${p.name} wygrywa ${BOARD[a.field].name} za ${a.high}€.`);
    } else this.log(`Brak ofert. ${BOARD[a.field].name} pozostaje w banku.`);
    this.s.pending=null;
  }
  tick() {
    if(this.s.pending?.kind==='auction' && this.now()>=this.s.pending.endsAt) this.transaction(()=>this.finishAuction());
  }
  own(p,id) { const a=this.property(id);need(a.ownerId===p.id,'Nie jesteś właścicielem tego pola.');return a; }
  build(p,id,sell) {
    const a=this.own(p,id),f=BOARD[id];
    need(f.type==='city','Budynki można stawiać tylko w miastach.');
    const group=this.group(id).map(i=>this.property(i));
    if(sell) {
      need(a.buildings>0,'Na tym polu nie ma budynku.');
      need(a.buildings===Math.max(...group.map(x=>x.buildings)),'Sprzedawaj równomiernie, zaczynając od najbardziej zabudowanego pola.');
      if(a.buildings===5) {need(this.s.bank.houses>=4,'Brak 4 domów potrzebnych do zamiany hotelu.');this.s.bank.hotels++;this.s.bank.houses-=4;}
      else this.s.bank.houses++;
      a.buildings--;p.cash+=f.houseCost/2;
      this.log(`${p.name} sprzedaje budynek: ${f.name} (+${f.houseCost/2}€).`);
    } else {
      need(!(this.s.pending?.kind==='debt'&&this.s.pending.playerId===p.id),'Najpierw spłać dług.');
      need(this.complete(p,id),'Potrzebujesz całej grupy bez hipotek.');
      need(a.buildings<5,'Na tym polu stoi już hotel.');
      need(a.buildings===Math.min(...group.map(x=>x.buildings)),'Buduj równomiernie, zaczynając od najmniej zabudowanego pola.');
      if(a.buildings===4) {need(this.s.bank.hotels>0,'W banku zabrakło hoteli.');this.s.bank.hotels--;this.s.bank.houses+=4;}
      else {need(this.s.bank.houses>0,'W banku zabrakło domów.');this.s.bank.houses--;}
      this.spend(p,f.houseCost);a.buildings++;
      this.log(`${p.name} buduje ${a.buildings===5?'hotel':'dom'}: ${f.name}.`);
    }
  }
  mortgage(p,id) {
    const a=this.own(p,id);need(!a.mortgaged,'Pole jest już zastawione.');
    need(this.group(id).every(i=>this.property(i).buildings===0),'Najpierw sprzedaj wszystkie budynki w tej grupie.');
    a.mortgaged=true;p.cash+=BOARD[id].mortgage;this.log(`${p.name} zastawia ${BOARD[id].name}: +${BOARD[id].mortgage}€.`);
  }
  redeem(p,id) {
    const a=this.own(p,id);need(a.mortgaged,'Pole nie jest zastawione.');
    need(!(this.s.pending?.kind==='mortgage'&&this.s.pending.field===id),'Wybierz sposób przejęcia hipoteki w oknie rozliczenia.');
    need(!(this.s.pending?.kind==='debt'&&this.s.pending.playerId===p.id),'Najpierw spłać wymagalny dług.');
    this.spend(p,redemption(id));a.mortgaged=false;this.log(`${p.name} wykupuje ${BOARD[id].name}.`);
  }
  jailPay(p) {
    this.current(p);this.clearPending();need(p.jail&&this.s.phase==='roll','Opłać wyjście przed rzutem w więzieniu.');
    this.s.queue.unshift({type:'pay',playerId:p.id,creditorId:null,amount:50,reason:'wyjście z więzienia'},{type:'jailRelease',playerId:p.id});
  }
  jailCard(p,id) {
    this.current(p);this.clearPending();need(p.jail&&this.s.phase==='roll','Kartę można użyć przed rzutem w więzieniu.');
    const chosen=id||p.cards[0];need(p.cards.includes(chosen),'Nie masz tej karty.');
    p.cards=p.cards.filter(x=>x!==chosen);this.s.decks[CARDS[chosen].deck].push(chosen);
    p.jail=false;p.jailAttempts=0;this.log(`${p.name} wychodzi z więzienia za pomocą karty.`);
  }
  mortgageChoice(p,redeem) {
    const q=this.s.pending;need(q?.kind==='mortgage'&&q.playerId===p.id,'Nie masz hipoteki do rozliczenia.');
    this.s.pending=null;
    const tasks=[{type:'pay',playerId:p.id,creditorId:null,amount:redeem?redemption(q.field):interest(q.field),reason:`przejęta hipoteka: ${BOARD[q.field].name}`}];
    if(redeem)tasks.push({type:'unmortgage',playerId:p.id,field:q.field});
    this.s.queue.unshift(...tasks);
  }
  tradeSide(side) {
    need(side&&typeof side==='object'&&integer(side.cash),'Podaj poprawną kwotę wymiany.');
    need(Array.isArray(side.fields)&&side.fields.length<=28&&new Set(side.fields).size===side.fields.length,'Nieprawidłowa lista pól.');
    need(side.fields.every(id=>integer(id,0,39)&&this.s.properties[id]),'Nieprawidłowe pole.');
    need(Array.isArray(side.cards)&&side.cards.length<=2&&new Set(side.cards).size===side.cards.length&&side.cards.every(id=>CARDS[id]?.effect.type==='jailFree'),'Nieprawidłowe karty.');
    return {cash:side.cash,fields:[...side.fields],cards:[...side.cards]};
  }
  validateSide(p,side) {
    need(!p.bankrupt,'Gracz już zbankrutował.');
    need(this.available(p)>=side.cash,'Brakuje gotówki na wymianę.');
    for(const id of side.fields) {
      this.own(p,id);need(this.group(id).every(i=>this.property(i).buildings===0),'Nie wolno handlować polami z zabudowanej grupy.');
      need(!(this.s.pending?.kind==='mortgage'&&this.s.pending.field===id)&&!this.s.queue.some(t=>t.type==='mortgageTransfer'&&t.field===id),'Najpierw rozlicz odsetki po odziedziczeniu hipoteki.');
    }
    need(side.cards.every(id=>p.cards.includes(id)),'Karta nie należy już do gracza.');
  }
  tradeOffer(p,data) {
    const to=this.player(data.to);need(to.id!==p.id&&!to.bankrupt,'Wybierz innego aktywnego gracza.');
    const give=this.tradeSide(data.give),take=this.tradeSide(data.take);
    need(give.cash||take.cash||give.fields.length||take.fields.length||give.cards.length||take.cards.length,'Oferta jest pusta.');
    this.validateSide(p,give);this.validateSide(to,take);
    const redeemFields=Array.isArray(data.redeemFields)?data.redeemFields:[];
    need(redeemFields.every(id=>take.fields.includes(id)),'Nieprawidłowy wykup hipoteki.');
    const offer={id:randomUUID(),from:p.id,to:to.id,give,take,redeemFields,createdAt:this.now()};
    this.s.trades=this.s.trades.filter(t=>t.from!==p.id);
    this.s.trades.push(offer);this.log(`${p.name} proponuje wymianę graczowi ${to.name}.`);
  }
  tradeAccept(p,data) {
    const t=this.s.trades.find(t=>t.id===data.id);need(t&&t.to===p.id,'Oferta nie istnieje lub nie jest do ciebie.');
    const from=this.player(t.from);
    this.validateSide(from,t.give);this.validateSide(p,t.take);
    const redeemFields=Array.isArray(data.redeemFields)?data.redeemFields:[];
    need(redeemFields.every(id=>t.give.fields.includes(id)),'Nieprawidłowy wykup hipoteki.');
    // Fees are part of the same transaction; incoming cash may fund them.
    const fee=(side,redeems)=>side.fields.reduce((n,id)=>n+(this.property(id).mortgaged?(redeems.includes(id)?redemption(id):interest(id)):0),0);
    const fromFee=fee(t.take,t.redeemFields),toFee=fee(t.give,redeemFields);
    need(this.available(from)-t.give.cash+t.take.cash>=fromFee,'Autor oferty nie ma środków na odsetki od przejmowanych hipotek.');
    need(this.available(p)-t.take.cash+t.give.cash>=toFee,'Brakuje środków na odsetki od przejmowanych hipotek.');
    from.cash+=t.take.cash-t.give.cash-fromFee;p.cash+=t.give.cash-t.take.cash-toFee;
    const transfer=(a,b,side,redeems)=>{
      for(const id of side.fields){const asset=this.property(id);asset.ownerId=b.id;if(redeems.includes(id))asset.mortgaged=false;}
      a.cards=a.cards.filter(id=>!side.cards.includes(id));b.cards.push(...side.cards);
    };
    transfer(from,p,t.give,redeemFields);transfer(p,from,t.take,t.redeemFields);
    this.s.trades=this.s.trades.filter(x=>x.id!==t.id);
    this.log(`${from.name} i ${p.name} finalizują wymianę.`);
  }
  tradeReject(p,id) {
    const t=this.s.trades.find(t=>t.id===id);need(t&&(t.to===p.id||t.from===p.id),'Nie ma takiej oferty.');
    this.s.trades=this.s.trades.filter(t=>t.id!==id);
  }
  cancelTrades(id) { this.s.trades=this.s.trades.filter(t=>t.from!==id&&t.to!==id); }
  bankrupt(p,creditorId=null) {
    if(p.bankrupt)return;
    const creditor=creditorId?this.player(creditorId):null;
    const assets=this.owned(p),extra=[];
    // On bankruptcy buildings are liquidated for half their total cost.
    for(const id of assets) {
      const a=this.property(id),f=BOARD[id];
      if(a.buildings===5)this.s.bank.hotels++;else this.s.bank.houses+=a.buildings;
      p.cash+=a.buildings*(f.houseCost||0)/2;a.buildings=0;
      if(creditor&&!creditor.bankrupt) {a.ownerId=creditor.id;if(a.mortgaged)extra.push({type:'mortgageTransfer',playerId:creditor.id,field:id});}
      else {a.ownerId=null;a.mortgaged=false;extra.push({type:'auction',field:id});}
    }
    if(creditor&&!creditor.bankrupt){creditor.cash+=p.cash;creditor.cards.push(...p.cards);}
    else for(const id of p.cards)this.s.decks[CARDS[id].deck].push(id);
    p.cards=[];p.cash=0;p.bankrupt=true;p.jail=false;this.cancelTrades(p.id);
    const a=this.s.pending;
    if(a?.playerId===p.id)this.s.pending=null;
    if(a?.kind==='auction') {
      delete a.bids[p.id];a.passed=a.passed.filter(id=>id!==p.id);
      if(a.highId===p.id) {
        const bids=Object.entries(a.bids).filter(([id])=>!this.player(id).bankrupt).sort((a,b)=>b[1]-a[1]);
        a.highId=bids[0]?.[0]??null;a.high=bids[0]?.[1]??0;a.endsAt=this.now()+RULES.auctionDurationMs;
      }
    }
    this.s.queue=this.s.queue.filter(t=>t.playerId!==p.id&&t.creditorId!==p.id);
    this.s.queue.unshift(...extra);
    if(this.s.turn===p.id) {this.s.extraRoll=false;this.s.queue.push({type:'nextTurn'});}
    this.log(`${p.name} bankrutuje. Majątek przejmuje ${creditor?.name||'bank'}.`);
    this.maybeFinishAuction();
  }
  checkWinner() {
    if(this.s.phase==='finished')return true;
    const alive=this.alive();
    // Settle inherited mortgages before declaring the winner.
    if(alive.length===1 && !this.s.pending && !this.s.queue.length) {
      this.s.winner=alive[0].id;this.s.phase='finished';this.s.endedAt=this.now();this.s.trades=[];
      this.log(`Zwycięża ${alive[0].name}!`);return true;
    }
    if(!alive.length){this.s.phase='finished';this.s.endedAt=this.now();return true;}
    return false;
  }
  disconnect(id) { this.cancelTrades(id);this.s.revision++; }
  reconnect(id) {
    const p=this.player(id);p.skipped=false;
    if(this.s.phase==='paused'&&!p.bankrupt)this.nextTurn();
    this.s.revision++;
  }
  skip(id) {
    if(this.s.phase==='finished')return;
    this.transaction(()=>{
      const p=this.player(id);p.skipped=true;this.cancelTrades(id);
      if(this.s.phase==='order') {
        // A disconnected player keeps their slot; room members can wait or remove them.
        return;
      }
      const a=this.s.pending;
      if(a?.kind==='buy'&&a.playerId===id)this.startAuction(a.field);
      if(this.s.turn===id&&!this.s.pending)this.nextTurn();
    });
  }
  removeDisconnected(id) {
    this.transaction(()=>{
      const p=this.player(id);
      if(this.s.phase==='order') {
        p.bankrupt=true;this.s.orderGroups=this.s.orderGroups.map(g=>g.filter(x=>x!==id)).filter(g=>g.length);
        this.s.orderRolls={};
        if(this.s.orderGroups.every(g=>g.length===1)){this.s.order=this.s.orderGroups.flat();this.s.turn=this.s.order[0];this.s.phase='roll';this.s.turnNumber=1;}
      } else this.bankrupt(p,null);
    });
  }
  view(viewerId) {
    const {decks,queue,...state}=structuredClone(this.s);
    state.trades=state.trades.filter(t=>t.from===viewerId||t.to===viewerId);
    state.players=state.players.map(p=>({...p,wealth:this.wealth(p),liquidValue:this.liquidValue(p),fields:this.owned(p)}));
    state.deckCounts={chance:decks.chance.length,chest:decks.chest.length};
    return state;
  }
  assertInvariants() {
    let houses=this.s.bank.houses,hotels=this.s.bank.hotels;
    for(const id of PURCHASABLE_IDS){const a=this.property(id);need(integer(a.buildings,0,5),'Nieprawidłowa zabudowa.');if(a.buildings===5)hotels++;else houses+=a.buildings;need(!a.mortgaged||a.buildings===0,'Zastaw z budynkami.');need(!a.ownerId||!this.player(a.ownerId).bankrupt,'Majątek bankruta.');}
    need(houses===32&&hotels===12&&this.s.bank.houses>=0&&this.s.bank.hotels>=0,'Naruszenie zasobów banku.');
    for(const p of this.s.players)need(integer(p.cash),'Nieprawidłowe saldo.');
    const cards=[...this.s.decks.chance,...this.s.decks.chest,...this.s.players.flatMap(p=>p.cards)];
    need(cards.length===32&&new Set(cards).size===32,'Naruszenie integralności talii.');
  }
}
