/* Socket.IO contract (ack: {ok:true,...} or {ok:false,error:string}):
 * Client → server:
 * room:create {name}; room:join {code,name}; room:resume {code,token}
 *   ack success: {code,token,playerId}. Token is private, never broadcast.
 * room:action {type:'color'|'start'|'kick'|'replay'|'wait'|'removeAbsent',data:{...}}
 * game:action {type:'orderRoll'|'roll'|'end'|'buy'|'decline'|'bid'|'pass'|
 *   'build'|'sell'|'mortgage'|'redeem'|'jailPay'|'jailCard'|'mortgageChoice'|
 *   'tradeOffer'|'tradeAccept'|'tradeReject'|'bankrupt'|'surrender',data:{...}}
 *   bid: {amount}; property actions: {field}; jailCard: {card};
 *   mortgageChoice: {redeem:boolean}; tradeOffer: {to,give,take,redeemFields};
 *   give/take: {cash,fields:number[],cards:string[]};
 *   tradeAccept: {id,redeemFields}; tradeReject: {id}.
 * chat:send {text}
 * Server → client:
 * room:state {code,hostId,you,serverTime,members,chat,game};
 * room:kicked {message}; session:replaced {message}.
 * Only authenticated room members receive state. Deck order/session secrets stay server-side.
 */
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname,join,resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { Rooms } from './rooms.js';
import { GameError } from './Game.js';
import { BOARD,GROUPS,PLAYER_COLORS,RULES } from './board.js';

const base=dirname(fileURLToPath(import.meta.url));
export function createApp({rooms=new Rooms(),tickMs=500}={}) {
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    next();
  });
  app.get('/health',(_req,res)=>res.json({ok:true,app:'europoly',version:'1.0.0'}));
  app.get('/api/config',(_req,res)=>res.json({board:BOARD,groups:GROUPS,colors:PLAYER_COLORS,rules:RULES}));
  for (const [route,file] of [['/','index.html'],['/style.css','style.css'],['/client.js','client.js']]) app.get(route,(_req,res)=>res.sendFile(join(base,file)));
  const http=createServer(app);
  const io=new Server(http,{maxHttpBufferSize:16384,serveClient:true,perMessageDeflate:false});
  const broadcast=room=>{for(const m of room.members)if(m.connected&&m.socketId)io.to(m.socketId).emit('room:state',rooms.view(room,m.id));};
  io.on('connection',socket=>{
    let budget=30,last=Date.now(),chatAt=0;
    socket.use((packet,next)=>{
      const now=Date.now();budget=Math.min(30,budget+(now-last)*0.015);last=now;
      if(budget<1){const ack=packet.at(-1);if(typeof ack==='function')ack({ok:false,error:'Zbyt wiele akcji. Odczekaj chwilę.'});return;}
      budget--;next();
    });
    const wrap=fn=>(payload,ack)=>{
      try {if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new GameError('Nieprawidłowy komunikat.');const result=fn(payload)||{};if(typeof ack==='function')ack({ok:true,...result});}
      catch(e){if(!(e instanceof GameError))console.error(e);if(typeof ack==='function')ack({ok:false,error:e instanceof GameError?e.message:'Błąd serwera. Spróbuj ponownie.'});}
    };
    const memberRoom=()=>{
      if(!socket.data.code)throw new GameError('Najpierw dołącz do pokoju.');
      const room=rooms.get(socket.data.code),m=room.members.find(p=>p.id===socket.data.playerId);
      if(!m||m.socketId!==socket.id)throw new GameError('Ta sesja nie jest aktywna.');return room;
    };
    const attach=result=>{
      const {room,member,oldSocketId}=result;
      if(oldSocketId&&oldSocketId!==socket.id){const old=io.sockets.sockets.get(oldSocketId);if(old){old.emit('session:replaced',{message:'Gra została otwarta w innej karcie.'});old.data={};old.disconnect(true);}}
      socket.data.code=room.code;socket.data.playerId=member.id;broadcast(room);
      return {code:room.code,token:member.token,playerId:member.id};
    };
    const unattached=()=>{if(socket.data.code)throw new GameError('Należysz już do pokoju.');};
    socket.on('room:create',wrap(d=>{unattached();return attach(rooms.create(d.name,socket.id));}));
    socket.on('room:join',wrap(d=>{unattached();return attach(rooms.join(d.code,d.name,socket.id));}));
    socket.on('room:resume',wrap(d=>{unattached();return attach(rooms.resume(d.code,d.token,socket.id));}));
    socket.on('room:action',wrap(d=>{
      const room=memberRoom(),removed=rooms.lobbyAction(room,socket.data.playerId,d.type,d.data||{});
      if(removed?.socketId){const s=io.sockets.sockets.get(removed.socketId);if(s){s.emit('room:kicked',{message:'Gospodarz usunął cię z pokoju.'});s.data={};s.disconnect(true);}}
      broadcast(room);
    }));
    socket.on('game:action',wrap(d=>{
      const room=memberRoom();if(!room.game)throw new GameError('Gra jeszcze się nie rozpoczęła.');
      room.game.action(socket.data.playerId,d.type,d.data||{});broadcast(room);
    }));
    socket.on('chat:send',wrap(d=>{const room=memberRoom();if(Date.now()-chatAt<600)throw new GameError('Wysyłasz wiadomości zbyt szybko.');chatAt=Date.now();rooms.chat(room,socket.data.playerId,d.text);broadcast(room);}));
    socket.on('disconnect',()=>{const {code,playerId}=socket.data;if(!code)return;rooms.disconnect(code,playerId,socket.id);const room=rooms.rooms.get(code);if(room)broadcast(room);});
  });
  const timer=setInterval(()=>{try{for(const room of rooms.tick())broadcast(room);}catch(e){console.error('Timer:',e);}},tickMs);timer.unref();
  return {app,http,io,rooms,close:()=>new Promise(done=>{clearInterval(timer);io.close(()=>{if(http.listening)http.close(done);else done();});})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {http}=createApp();const port=Number(process.env.PORT)||3000;
  http.listen(port,'0.0.0.0',()=>{
    console.log(`EUROPOLY działa: http://localhost:${port}`);
    for(const list of Object.values(networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`Sieć lokalna: http://${n.address}:${port}`);
  });
}
