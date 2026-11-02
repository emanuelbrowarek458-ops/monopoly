import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Game, GameError } from './Game.js';
import { RULES, PLAYER_COLORS } from './board.js';

const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const requireValue=(ok,message)=>{if(!ok)throw new GameError(message);};
export function cleanText(value,max) {
  requireValue(typeof value==='string','Oczekiwano tekstu.');
  const text=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/g,'').trim();
  requireValue(text.length>0&&[...text].length<=max,`Tekst musi mieć od 1 do ${max} znaków.`);
  return text;
}
export class Rooms {
  constructor({now=Date.now,gameOptions={}}={}) {this.rooms=new Map();this.now=now;this.gameOptions=gameOptions;}
  code() {let code;do{code=Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');}while(this.rooms.has(code));return code;}
  get(code) {requireValue(typeof code==='string','Podaj kod pokoju.');const r=this.rooms.get(code.toUpperCase().trim());requireValue(r,'Nie istnieje pokój o tym kodzie.');return r;}
  create(name,socketId) {
    requireValue(this.rooms.size<500,'Serwer jest pełny. Spróbuj później.');
    const room={code:this.code(),hostId:null,members:[],game:null,chat:[],createdAt:this.now(),emptySince:null};
    const member=this.add(room,name,socketId);room.hostId=member.id;this.rooms.set(room.code,room);return {room,member};
  }
  add(room,name,socketId) {
    name=cleanText(name,16);
    requireValue(!room.game,'Gra już się rozpoczęła.');
    requireValue(room.members.length<6,'Pokój jest pełny (maksymalnie 6 graczy).');
    requireValue(!room.members.some(p=>p.name.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl')),'Ten nick jest już zajęty.');
    const color=PLAYER_COLORS.find(c=>!room.members.some(p=>p.color===c));
    const member={id:randomUUID(),token:randomBytes(32).toString('hex'),name,color,socketId,connected:true,disconnectedAt:null,decisionAt:null,timedOut:false};
    room.members.push(member);room.emptySince=null;return member;
  }
  join(code,name,socketId) {const room=this.get(code);return {room,member:this.add(room,name,socketId)};}
  resume(code,token,socketId) {
    const room=this.get(code);requireValue(typeof token==='string'&&token.length===64,'Nieprawidłowa sesja.');
    const member=room.members.find(p=>p.token===token);requireValue(member,'Sesja wygasła lub gracz został usunięty.');
    const oldSocketId=member.socketId;
    Object.assign(member,{socketId,connected:true,disconnectedAt:null,decisionAt:null,timedOut:false});room.emptySince=null;
    room.game?.reconnect(member.id);this.transferHost(room);return {room,member,oldSocketId};
  }
  transferHost(room) {
    if(!room.members.some(p=>p.id===room.hostId&&p.connected))room.hostId=room.members.find(p=>p.connected)?.id||room.members[0]?.id||null;
  }
  disconnect(code,id,socketId) {
    const room=this.rooms.get(code),m=room?.members.find(p=>p.id===id);
    if(!m||m.socketId!==socketId)return;
    m.connected=false;m.socketId=null;m.disconnectedAt=this.now();m.decisionAt=this.now()+RULES.disconnectGraceMs;
    room.game?.disconnect(id);this.transferHost(room);
    if(room.members.every(p=>!p.connected))room.emptySince=this.now();
  }
  lobbyAction(room,id,type,data) {
    const m=room.members.find(p=>p.id===id);requireValue(m,'Nie należysz do pokoju.');
    if(type==='color') {
      requireValue(!room.game,'Kolor wybierz przed grą.');requireValue(PLAYER_COLORS.includes(data.color),'Nieprawidłowy kolor.');
      requireValue(!room.members.some(p=>p.id!==id&&p.color===data.color),'Ten kolor jest zajęty.');m.color=data.color;
    } else if(type==='start') {
      requireValue(room.hostId===id,'Tylko gospodarz może rozpocząć grę.');requireValue(!room.game,'Gra już trwa.');
      requireValue(room.members.length>=2,'Potrzeba co najmniej 2 graczy.');requireValue(room.members.every(p=>p.connected),'Poczekaj na powrót graczy lub usuń nieobecnych.');
      room.game=new Game(room.members,{now:this.now,...this.gameOptions});
    } else if(type==='kick') {
      requireValue(room.hostId===id,'Tylko gospodarz może usuwać graczy.');requireValue(!room.game,'Nie można wyrzucać graczy w trakcie gry.');requireValue(data.id!==id,'Nie możesz wyrzucić siebie.');
      const target=room.members.find(p=>p.id===data.id);requireValue(target,'Nie ma takiego gracza.');room.members=room.members.filter(p=>p.id!==data.id);return target;
    } else if(type==='replay') {
      requireValue(room.hostId===id,'Tylko gospodarz może wrócić do lobby.');requireValue(room.game?.s.phase==='finished','Gra jeszcze trwa.');
      room.game=null;room.members=room.members.filter(p=>p.connected);this.transferHost(room);
    } else if(type==='wait'||type==='removeAbsent') {
      const target=room.members.find(p=>p.id===data.id);requireValue(target&&!target.connected&&target.disconnectedAt!==null&&this.now()>=target.decisionAt,'Ten gracz ma jeszcze czas na powrót.');
      requireValue(target.id!==id,'Nie możesz rozstrzygnąć własnej nieobecności.');
      requireValue(!room.game||!room.game.player(id).bankrupt,'Decyzję podejmują pozostali aktywni gracze.');
      if(type==='wait') {target.decisionAt=this.now()+RULES.disconnectGraceMs;}
      else {if(room.game)room.game.removeDisconnected(target.id);else room.members=room.members.filter(p=>p.id!==target.id);target.decisionAt=Infinity;}
    } else throw new GameError('Nieznana akcja pokoju.');
  }
  chat(room,id,value) {
    const text=cleanText(value,300),m=room.members.find(p=>p.id===id);requireValue(m,'Nie należysz do pokoju.');
    room.chat.push({id:randomUUID(),playerId:id,name:m.name,color:m.color,text,time:this.now()});room.chat=room.chat.slice(-100);
  }
  tick() {
    const changed=[];
    for(const [code,r] of this.rooms) {
      if(r.emptySince!==null&&this.now()-r.emptySince>=RULES.emptyRoomTtlMs){this.rooms.delete(code);continue;}
      let dirty=false;
      for(const m of r.members)if(!m.connected&&!m.timedOut&&m.disconnectedAt!==null&&this.now()-m.disconnectedAt>=RULES.disconnectGraceMs) {m.timedOut=true;r.game?.skip(m.id);dirty=true;}
      const before=r.game?.s.revision;r.game?.tick();
      if(dirty||before!==r.game?.s.revision)changed.push(r);
    }
    return changed;
  }
  view(room,id) {
    return {code:room.code,hostId:room.hostId,you:id,serverTime:this.now(),
      members:room.members.map(({token,socketId,...m})=>({...m,decisionAt:Number.isFinite(m.decisionAt)?m.decisionAt:null})),
      chat:room.chat,game:room.game?.view(id)||null};
  }
}
