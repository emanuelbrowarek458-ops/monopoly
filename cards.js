import { randomInt } from 'node:crypto';
const make = (deck, list) => list.map(([text, effect], i) => ({ id: `${deck}-${i+1}`, deck, text, effect }));
export const CHANCE_CARDS = make('chance', [
  ['Idź na START. Pobierz 200€.', {type:'move',to:0}],
  ['Leć do Tokio. Po drodze pobierz 200€ za START.', {type:'move',to:34}],
  ['Leć do Dubaju. Po drodze pobierz 200€ za START.', {type:'move',to:24}],
  ['Idź na najbliższe medium. Za cudze, niezastawione medium zapłać 10 × sumę nowego rzutu.', {type:'nearest',kind:'utility'}],
  ['Idź na najbliższy dworzec. Zapłać podwójny czynsz, jeśli jest cudzy.', {type:'nearest',kind:'station'}],
  ['Idź na najbliższy dworzec. Zapłać podwójny czynsz, jeśli jest cudzy.', {type:'nearest',kind:'station'}],
  ['Dywidenda bankowa. Pobierz 50€.', {type:'receive',amount:50}],
  ['Wyjdź z więzienia za darmo. Zachowaj lub sprzedaj tę kartę.', {type:'jailFree'}],
  ['Cofnij się o 3 pola i wykonaj akcję pola.', {type:'back',steps:3}],
  ['Idź prosto do więzienia. Nie pobierasz 200€ za START.', {type:'jail'}],
  ['Generalny remont: zapłać 25€ za każdy dom i 100€ za każdy hotel.', {type:'repairs',house:25,hotel:100}],
  ['Zapłać grzywnę 15€.', {type:'pay',amount:15}],
  ['Idź na Atlantic Express. Po drodze pobierz 200€ za START.', {type:'move',to:5}],
  ['Leć do Nowego Jorku.', {type:'move',to:39}],
  ['Zostałeś przewodniczącym rady. Zapłać każdemu graczowi 50€.', {type:'payEach',amount:50}],
  ['Twoja pożyczka budowlana dojrzała. Pobierz 150€.', {type:'receive',amount:150}]
]);
export const CHEST_CARDS = make('chest', [
  ['Idź na START. Pobierz 200€.', {type:'move',to:0}],
  ['Błąd bankowy na twoją korzyść. Pobierz 200€.', {type:'receive',amount:200}],
  ['Opłata za lekarza. Zapłać 50€.', {type:'pay',amount:50}],
  ['Ze sprzedaży akcji dostajesz 50€.', {type:'receive',amount:50}],
  ['Wyjdź z więzienia za darmo. Zachowaj lub sprzedaj tę kartę.', {type:'jailFree'}],
  ['Idź prosto do więzienia. Nie pobierasz 200€ za START.', {type:'jail'}],
  ['Fundusz urlopowy dojrzał. Pobierz 100€.', {type:'receive',amount:100}],
  ['Zwrot podatku dochodowego. Pobierz 20€.', {type:'receive',amount:20}],
  ['Masz urodziny! Pobierz 10€ od każdego gracza.', {type:'collectEach',amount:10}],
  ['Ubezpieczenie na życie dojrzało. Pobierz 100€.', {type:'receive',amount:100}],
  ['Opłata szpitalna. Zapłać 100€.', {type:'pay',amount:100}],
  ['Opłata szkolna. Zapłać 50€.', {type:'pay',amount:50}],
  ['Pobierz 25€ opłaty konsultacyjnej.', {type:'receive',amount:25}],
  ['Remont ulic: zapłać 40€ za dom i 115€ za hotel.', {type:'repairs',house:40,hotel:115}],
  ['Drugie miejsce w konkursie piękności. Pobierz 10€.', {type:'receive',amount:10}],
  ['Dziedziczysz 100€.', {type:'receive',amount:100}]
]);
export const CARDS = Object.fromEntries([...CHANCE_CARDS,...CHEST_CARDS].map(c => [c.id,c]));
export function shuffle(values, rng = randomInt) {
  const a = [...values];
  for (let i=a.length-1;i>0;i--) { const j=rng(0,i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
export const createDecks = (rng = randomInt) => ({ chance:shuffle(CHANCE_CARDS.map(c=>c.id),rng), chest:shuffle(CHEST_CARDS.map(c=>c.id),rng) });
