import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const manifests = [
  "expansion-2-local-government-streaming.json",
  "expansion-2-user-history-priority.json",
];

const groups = [
  ["local-government", "AU", `City of Sydney;City of Melbourne;City of Brisbane;City of Perth;City of Adelaide;City of Hobart;City of Darwin;City of Gold Coast;Sunshine Coast Council;Newcastle City Council;Wollongong City Council;Geelong City Council;Ballarat City Council;Bendigo City Council;Canberra City Services;Parramatta City Council;Northern Beaches Council;Blacktown City Council;Penrith City Council;Liverpool City Council;Fremantle City Council;Joondalup City Council;Stirling City Council;Moreton Bay City Council;Logan City Council;Ipswich City Council;Cairns Regional Council;Townsville City Council;Toowoomba Regional Council;Launceston City Council`],
  ["local-government", "NZ", `Wellington City Council;Christchurch City Council;Hamilton City Council;Tauranga City Council;Dunedin City Council;Palmerston North City Council;Napier City Council;Nelson City Council;Rotorua Lakes Council;Queenstown Lakes District Council;Waikato District Council;New Plymouth District Council;Whangarei District Council;Hutt City Council;Porirua City Council`],
  ["local-government", "US", `City of New York;City of Los Angeles;City of Chicago;City of Houston;City of Phoenix;City of Philadelphia;City of San Antonio;City of San Diego;City of Dallas;City of Austin;City of Jacksonville;City of San Jose;City of Fort Worth;City of Columbus;City of Charlotte;City of Indianapolis;City of Seattle;City and County of Denver;City of Washington DC;City of Boston;City of Nashville;City of Portland;City of Las Vegas;City of Miami;Los Angeles County;Cook County;Harris County;Maricopa County;San Diego County;Orange County California`],
  ["local-government", "GB", `Birmingham City Council;Manchester City Council;Leeds City Council;Liverpool City Council;Sheffield City Council;Bristol City Council;City of Edinburgh Council;Glasgow City Council;Cardiff Council;Belfast City Council;Westminster City Council;Camden Council;Cornwall Council;Kent County Council;Essex County Council;Lancashire County Council;Nottingham City Council;Newcastle City Council;Oxford City Council;Cambridge City Council`],
  ["local-government", "CA", `City of Toronto;City of Vancouver;City of Montreal;City of Calgary;City of Edmonton;City of Ottawa;City of Winnipeg;City of Quebec;City of Hamilton;City of Halifax;City of Victoria;City of Saskatoon;City of Regina;Region of Peel;York Region;Durham Region;Waterloo Region`],
  ["local-government", "IE", `Dublin City Council;Cork City Council;Galway City Council;Limerick City and County Council;Waterford City and County Council;Fingal County Council;South Dublin County Council;Dun Laoghaire Rathdown County Council;Kildare County Council;Meath County Council`],
  ["water", "AU", `South East Water;Greater Western Water;Sydney Water;SA Water;Unitywater;Melbourne Water;Barwon Water;City West Water;Hunter Water;Icon Water;TasWater;Water Corporation;Power and Water Corporation;Central Highlands Water;Coliban Water;Gippsland Water;Goulburn Valley Water;Lower Murray Water;North East Water;Western Water`],
  ["water", "GLOBAL", `Thames Water;Anglian Water;Severn Trent;United Utilities;Yorkshire Water;Scottish Water;Irish Water;Watercare;Wellington Water;American Water;Aqua America;Toronto Water;Metro Vancouver Water;Suez;Veolia Water`],
  ["electricity", "AU", `Origin Energy;EnergyAustralia;Alinta Energy;Simply Energy;Powershop;Momentum Energy;GloBird Energy;OVO Energy Australia;Amber Electric;Tango Energy;Nectr;Sumo Energy;CovaU;Energy Locals;Blue NRG`],
  ["utilities", "NZ", `Mercury Energy;Genesis Energy;Meridian Energy;Contact Energy;Electric Kiwi;Flick Electric;Nova Energy;Trustpower;Frank Energy;Pulse Energy`],
  ["utilities", "GLOBAL", `British Gas;EDF Energy;E.ON;Octopus Energy;ScottishPower;SSE;National Grid;Duke Energy;Southern Company;Pacific Gas and Electric;Con Edison;Dominion Energy;Exelon;NextEra Energy;Hydro One;BC Hydro;Hydro Quebec;Enbridge;FortisBC;Vattenfall;Iberdrola;Enel;Engie;RWE`],
  ["internet", "AU", `Telstra;Optus;TPG;iiNet;Aussie Broadband;Superloop;Exetel;Tangerine Telecom;Dodo;MATE;Southern Phone;Vodafone Australia;More Telecom;Spintel;Activ8me`],
  ["mobile", "AU", `Boost Mobile;Kogan Mobile;Felix Mobile;Moose Mobile;Lebara Australia;ALDImobile;Woolworths Mobile;Catch Connect;Circles Life Australia;Lycamobile Australia`],
  ["telecom", "GLOBAL", `Spark New Zealand;One New Zealand;2degrees;BT;EE;O2 UK;Three UK;Virgin Media;Sky Broadband;TalkTalk;Plusnet;Comcast Xfinity;Verizon;AT&T;T-Mobile US;Spectrum;Cox Communications;Bell Canada;Rogers;Telus;Freedom Mobile;SaskTel;Orange;Deutsche Telekom;Telefonica;Vodafone UK;Swisscom;Telia;Telenor`],
  ["airline", "GLOBAL", `Qantas;Jetstar;Virgin Australia;Rex Airlines;Air New Zealand;Singapore Airlines;Emirates;Qatar Airways;Etihad Airways;Cathay Pacific;All Nippon Airways;Japan Airlines;Korean Air;British Airways;Lufthansa;Air France;KLM;United Airlines;Delta Air Lines;American Airlines;Southwest Airlines;Air Canada;Ryanair;easyJet;AirAsia;Scoot;Turkish Airlines;Finnair;SAS;Iberia;Aer Lingus;Swiss International Air Lines;Austrian Airlines;TAP Air Portugal;ITA Airways;Wizz Air;Norwegian Air Shuttle;Alaska Airlines;JetBlue;Spirit Airlines;Frontier Airlines;Hawaiian Airlines;WestJet;Porter Airlines;LATAM Airlines;Avianca;Copa Airlines;Aeromexico;Qatar Executive;China Airlines;EVA Air;Thai Airways;Malaysia Airlines;Vietnam Airlines;Philippine Airlines;Garuda Indonesia;IndiGo;Air India;SriLankan Airlines;Fiji Airways`],
  ["bank", "AU", `Commonwealth Bank;NAB;ANZ;Westpac;Bendigo Bank;Bank of Melbourne;St.George Bank;BankSA;Macquarie Bank;ING Australia;Suncorp Bank;BOQ;ubank;Up Bank;ME Bank;HSBC Australia;AMP Bank;Beyond Bank Australia;Great Southern Bank Australia;Heritage Bank Australia`],
  ["bank", "GLOBAL", `ASB Bank;BNZ;Kiwibank;Westpac New Zealand;Chase;Bank of America;Wells Fargo;Citibank;Capital One;US Bank;PNC Bank;Truist;TD Bank;Royal Bank of Canada;Scotiabank;BMO;CIBC;National Bank of Canada;HSBC UK;Barclays;Lloyds Bank;NatWest;Santander UK;Monzo;Starling Bank;Revolut;Deutsche Bank;Commerzbank;BNP Paribas;Societe Generale;Credit Agricole;ING Bank;Rabobank;UniCredit;Intesa Sanpaolo;BBVA;CaixaBank;Nordea;Danske Bank;DBS Bank;OCBC Bank;UOB;Standard Chartered;Bank of China;ICBC;Mizuho Bank;MUFG Bank;SMBC;ANZ New Zealand`],
  ["credit-union", "GLOBAL", `Australian Military Bank;Bank Australia;Community First Bank;P&N Bank;People's Choice Credit Union;Police Bank;Qudos Bank;Teachers Mutual Bank;UniBank Australia;Navy Federal Credit Union;Pentagon Federal Credit Union;State Employees Credit Union;SchoolsFirst Federal Credit Union;BECU;Golden 1 Credit Union;America First Credit Union;Alliant Credit Union;Coast Capital Savings;Vancity;Meridian Credit Union;Desjardins;Nationwide Building Society;Coventry Building Society;Yorkshire Building Society;Skipton Building Society`],
  ["health-insurance", "AU", `Medibank;Bupa Australia;HCF;NIB Health;ahm;HBF;GMHBA;Australian Unity;Defence Health;CBHS Health;Latrobe Health Services;Peoplecare;Phoenix Health Fund;Queensland Country Health Fund;TUH Health Fund;Westfund`],
  ["health-insurance", "GLOBAL", `Aetna;Cigna;UnitedHealthcare;Humana;Kaiser Permanente;Blue Cross Blue Shield;Anthem;Centene;Molina Healthcare;Bupa UK;AXA Health;Vitality Health;Aviva Health;Vhi Healthcare;Laya Healthcare;Irish Life Health;Southern Cross Health Society;Sun Life;Manulife;Green Shield Canada`],
  ["car-rental", "GLOBAL", `Hertz;Avis;Budget Rent a Car;Europcar;SIXT Global;Thrifty Car Rental;Enterprise Rent-A-Car;National Car Rental;Alamo Rent A Car;Dollar Rent A Car;Ace Rent A Car;East Coast Car Rentals;Bargain Car Rentals;Redspot Car Rentals;Jucy Rentals;Go Rentals New Zealand;Apex Car Rentals;Fox Rent A Car;Turo;Zipcar`],
  ["parking", "GLOBAL", `Wilson Parking;Secure Parking;Care Park;Ace Parking Australia;First Parking;InterPark;Parkable;Parkhound;EasyPark;APCOA Parking;NCP Parking;Q-Park;Indigo Parking;SP Plus;LAZ Parking;Impark;ParkWhiz;SpotHero;ParkMobile;JustPark`],
  ["clothing", "GLOBAL", `David Jones;Country Road;Witchery;Trenery;Mimco;Seed Heritage;Sportsgirl;Sussan;Suzanne Grae;Portmans;Jacqui E;Just Jeans;Jay Jays;Cotton On;Cotton On Body;Cotton On Kids;Typo;Factorie;H&M;Zara;Uniqlo;Gap;Old Navy;Banana Republic;Primark;Next;Marks and Spencer;John Lewis;Nordstrom;Macy's;Bloomingdale's;JCPenney;Kohl's;Forever 21;Urban Outfitters;Anthropologie;Abercrombie and Fitch;Hollister;American Eagle;Lululemon;Nike;Adidas;Puma;Under Armour;New Balance;ASOS;Boohoo;Shein;Temu;Decathlon;Kathmandu;Macpac;RM Williams;Industrie;Cue;Forever New;Glassons;The Iconic;Net-a-Porter;Farfetch`],
  ["shopping", "GLOBAL", `Walmart;Target US;Costco Wholesale;Tesco;Sainsbury's;Asda;Morrisons;Waitrose;Carrefour;Aldi UK;Aldi US;Lidl;Kroger;Whole Foods Market;Trader Joe's;Publix;Safeway;Loblaws;Canadian Tire;IKEA;Home Depot;Lowe's;Best Buy;Currys;Argos;Walmart Canada;Dollar General;Dollar Tree;TK Maxx;Marshalls`],
  ["streaming-video", "GLOBAL", `Hulu;Peacock;Max Streaming;BritBox;Hayu;AMC Plus;Discovery Plus;Crunchyroll;Shudder;MUBI;Acorn TV;Nebula;Plex;YouTube Premium;Viki;Curiosity Stream;Kanopy;Sling TV;YouTube TV;Fubo`],
  ["streaming-sport", "GLOBAL", `DAZN;NBA League Pass;NFL Game Pass;MLB TV;F1 TV;UFC Fight Pass;WatchAFL;ESPN Plus;NHL TV;FloSports`],
  ["streaming-music", "GLOBAL", `YouTube Music;Amazon Music;TIDAL;Deezer;SoundCloud;Qobuz;iHeartRadio;Pandora;Bandcamp;TuneIn`],
  ["gaming-subscription", "GLOBAL", `Amazon Luna;GameFly;Humble Choice;Antstream Arcade;Blacknut;Ubisoft Connect;Nintendo eShop;PlayStation Store;Xbox Live;Google Stadia`],
];

const aliasOverrides = new Map(Object.entries({
  "Rex Airlines": ["Rex"], "All Nippon Airways": ["ANA"], "United Airlines": ["United"],
  "Delta Air Lines": ["Delta"], "Southwest Airlines": ["Southwest"],
  "Bupa Australia": ["Bupa"], "NIB Health": ["nib"], "CBHS Health": ["CBHS"],
  "Budget Rent a Car": ["Budget"], "Thrifty Car Rental": ["Thrifty"],
  "Enterprise Rent-A-Car": ["Enterprise"], "National Car Rental": ["National"],
  "Alamo Rent A Car": ["Alamo"], "St.George Bank": ["St.George"],
  "Macquarie Bank": ["Macquarie"], "Up Bank": ["Up"],
}));

const slug = (value) => value.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "").toLocaleLowerCase("en-US").normalize("NFKD").replace(/[^a-z0-9-]/gu, "");
const initial = (name) => name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? "•";
const palettes = { "local-government": ["#334155", "#e2e8f0"], water: ["#0369a1", "#e0f2fe"], electricity: ["#ca8a04", "#fef9c3"], utilities: ["#0f766e", "#ccfbf1"], internet: ["#4f46e5", "#e0e7ff"], mobile: ["#7c3aed", "#ede9fe"], telecom: ["#6d28d9", "#ede9fe"], airline: ["#1d4ed8", "#dbeafe"], bank: ["#166534", "#dcfce7"], "credit-union": ["#047857", "#d1fae5"], "health-insurance": ["#be123c", "#ffe4e6"], "car-rental": ["#c2410c", "#ffedd5"], parking: ["#1e40af", "#dbeafe"], clothing: ["#9d174d", "#fce7f3"], shopping: ["#b45309", "#fef3c7"], "streaming-video": ["#b91c1c", "#fee2e2"], "streaming-sport": ["#15803d", "#dcfce7"], "streaming-music": ["#7e22ce", "#f3e8ff"], "gaming-subscription": ["#4338ca", "#e0e7ff"], digital: ["#475569", "#f1f5f9"], government: ["#334155", "#e2e8f0"], finance: ["#166534", "#dcfce7"], groceries: ["#15803d", "#dcfce7"], health: ["#be123c", "#ffe4e6"], marketplace: ["#b45309", "#fef3c7"], fuel: ["#a16207", "#fef9c3"], entertainment: ["#7e22ce", "#f3e8ff"], transport: ["#0369a1", "#e0f2fe"], insurance: ["#047857", "#d1fae5"], services: ["#475569", "#f1f5f9"] };

const existingSource = await readFile(resolve(root, "apps/web/src/features/icons/merchantIconImportedBatch.ts"), "utf8");
const existingKeys = new Set([...existingSource.matchAll(/key: "([^"]+)"/gu)].map((match) => match[1]));
for (const key of ["coles-au", "woolworths-au", "aldi-au", "bunnings-au", "amazon-global", "netflix-global", "spotify-global", "mcdonalds-global"]) existingKeys.add(key);

const candidates = [];
for (const file of manifests) {
  const parsed = JSON.parse(await readFile(resolve(root, "tools/merchant-icons/manifests", file), "utf8"));
  candidates.push(...parsed.entries);
}
candidates.push(
  { key: "target-us", name: "Target", regions: ["US"], aliases: ["Target US"], category: "shopping", provenance: { kind: "generated", reviewed: false } },
  { key: "aldi-uk", name: "ALDI", regions: ["GB"], aliases: ["Aldi UK"], category: "groceries", provenance: { kind: "generated", reviewed: false } },
  { key: "aldi-us", name: "ALDI", regions: ["US"], aliases: ["Aldi US"], category: "groceries", provenance: { kind: "generated", reviewed: false } },
);
for (const [category, region, names] of groups) {
  for (const name of names.split(";")) {
    candidates.push({ key: `${slug(name)}-${region.toLocaleLowerCase()}`, name, regions: [region], aliases: aliasOverrides.get(name) ?? [], category, provenance: { kind: "generated", source: "Codex curated generic identity fallback", reviewed: false } });
  }
}

const seen = new Set(existingKeys);
const seenRegionalIdentities = new Set();
const entries = [];
for (const entry of candidates) {
  if (entries.length >= 650) break;
  if (seen.has(entry.key)) continue;
  const regionalIdentities = [entry.name, ...entry.aliases].flatMap((identity) => entry.regions.map((region) => `${region}:${identity.normalize("NFKC").toLocaleLowerCase().replace(/[’']/gu, "").replace(/&/gu, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`));
  if (regionalIdentities.some((identity) => seenRegionalIdentities.has(identity))) continue;
  seen.add(entry.key);
  regionalIdentities.forEach((identity) => seenRegionalIdentities.add(identity));
  entries.push({ ...entry, provenance: { ...entry.provenance, source: entry.provenance?.source ?? "Codex curated generic identity fallback" } });
}

const shardSize = 100;
const publicDir = resolve(root, "apps/web/public/merchant-icons");
await mkdir(publicDir, { recursive: true });
for (let offset = 0; offset < entries.length; offset += shardSize) {
  const shard = entries.slice(offset, offset + shardSize);
  const shardNumber = String(offset / shardSize + 1).padStart(2, "0");
  const symbols = shard.map((entry) => {
    const [background, foreground] = palettes[entry.category] ?? ["#475569", "#f8fafc"];
    return `<symbol id="${entry.key}" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="${background}"/><text x="20" y="25" text-anchor="middle" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="${foreground}">${initial(entry.name)}</text></symbol>`;
  }).join("");
  await writeFile(resolve(publicDir, `major-expansion-${shardNumber}.svg`), `<svg xmlns="http://www.w3.org/2000/svg">${symbols}</svg>\n`);
  shard.forEach((entry) => { entry.asset = { kind: "sprite", spritePath: `major-expansion-${shardNumber}.svg`, symbolId: entry.key }; });
}

const compactData = entries.map((entry) => [entry.key, entry.name, entry.regions, entry.aliases, entry.category, entry.asset.spritePath]);
await writeFile(resolve(root, "apps/web/src/features/icons/merchantIconMajorExpansion.ts"), `// Generated by tools/merchant-icons/generate-major-expansion.mjs.\n// These are unreviewed category/initial fallback marks, not official merchant logos.\nimport type { MerchantIconCatalogueEntry, MerchantIconCategory } from "./merchantIconCatalogue.js";\n\nconst data = ${JSON.stringify(compactData)} as const;\n\nexport const MAJOR_MERCHANT_ICON_EXPANSION: readonly MerchantIconCatalogueEntry[] = data.map(([key, name, regions, aliases, category, spritePath]) => ({\n  key, name, regions, aliases, category: category as MerchantIconCategory,\n  provenance: { kind: "generated", source: "Codex curated generic identity fallback", reviewed: false },\n  asset: { kind: "sprite", spritePath, symbolId: key },\n}));\n`);
await writeFile(resolve(root, "tools/merchant-icons/manifests/major-expansion-live.json"), `${JSON.stringify({ version: 1, generatedBy: "tools/merchant-icons/generate-major-expansion.mjs", entries }, null, 2)}\n`);
console.log(`Generated ${entries.length} live expansion entries across ${Math.ceil(entries.length / shardSize)} sprite shards.`);
