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
const CITY_DETAILS = {"1": {"country": "Maroko", "countryCode": "MA", "landmark": "gate"}, "3": {"country": "Egipt", "countryCode": "EG", "landmark": "pyramid"}, "6": {"country": "RPA", "countryCode": "ZA", "landmark": "mountain"}, "8": {"country": "Kenia", "countryCode": "KE", "landmark": "tree"}, "9": {"country": "Brazylia", "countryCode": "BR", "landmark": "christ"}, "11": {"country": "Argentyna", "countryCode": "AR", "landmark": "obelisk"}, "13": {"country": "Meksyk", "countryCode": "MX", "landmark": "temple"}, "14": {"country": "Peru", "countryCode": "PE", "landmark": "mountain"}, "16": {"country": "Polska", "countryCode": "PL", "landmark": "palace"}, "18": {"country": "Włochy", "countryCode": "IT", "landmark": "arena"}, "19": {"country": "Francja", "countryCode": "FR", "landmark": "eiffel"}, "21": {"country": "Wielka Brytania", "countryCode": "GB", "landmark": "clock"}, "23": {"country": "Turcja", "countryCode": "TR", "landmark": "dome"}, "24": {"country": "ZEA", "countryCode": "AE", "landmark": "spire"}, "26": {"country": "Indie", "countryCode": "IN", "landmark": "gate"}, "27": {"country": "Tajlandia", "countryCode": "TH", "landmark": "temple"}, "29": {"country": "Singapur", "countryCode": "SG", "landmark": "marina"}, "31": {"country": "Australia", "countryCode": "AU", "landmark": "opera"}, "32": {"country": "Nowa Zelandia", "countryCode": "NZ", "landmark": "tower"}, "34": {"country": "Japonia", "countryCode": "JP", "landmark": "torii"}, "37": {"country": "USA", "countryCode": "US", "landmark": "palm"}, "39": {"country": "USA", "countryCode": "US", "landmark": "liberty"}};
export const BOARD = [
  special(0,'START','start'),
  city(1,'Marrakesz','brown',60,[2,10,30,90,160,250],50),
  special(2,'Kasa społeczna','chest'),
  city(3,'Kair','brown',60,[4,20,60,180,320,450],50),
  special(4,'Podatek dochodowy','tax',{amount:200}),
  station(5,'Atlantic Express'),
  city(6,'Kapsztad','lightblue',100,[6,30,90,270,400,550],50),
  special(7,'Szansa','chance'),
  city(8,'Nairobi','lightblue',100,[6,30,90,270,400,550],50),
  city(9,'Rio de Janeiro','lightblue',120,[8,40,100,300,450,600],50),
  special(10,'Więzienie / odwiedziny','jail'),
  city(11,'Buenos Aires','pink',140,[10,50,150,450,625,750],100),
  utility(12,'Elektrownia'),
  city(13,'Meksyk','pink',140,[10,50,150,450,625,750],100),
  city(14,'Lima','pink',160,[12,60,180,500,700,900],100),
  station(15,'Orient Express'),
  city(16,'Warszawa','orange',180,[14,70,200,550,750,950],100),
  special(17,'Kasa społeczna','chest'),
  city(18,'Rzym','orange',180,[14,70,200,550,750,950],100),
  city(19,'Paryż','orange',200,[16,80,220,600,800,1000],100),
  special(20,'Darmowy Parking','parking'),
  city(21,'Londyn','red',220,[18,90,250,700,875,1050],150),
  special(22,'Szansa','chance'),
  city(23,'Stambuł','red',220,[18,90,250,700,875,1050],150),
  city(24,'Dubaj','red',240,[20,100,300,750,925,1100],150),
  station(25,'Pacific Express'),
  city(26,'Mumbaj','yellow',260,[22,110,330,800,975,1150],150),
  city(27,'Bangkok','yellow',260,[22,110,330,800,975,1150],150),
  utility(28,'Wodociągi'),
  city(29,'Singapur','yellow',280,[24,120,360,850,1025,1200],150),
  special(30,'Idź do więzienia','goToJail'),
  city(31,'Sydney','green',300,[26,130,390,900,1100,1275],200),
  city(32,'Auckland','green',300,[26,130,390,900,1100,1275],200),
  special(33,'Kasa społeczna','chest'),
  city(34,'Tokio','green',320,[28,150,450,1000,1200,1400],200),
  station(35,'World Express'),
  special(36,'Szansa','chance'),
  city(37,'Los Angeles','darkblue',350,[35,175,500,1100,1300,1500],200),
  special(38,'Podatek od luksusu','tax',{amount:100}),
  city(39,'Nowy Jork','darkblue',400,[50,200,600,1400,1700,2000],200)
].map(f => Object.freeze({ ...f, ...CITY_DETAILS[f.id], rents: Object.freeze(f.rents) }));
Object.freeze(BOARD);
export const PURCHASABLE_IDS = BOARD.filter(f => f.price !== null).map(f => f.id);
export const STATION_IDS = [5,15,25,35];
export const UTILITY_IDS = [12,28];
export const interest = id => Math.ceil(BOARD[id].mortgage / 10);
export const redemption = id => BOARD[id].mortgage + interest(id);
export const createPropertyState = () => Object.fromEntries(PURCHASABLE_IDS.map(id => [id,{ ownerId:null, mortgaged:false, buildings:0 }]));
