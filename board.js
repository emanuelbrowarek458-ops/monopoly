export const RULES = Object.freeze({ minPlayers: 2, maxPlayers: 6, startingCash: 1500, startSalary: 200, jailFee: 50, houses: 32, hotels: 12, auctionMinimum: 10, auctionDurationMs: 20000, disconnectGraceMs: 120000, emptyRoomTtlMs: 600000 });
export const PLAYER_COLORS = ['#ef6b73', '#65b8ff', '#63d5a2', '#f2ca66', '#ba91f5', '#fb9864'];
export const GROUPS = {
  brown: { name: 'Brązowy', color: '#a87b65', ids: [1, 3] },
  lightblue: { name: 'Jasnoniebieski', color: '#82cae4', ids: [6, 8, 9] },
  pink: { name: 'Różowy', color: '#db87b7', ids: [11, 13, 14] },
  orange: { name: 'Pomarańczowy', color: '#ed9f65', ids: [16, 18, 19] },
  red: { name: 'Czerwony', color: '#dc696a', ids: [21, 23, 24] },
  yellow: { name: 'Żółty', color: '#e3c25e', ids: [26, 27, 29] },
  green: { name: 'Zielony', color: '#72b48c', ids: [31, 32, 34] },
  darkblue: { name: 'Granatowy', color: '#818ed9', ids: [37, 39] }
};
const special = (id, name, type, extra = {}) => ({ id, name, type, group: null, price: null, rents: [], houseCost: null, mortgage: null, ...extra });
const city = (id, name, group, price, rents, houseCost) => ({ id, name, type: 'city', group, price, rents, houseCost, mortgage: price / 2 });
const station = (id, name) => ({ id, name, type: 'station', group: 'stations', price: 200, rents: [25,50,100,200], houseCost: null, mortgage: 100 });
const utility = (id, name) => ({ id, name, type: 'utility', group: 'utilities', price: 150, rents: [4,10], houseCost: null, mortgage: 75 });
export const BOARD = [
  special(0,'START','start'),
  city(1,'Sofia','brown',60,[2,10,30,90,160,250],50),
  special(2,'Kasa społeczna','chest'),
  city(3,'Bukareszt','brown',60,[4,20,60,180,320,450],50),
  special(4,'Podatek dochodowy','tax',{amount:200}),
  station(5,'Berlin Hbf'),
  city(6,'Warszawa','lightblue',100,[6,30,90,270,400,550],50),
  special(7,'Szansa','chance'),
  city(8,'Praga','lightblue',100,[6,30,90,270,400,550],50),
  city(9,'Budapeszt','lightblue',120,[8,40,100,300,450,600],50),
  special(10,'Więzienie / odwiedziny','jail'),
  city(11,'Ateny','pink',140,[10,50,150,450,625,750],100),
  utility(12,'Elektrownia'),
  city(13,'Lizbona','pink',140,[10,50,150,450,625,750],100),
  city(14,'Dublin','pink',160,[12,60,180,500,700,900],100),
  station(15,'Paris Gare de Lyon'),
  city(16,'Bruksela','orange',180,[14,70,200,550,750,950],100),
  special(17,'Kasa społeczna','chest'),
  city(18,'Amsterdam','orange',180,[14,70,200,550,750,950],100),
  city(19,'Kopenhaga','orange',200,[16,80,220,600,800,1000],100),
  special(20,'Darmowy Parking','parking'),
  city(21,'Wiedeń','red',220,[18,90,250,700,875,1050],150),
  special(22,'Szansa','chance'),
  city(23,'Zurych','red',220,[18,90,250,700,875,1050],150),
  city(24,'Sztokholm','red',240,[20,100,300,750,925,1100],150),
  station(25,'Wien Hbf'),
  city(26,'Oslo','yellow',260,[22,110,330,800,975,1150],150),
  city(27,'Helsinki','yellow',260,[22,110,330,800,975,1150],150),
  utility(28,'Wodociągi'),
  city(29,'Monachium','yellow',280,[24,120,360,850,1025,1200],150),
  special(30,'Idź do więzienia','goToJail'),
  city(31,'Mediolan','green',300,[26,130,390,900,1100,1275],200),
  city(32,'Madryt','green',300,[26,130,390,900,1100,1275],200),
  special(33,'Kasa społeczna','chest'),
  city(34,'Rzym','green',320,[28,150,450,1000,1200,1400],200),
  station(35,'Roma Termini'),
  special(36,'Szansa','chance'),
  city(37,'Paryż','darkblue',350,[35,175,500,1100,1300,1500],200),
  special(38,'Podatek od luksusu','tax',{amount:100}),
  city(39,'Londyn','darkblue',400,[50,200,600,1400,1700,2000],200)
].map(f => Object.freeze({ ...f, rents: Object.freeze(f.rents) }));
Object.freeze(BOARD);
export const PURCHASABLE_IDS = BOARD.filter(f => f.price !== null).map(f => f.id);
export const STATION_IDS = [5,15,25,35];
export const UTILITY_IDS = [12,28];
export const interest = id => Math.ceil(BOARD[id].mortgage / 10);
export const redemption = id => BOARD[id].mortgage + interest(id);
export const createPropertyState = () => Object.fromEntries(PURCHASABLE_IDS.map(id => [id,{ ownerId:null, mortgaged:false, buildings:0 }]));
