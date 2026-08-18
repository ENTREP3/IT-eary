// The real Bencris menu, transcribed from the owner's costings.
//
// Every quantity is kept exactly as written; the conversions live in one place
// below so they can be checked and changed without touching a recipe.

/** Kitchen measures, in the units a shop actually buys. */
export const TO_LITRE = { L: 1, cup: 0.24, tbsp: 0.015, tsp: 0.005 };

export const ingredients = [
  // id, name, unit the shop buys in, cost per that unit
  ['baboy',        'Baboy (Pork)',              'kg',    270],
  ['manok',        'Manok (Chicken)',           'kg',    220],
  ['maskara',      'Maskara (Pig mask)',        'kg',    240],
  ['atay-baboy',   'Atay ng Baboy (Pork liver)','kg',    260],
  ['atay-manok',   'Atay ng Manok (Chicken liver)','kg', 200],
  ['lechon',       'Lechon Baboy',              'kg',    700],
  ['tilapia',      'Tilapia',                   'kg',    200],
  ['bangus',       'Bangus',                    'kg',    260],
  ['tulingan',     'Tulingan',                  'kg',    200],
  ['tinapa',       'Tinapa (Smoked fish)',      'kg',    300],

  ['sibuyas',      'Sibuyas (Onion)',           'piece', 10],
  ['bawang',       'Bawang (Garlic)',           'clove', 1.25],
  ['kamatis',      'Kamatis (Tomato)',          'piece', 10],
  ['patatas',      'Patatas (Potato)',          'piece', 20],
  ['karot',        'Karot (Carrot)',            'piece', 20],
  ['bell-pepper',  'Bell pepper',               'piece', 30],
  ['talong',       'Talong (Eggplant)',         'piece', 10],
  ['okra',         'Okra',                      'piece', 3],
  ['labanos',      'Labanos (Radish)',          'piece', 20],
  ['ampalaya',     'Ampalaya',                  'piece', 20],
  ['kalabasa',     'Kalabasa (Squash)',         'piece', 60],
  ['luya',         'Luya (Ginger)',             'piece', 15],
  ['siling-haba',  'Siling haba',               'piece', 3.3333],
  ['siling-labuyo','Siling labuyo',             'piece', 2],
  ['calamansi',    'Calamansi',                 'piece', 3],
  ['itlog',        'Itlog (Egg)',               'piece', 12],
  ['hotdog',       'Hotdog',                    'piece', 15],
  ['laurel',       'Dahon ng Laurel',           'piece', 0.83],
  ['pork-cubes',   'Pork cubes',                'piece', 8],

  ['kangkong',     'Kangkong',                  'bundle', 20],
  ['sitaw',        'Sitaw',                     'bundle', 30],
  ['dahon-gabi',   'Dahon ng Gabi',             'bundle', 30],
  ['dahon-sili',   'Dahon ng Sili',             'bundle', 10],
  ['sampalok',     'Sinigang (Sampalok) mix',   'pack',  30],

  ['toyo',         'Toyo (Silver Swan, bulk)',  'L',     28],
  ['suka',         'Suka (Datu Puti, gallon)',  'L',     35],
  ['mantika',      'Mantika (Golden Fiesta)',   'L',     105],
  ['patis',        'Patis (Fish sauce)',        'L',     208.33],
  ['gata',         'Gata (Coconut milk, bulk)', 'L',     95],
  ['oyster',       'Oyster sauce (bulk gallon)','L',     60],
  ['lechon-sauce', 'Lechon sauce (Mang Tomas 1kg)', 'kg', 87.50, { cup: 0.26 }],
  ['pinya-juice',  'Pineapple juice (Del Monte)','L',    100],
  ['mayonnaise',   "Mayonnaise (Lady's Choice)", 'L',    310.55],
  ['tomato-sauce', 'Tomato sauce (250g pouch)', 'pouch', 35, { cup: 1 }],
  ['tomato-paste', 'Tomato paste (1kg pack)',   'kg',    198.55, { cup: 0.27 }],

  ['green-peas',   'Green peas',                'kg',    140, { cup: 0.15 }],
  ['pinya-chunks', 'Pineapple chunks',          'kg',    160, { cup: 0.165 }],
  ['langka',       'Langka (Unripe jackfruit)', 'kg',    180, { cup: 0.16 }],

  ['asin',         'Asin (Salt)',               'g',     0.04,   { tbsp: 18 }],
  ['asukal',       'Asukal (Sugar)',            'g',     0.115,  { tbsp: 12.5 }],
  ['paminta',      'Paminta (Ground pepper)',   'g',     0.70,   { tsp: 2.3, tbsp: 6.9 }],
  ['curry',        'Curry powder',              'g',     1.2019, { tbsp: 6.5 }],
  ['chili-flakes', 'Chili flakes',              'g',     1.00,   { tsp: 2 }],
  ['cornstarch',   'Cornstarch',                'g',     0.12,   { tbsp: 8 }],
  ['seasoning',    'Seasoning (Magic Sarap, 8g sachet)', 'sachet', 5, { tbsp: 1 }],
  ['bagoong',      'Bagoong alamang',           'cup',   120, { tbsp: 0.0625 }],
  ['liver-spread', 'Liver spread (Reno, small can)', 'can', 40],
];

/**
 * The dishes, with quantities exactly as the owner wrote them.
 * price = what a diner pays for one serving; a batch makes ten.
 */
export const dishes = [
  {
    id: 'adobong-baboy', name: 'Adobong Baboy', tagalog: 'Pork Adobo',
    category: 'Stews & Braised', price: 70,
    description: 'Pork cooked slowly in soy sauce, vinegar and garlic.',
    items: [['baboy',2,'kg'],['toyo',1,'cup'],['suka',1,'cup'],['bawang',8,'clove'],
            ['sibuyas',2,'piece'],['paminta',2,'tsp'],['laurel',6,'piece'],
            ['asukal',4,'tbsp'],['mantika',4,'tbsp']],
    written: 655,
  },
  {
    id: 'sinigang', name: 'Sinigang na Baboy', tagalog: 'Pork in Sour Broth',
    category: 'Soups & Sour Broths', price: 95,
    description: 'Pork and vegetables cooked in a sour tamarind broth.',
    items: [['baboy',2,'kg'],['sampalok',2,'pack'],['kangkong',2,'bundle'],['labanos',2,'piece'],
            ['okra',20,'piece'],['talong',4,'piece'],['siling-haba',8,'piece'],
            ['sibuyas',2,'piece'],['kamatis',4,'piece'],['patis',6,'tbsp']],
    written: 890,
  },
  {
    id: 'caldereta', name: 'Calderetang Pork', tagalog: 'Pork Caldereta',
    category: 'Stews & Braised', price: 160,
    description: 'Rich pork stew with liver spread and tomato sauce.',
    items: [['baboy',2,'kg'],['atay-baboy',1,'kg'],['tomato-sauce',2,'cup'],
            ['liver-spread',3,'can'],
            ['bawang',8,'clove'],['sibuyas',4,'piece'],['bell-pepper',4,'piece'],
            ['karot',4,'piece'],['patatas',6,'piece'],['hotdog',10,'piece'],
            ['chili-flakes',2,'tsp'],['asukal',4,'tbsp'],['toyo',0.5,'cup'],
            ['laurel',6,'piece'],['mantika',4,'tbsp']],
    written: 1535, note: 'Liver spread costed as pork liver (1 cup ≈ ₱120 written).',
  },
  {
    id: 'sisig', name: 'Sisig', tagalog: 'Sizzling Sisig',
    category: 'Fried & Dry-Cooked', price: 90,
    description: "Chopped pig's mask and chicken liver seasoned with calamansi and chillies.",
    items: [['maskara',2,'kg'],['atay-manok',0.5,'kg'],['sibuyas',2,'piece'],
            ['bawang',8,'clove'],['siling-labuyo',15,'piece'],['calamansi',15,'piece'],
            ['toyo',0.25,'cup'],['itlog',2,'piece'],['mayonnaise',1,'cup'],
            ['asin',2,'tbsp'],['paminta',1,'tsp']],
    written: 842, note: 'The written "asin at paminta = ₱5" split into 2 tbsp salt and 1 tsp pepper.',
  },
  {
    id: 'bopis', name: 'Bopis', tagalog: 'Spicy Minced Innards',
    category: 'Fried & Dry-Cooked', price: 85,
    description: "Minced pork lungs and heart stir-fried with chillies and spices.",
    items: [['maskara',2,'kg'],['atay-baboy',0.5,'kg'],['sibuyas',4,'piece'],
            ['bawang',8,'clove'],['kamatis',4,'piece'],['siling-haba',8,'piece'],
            ['toyo',0.5,'cup'],['suka',0.25,'cup'],['asukal',2,'tbsp'],
            ['paminta',2,'tsp'],['laurel',4,'piece'],['mantika',4,'tbsp']],
    written: 783,
  },
  {
    id: 'porksteak', name: 'Porksteak', tagalog: 'Bistek na Baboy',
    category: 'Stews & Braised', price: 75,
    description: 'Pork cutlets braised in citrus, soy sauce and onions.',
    items: [['baboy',2,'kg'],['toyo',0.5,'cup'],['suka',0.5,'cup'],['oyster',0.5,'cup'],
            ['seasoning',3,'tbsp'],['asukal',2,'tbsp'],['sibuyas',1,'piece'],
            ['bawang',4,'clove'],['paminta',1,'tsp'],['pork-cubes',1,'piece'],
            ['laurel',3,'piece']],
    written: 694,
  },
  {
    id: 'bicol-express', name: 'Bicol Express', tagalog: 'Spicy Pork in Gata',
    category: 'Coconut Cream', price: 75,
    description: 'Spicy pork stewed in coconut milk and chilli.',
    items: [['baboy',2,'kg'],['gata',2,'cup'],['bagoong',1,'tbsp'],['sibuyas',1,'piece'],
            ['bawang',4,'clove'],['siling-haba',7,'piece'],['kamatis',3,'piece'],
            ['pork-cubes',1,'piece'],['asukal',1,'tbsp'],['paminta',0.5,'tsp']],
    written: 698, note: 'Written as "coconut milk 1/2 kg"; taken as 2 cups of gata.',
  },
  {
    id: 'menudo', name: 'Menudo', tagalog: 'Pork Menudo',
    category: 'Stews & Braised', price: 95,
    description: 'Pork and liver stew with potatoes, carrots and tomato sauce.',
    items: [['baboy',2,'kg'],['tomato-sauce',2,'cup'],['pinya-juice',1,'cup'],
            ['sibuyas',1,'piece'],['bawang',4,'clove'],['patatas',3,'piece'],
            ['karot',1,'piece'],['bell-pepper',1,'piece'],['asukal',1,'tbsp'],
            ['pork-cubes',1,'piece'],['paminta',1.5,'tsp'],['green-peas',0.5,'cup'],
            ['tomato-paste',0.5,'cup']],
    written: 899,
  },
  {
    id: 'lechon-paksiw', name: 'Lechon Paksiw na Baboy', tagalog: 'Lechon Paksiw',
    category: 'Stews & Braised', price: 185,
    description: 'Roast pig meat simmered in vinegar and liver sauce.',
    items: [['lechon',2,'kg'],['suka',2,'cup'],['bawang',12,'clove'],['sibuyas',2,'piece'],
            ['paminta',2,'tsp'],['laurel',6,'piece'],['asukal',8,'tbsp'],
            ['atay-baboy',0.5,'kg'],['lechon-sauce',2,'cup'],['asin',2,'tbsp'],
            ['siling-haba',6,'piece']],
    written: 1755, note: 'Optional siling haba included.',
  },
  {
    id: 'adobong-manok', name: 'Adobong Manok', tagalog: 'Chicken Adobo',
    category: 'Stews & Braised', price: 60,
    description: 'Chicken braised in soy sauce, vinegar and garlic.',
    items: [['manok',2,'kg'],['toyo',1,'cup'],['suka',1,'cup'],['bawang',8,'clove'],
            ['sibuyas',2,'piece'],['paminta',2,'tsp'],['laurel',6,'piece'],
            ['asukal',4,'tbsp'],['mantika',4,'tbsp']],
    written: 555,
  },
  {
    id: 'chicken-curry', name: 'Chicken Curry', tagalog: 'Curry na Manok',
    category: 'Coconut Cream', price: 115,
    description: 'Chicken and vegetables simmered in coconut milk and curry spices.',
    items: [['manok',2,'kg'],['curry',6,'tbsp'],['gata',4,'cup'],['sibuyas',4,'piece'],
            ['bawang',8,'clove'],['luya',2,'piece'],['patatas',6,'piece'],
            ['karot',4,'piece'],['bell-pepper',4,'piece'],['siling-haba',6,'piece'],
            ['patis',6,'tbsp'],['asukal',2,'tbsp'],['mantika',4,'tbsp']],
    written: 1075,
  },
  {
    id: 'afritada', name: 'Afritadang Manok', tagalog: 'Chicken Afritada',
    category: 'Stews & Braised', price: 120,
    description: 'Chicken stewed in tomato sauce with potatoes and carrots.',
    items: [['manok',2,'kg'],['tomato-sauce',2,'cup'],['sibuyas',4,'piece'],
            ['bawang',8,'clove'],['kamatis',6,'piece'],['patatas',6,'piece'],
            ['karot',4,'piece'],['bell-pepper',4,'piece'],['hotdog',10,'piece'],
            ['toyo',0.25,'cup'],['asukal',2,'tbsp'],['laurel',6,'piece'],
            ['paminta',2,'tsp'],['mantika',4,'tbsp']],
    written: 1138,
  },
  {
    id: 'pritong-manok', name: 'Pritong Manok', tagalog: 'Fried Chicken',
    category: 'Fried & Dry-Cooked', price: 65,
    description: 'Deep-fried seasoned chicken.',
    items: [['manok',2,'kg'],['asin',4,'tbsp'],['paminta',2,'tsp'],['bawang',8,'clove'],
            ['mantika',1,'L']],
    written: 560, note: 'Frying oil taken as 1 litre at ₱100.',
  },
  {
    id: 'pritong-tilapia', name: 'Pritong Tilapia', tagalog: 'Fried Tilapia',
    category: 'Fried & Dry-Cooked', price: 65,
    description: 'Crisp-fried tilapia.',
    items: [['tilapia',2,'kg'],['asin',4,'tbsp'],['paminta',2,'tsp'],['bawang',8,'clove'],
            ['mantika',1,'L'],['calamansi',10,'piece'],['toyo',0.5,'cup']],
    written: 565,
  },
  {
    id: 'pritong-bangus', name: 'Pritong Bangus', tagalog: 'Fried Milkfish',
    category: 'Fried & Dry-Cooked', price: 75,
    description: 'Pan-fried seasoned milkfish.',
    items: [['bangus',2,'kg'],['asin',4,'tbsp'],['paminta',2,'tsp'],['bawang',8,'clove'],
            ['mantika',1,'L'],['calamansi',10,'piece']],
    written: 670,
  },
  {
    id: 'ginataang-tulingan', name: 'Ginataang Tulingan', tagalog: 'Tulingan sa Gata',
    category: 'Coconut Cream', price: 75,
    description: 'Mackerel tuna simmered in coconut milk and ginger.',
    items: [['tulingan',2,'kg'],['gata',4,'cup'],['luya',2,'piece'],['bawang',10,'clove'],
            ['sibuyas',2,'piece'],['siling-haba',8,'piece'],['kamatis',4,'piece'],
            ['patis',0.5,'cup'],['dahon-sili',1,'bundle']],
    written: 667, note: 'Optional dahon ng sili left out — no price to cost it against.',
  },
  {
    id: 'ginataang-tilapia', name: 'Ginataang Tilapia', tagalog: 'Tilapia sa Gata',
    category: 'Coconut Cream', price: 70,
    description: 'Tilapia cooked in a rich coconut milk broth.',
    items: [['tilapia',2,'kg'],['gata',4,'cup'],['luya',2,'piece'],['bawang',10,'clove'],
            ['sibuyas',2,'piece'],['siling-haba',8,'piece'],['kamatis',4,'piece'],
            ['patis',0.5,'cup'],['dahon-sili',1,'bundle']],
    written: 667, note: 'Optional dahon ng sili left out.',
  },
  {
    id: 'sweet-sour-tilapia', name: 'Sweet and Sour na Tilapia', tagalog: 'Sweet & Sour Tilapia',
    category: 'Stews & Braised', price: 100,
    description: 'Fried fish smothered in a tangy tomato-vinegar sauce.',
    items: [['tilapia',2,'kg'],['asin',4,'tbsp'],['paminta',2,'tsp'],['mantika',1,'L'],
            ['sibuyas',2,'piece'],['bawang',10,'clove'],['kamatis',4,'piece'],
            ['bell-pepper',3,'piece'],['karot',3,'piece'],['pinya-chunks',2,'cup'],
            ['tomato-sauce',2,'cup'],['suka',0.5,'cup'],['asukal',8,'tbsp'],
            ['toyo',0.25,'cup'],['cornstarch',3,'tbsp']],
    written: 953,
  },
  {
    id: 'paksiw-bangus', name: 'Paksiw na Bangus', tagalog: 'Bangus sa Suka',
    category: 'Soups & Sour Broths', price: 80,
    description: 'Milkfish poached in a sour vinegar and ginger broth.',
    items: [['bangus',2,'kg'],['suka',2,'cup'],['bawang',12,'clove'],['luya',2,'piece'],
            ['sibuyas',2,'piece'],['paminta',2,'tsp'],['laurel',6,'piece'],
            ['asin',2,'tbsp'],['siling-haba',8,'piece'],['talong',4,'piece'],
            ['ampalaya',2,'piece']],
    written: 748, note: 'Optional talong and ampalaya included.',
  },
  {
    id: 'ginataang-kalabasa', name: 'Ginataang Kalabasa at Sitaw', tagalog: 'Kalabasa at Sitaw sa Gata',
    category: 'Coconut Cream', price: 55,
    description: 'Squash and string beans cooked in coconut milk with smoked fish.',
    items: [['tinapa',0.25,'kg'],['kalabasa',1,'piece'],['sitaw',1,'bundle'],['gata',4,'cup'],
            ['bawang',10,'clove'],['sibuyas',2,'piece'],['luya',1,'piece'],
            ['bagoong',6,'tbsp'],['siling-haba',6,'piece']],
    written: 397,
  },
  {
    id: 'adobong-sitaw', name: 'Adobong Sitaw', tagalog: 'String Beans Adobo',
    category: 'Stews & Braised', price: 40,
    description: 'String beans braised in a savoury soy-vinegar mixture.',
    items: [['sitaw',2,'bundle'],['toyo',1,'cup'],['suka',0.5,'cup'],['bawang',12,'clove'],
            ['sibuyas',2,'piece'],['paminta',2,'tsp'],['laurel',6,'piece'],
            ['asukal',2,'tbsp'],['mantika',0.25,'cup']],
    written: 165,
  },
  {
    id: 'laing', name: 'Laing', tagalog: 'Dahon ng Gabi sa Gata',
    category: 'Coconut Cream', price: 65,
    description: 'Dried taro leaves simmered in spicy coconut milk.',
    items: [['tinapa',0.5,'kg'],['dahon-gabi',2,'bundle'],['gata',5,'cup'],['bawang',12,'clove'],
            ['sibuyas',2,'piece'],['luya',2,'piece'],['siling-labuyo',15,'piece'],
            ['bagoong',8,'tbsp'],['pork-cubes',2,'piece']],
    written: 496,
  },
  {
    id: 'ginataang-langka', name: 'Ginataang Langka', tagalog: 'Langka sa Gata',
    category: 'Coconut Cream', price: 55,
    description: 'Unripe jackfruit cooked in savoury coconut cream.',
    items: [['tinapa',0.5,'kg'],['langka',4,'cup'],['gata',5,'cup'],['bawang',10,'clove'],
            ['sibuyas',2,'piece'],['luya',2,'piece'],['siling-haba',8,'piece'],
            ['bagoong',4,'tbsp'],['mantika',0.25,'cup']],
    written: 492,
  },
];

/**
 * Converts a recipe amount into the unit the ingredient is stocked in.
 *
 * Volume to volume is arithmetic. Anything else -- a cup of sauce into a pouch,
 * a spoon of salt into a kilo -- depends on the ingredient itself, so those
 * live beside it in the table above rather than being guessed here.
 */
export function convert(qty, from, ingredient) {
  const to = ingredient.unit;
  if (from === to) return qty;

  const own = ingredient.per?.[from];
  if (own !== undefined) return qty * own;

  if (to === 'L' && TO_LITRE[from] !== undefined) return qty * TO_LITRE[from];
  if (to === 'tbsp' && from === 'cup') return qty * 16;
  if (to === 'tbsp' && from === 'tsp') return qty / 3;
  if (to === 'tsp' && from === 'tbsp') return qty * 3;
  if (to === 'tsp' && from === 'cup') return qty * 48;

  throw new Error(`: no conversion from  to `);
}

// --------------------------------------------------------------------- rice
//
// Rice is not in any ulam recipe and is not in any ulam price: it is added at
// the point of ordering. Two servings sizes, one pot — 2 kg cooks 20 full cups,
// so a half cup is simply forty from the same batch.
export const rice = [
  {
    id: 'kanin', name: 'Kanin', tagalog: 'Rice, 1 cup',
    category: 'Kanin', price: 15, yield: 23,
    description: 'One cup of freshly cooked rice.',
    items: [['bigas', 2, 'kg']],
  },
  {
    id: 'kanin-half', name: 'Kanin (Tunga)', tagalog: 'Rice, half cup',
    category: 'Kanin', price: 8, yield: 46,
    description: 'Half a cup of freshly cooked rice.',
    items: [['bigas', 2, 'kg']],
  },
];

export const riceIngredient = ['bigas', 'Bigas (Rice)', 'kg', 55];
