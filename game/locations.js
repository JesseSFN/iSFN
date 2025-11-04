const locations = [
      {
        name: "De bekende schrijver",
        hint: "Een bekende schrijver overleefde een vliegtuigcrash, vocht in een oorlog, en schreef later over een oude man en een vis. In welke stad werd hij geboren?",
        ans: "Ernest Hemingway, Oak Park, Illinois	",
        media: "",
        lat: 41.8878145,
        lng: -87.7887615,
        radius: 4 // ongeveer 4 km
      },
      {
        name: "Leeuwen standbeeld",
        hint: "Een beroemd standbeeld in Azië lijkt op een leeuw die water spuwt. Het lichaam is echter geen leeuw. Ga naar het standbeeld",
        ans: "Merlion statue singapore",
        media: "",
        lat: 1.2867841,
        lng: 103.8545035,
        radius: 0.2 // ongeveer 200 meter
      },
      {
        name: "Beetje nat",
        hint: "Als je zout bij je friet wilt hebben, zou ik dit stukje water pakken.",
        ans: "Dode zee",
        media: "",
        lat: 31.5414738,
        lng: 35.4787059,
        radius: 50 // ongeveer 50 km
      },
      {
        name: "Rivieren race",
        hint: "Dit rivieren onderling houden een wedstrijd wie de meeste landen ziet, we gaan naar de oorsprong van de winnaar",
        ans: "Zwarte woud donau",
        media: "",
        lat: 47.95183609837859,
        lng: 8.502578049847092,
        radius: 0.02 // ongeveer 20 meter
      },
      {
        name: "Wat zeg je?",
        hint: "Je kan fluisteren wat je wilt, maar iedereen hoort je in dit gebouw brits praten.",
        ans: "st paul's cathedral whispering gallery",
        media: "",
        lat: 51.51383972167969,
        lng: -0.0982590988278389,
        radius: 30 // ongeveer 30 km
      },
      {
        name: "Macro foto?",
        hint: "Deze incecten hebben op de foto gestaan toen ze de wereld verranderde",
        ans: "Abbey road",
        media: "",
        lat: 51.53208474855893,
        lng: -0.17734928191069477,
        radius: 0.005 // ongeveer 5 meter
      },
      {
        name: "Computerpraat",
        hint: "01000111 01100001 00100000 01101110 01100001 01100001 01110010 00100000 01101000 01100101 01110100 00100000 01101111 01110000 01100101 01110010 01100001 00101101 01101000 01110101 01101001 01110011 00100000 01101001 01101110 00100000 01010011 01111001 01100100 01101110 01100101 01111001",
        ans: "Sydney Opera House",
        media: "",
        lat: -33.8574256,
        lng: 151.2148712,
        radius: 0.02 // ongeveer 20 meter
      },
      {
        name: "Cgz hkzkqktz joz?",
        hint: "Een romeinse leider en iets wat Thom nooit zal eten in zijn leven. Het cijfer 6 is belangrijk",
        ans: "Marianna trench",
        media: "",
        lat: 10.91882052026577,
        lng: 139.96362647573747,
        radius: 400 // ongeveer 400 km
      },
      {
        name: "Niet de Gamecube maar de?",
        hint: "Nintendo heeft hier een console van: V2UgZ2FhbiBuYWFyIFNjb3V0aW5nIHRvZQ==",
        ans: "Scouting Fridtjof nansen",
        media: "",
        lat: 51.529314741564455,
        lng: 4.448739025175779,
        radius: 0.02 // ongeveer 20 meter
      },
      {
        name: "Motherf*cking windmills",
        hint: "Ik wil naar deze locatie:",
        ans: "Vesterhav Syd Offshore Wind Farm",
        media: "https://jessesfn.github.io/iSFN/media-vragen/MFWM.mp4",
        lat: 56.038474289396895,
        lng: 8.006029606252142,
        radius: 10 // ongeveer 10 km
      },
      {
        name: "Rare machine",
        hint: "3 rotoren, 26 lampjes, 4 landen en een plugboard? We gaan naar de geboorteplaats van de uitvinder",
        ans: "Enigma machine, Frankfurt",
        media: "",
        lat: 50.1106444,
        lng: 8.6820917,
        radius: 9 // ongeveer 9 km
      },
      {
        name: "Switch it up like nintendo",
        hint: "We gaan naar de bocht uit dit filmpje.",
        ans: "Een random bocht in Mexico",
        media: "https://jessesfn.github.io/iSFN/media-vragen/weg.mp4",
        lat: 18.71237844228911,
        lng: -97.3293917373196,
        radius: 5 // ongeveer 5 km
      },
      {
        name: "PDF",
        hint: "PDF's gebruiken we allemaal. Vaak in het formaat van een A4'tje, bijvoorbeeld met doe-opdrachten erop. Een PDF kan allerlei formaten hebben, maar er is wel een maximale grootte. Stel, we leggen de linkerbovenhoek op het wereldwijde hoofdkwartier van Adobe. We reizen naar de rechter onderhoek.",
        ans: "Ergens in Los Angeles",
        media: "",
        lat: 33.83042923993267,
        lng: -117.76877338191034,
        radius: 200 // ongeveer 5 km
      },
      {
        name: "Kedeng kedeng",
        hint: "Fans van treinen heb je overal. We gaan naar het station waar fans bijzonder teleurgesteld waren omdat de 'trein' van 11:00 niet vertrok.",
        ans: "Kings Cross station London",
        media: "",
        lat: -33.874605701265914,
        lng: 151.22245725661634,
        radius: 0.01 // ongeveer 10 meter
      },
      {
        name: "Looks like Senegal radiance",
        hint: "Er zijn mensen die bij het spel GeoGuesser aan de kleur van een paaltje langs de weg kunnen zien in wel land ze zijn. Dat kunnen jullie vast ook. We gaan naar het land van dit paaltje:",
        ans: "Ghana",
        media: "https://jessesfn.github.io/iSFN/media-vragen/Paal.png",
        lat: 8.0300284,
        lng: -1.0800271,
        radius: 250 // ongeveer 250 km
      },
      {
        name: "Nonogram?",
        hint: "Los de puzzel op:",
        ans: "Airag Lake mongolië",
        media: "https://jessesfn.github.io/iSFN/media-vragen/Nonogram.png",
        lat: 48.900711445712965,
        lng: 93.45494595476013,
        radius: 50 // ongeveer 50 km
      },
      {
        name: "Hammond you blithering idiot",
        hint: "Ga naar deze tent:",
        ans: "Random plek in Mongolië",
        media: "https://jessesfn.github.io/iSFN/media-vragen/tent.mp4",
        lat: 49.16377961838467,
        lng: 97.40827556282149,
        radius: 100 // ongeveer 100 km
      },
      {
        name: "Boeing 747",
        hint: "Een bedrijf heeft speciaal voor zijn klanten een werknemers een prive vliegveld geopend, waar?",
        ans: "Billund airport",
        media: "",
        lat: 55.7409551,
        lng: 9.1521722,
        radius: 2 // ongeveer 2 km
      },
      {
        name: "Second breakfast?",
        hint: "'Shall I describe it to you, or would you like me to find you a box?'. We willen naar de film locatie",
        ans: "Haywards",
        media: "",
        lat: -41.150267,
        lng: 174.979046,
        radius: 10 // ongeveer 10 km
      },
      {
        name: "Vliegveld",
        hint: "Sommige vliegvelden liggen dicht bij de centrum van de stad waar het vliegveld naar vernoemd is. Bijvoorbeeld London City Airport ligt op nog geen 10 km van Londen. Andere vliegvelden zijn misleidend, en liggen ver bij de stad vandaan waar ze naar vernoemd zijn. Wij gaan naar het meest misleidende vliegveld (dat ligt nog circa 135 km hemelsbreed van de stad vandaan)",
        ans: "",
        media: "",
        lat: 48.77786604783219,
        lng: 4.186261187089951,
        radius: 2 // ongeveer 2 km
      },
      {
        name: "Spongebob",
        hint: "In deze straat woont spongebob",
        ans: "Schelpstraat in Helmond",
        media: "",
        lat: 51.53202603643356,
        lng: 4.271922364356801,
        radius: 0.2 // ongeveer 200 meter
      },
      {
        name: "Zuidelijke stad",
        hint: "Dit is de meest zuidelijke stad ter wereld.",
        ans: "",
        media: "",
        lat: -54.8088106,
        lng: -68.3199749,
        radius: 5 //ongeveer 5 km
      },
      {
        name: "Eiffeltoren",
        hint: "Een beroemd ijzeren bouwwerk in Parijs, Frankrijk.",
        ans: "",
        media: "",
        lat: 48.8584,
        lng: 2.2945,
        radius: 0.3 // ongeveer 300 meter
      },
      {
        name: "Amsterdam Centraal",
        hint: "Het belangrijkste treinstation in de hoofdstad van Nederland.",
        ans: "",
        media: "",
        lat: 52.3780,
        lng: 4.9000,
        radius: 0.3 // ongeveer 300 meter
      },
      {
        name: "Colosseum",
        hint: "Een oud amfitheater in Rome waar gladiatoren vochten.",
        ans: "",
        media: "",
        lat: 41.8902,
        lng: 12.4922,
        radius: 0.3 // ongeveer 300 meter
      },
      {
        name: "Lego",
        hint: "In dit land worden de meeste banden gemaakt",
        ans: "Denemarken",
        mediSa: "",
        lat: 56.02453877107302,
        lng: 10.521098060541842,
        radius: 300 // // ongeveer 300 km
      }, 
      {
        name: "Tweede Wereldoorlog",
        hint: "Tijdens de Tweede Wereldoorlog gebruikten Duitse spionnen een toren om een gebied te verkennen. Waar staat deze toren?",
        ans: "Ouwehands Dierenpark",
        media: "",
        lat: 51.9580902,
        lng: 5.5900098,
        radius: 0.3 // ongeveer 300 meter
      },
      {
        name: "Sine qua non",
        ans: "Brownsea Island",
        media: "",
        hint: "In 1907 gebeurde iets op een plek. Als dat nooit gebeurd was, zouden wij hier met z’n allen niet zijn. Welke plek?",
        lat: 50.6919075,
        lng: -1.9734133,
        radius: 5 // ongeveer 5 km
      },
      {
        name: "Ongeluk bij ongeluk",
        ans: "Rudi Dekker, Huffman Aviation, 400 Airport Ave E	",
        media: "",
        hint: "In 2001 veranderde een gebeurtenis in New York het leven van een man voorgoed. Hij zou nooit meer hetzelfde zijn. Welk gebouw zat zijn bedrijf?",
        lat: 27.0780872,
        lng: -82.4403958,
        radius: 0.5 // ongeveer 500 meter
      }, 
      {
        name: "Waar oh waar?",
        hint: "Waar staat dit?",
        ans: "Herwijnen",
        media: "https://jessesfn.github.io/iSFN/media-vragen/vraag5-foto.png",
        lat: 51.8369245,
        lng: 5.1380406,
        radius: 0.02 // ongeveer 20 meter
      },
      {
        name: "Vliegtuigmodus",
        hint: "Waar is een iPhone ooit uit een vliegtuig gevallen van 16.000 voet en toch overleefde?",
        ans: "SW Barnes Rd Portland Verenigde Staten",
        media: "",
        lat: 45.5124061,
        lng: -122.7804382,
        radius: 0.05 // ongeveer 50 meter
      },
      {
        name: "hoe laat is het?",
        hint: "Een klok die niet de juiste tijd aangeeft, is super irritant. Maar als je doel is om iemand in de war te brengen, kan het juist handig zijn. Bijvoorbeeld om tegen het kwaad te strijden. Welk land?",
        ans: "Malta",
        media: "",
        lat: 35.885868,
        lng: 14.4027236,
        radius: 300 // ongeveer 300 km
      },
      {
        name: "Wiskunde",
        ans: "Jakow Trachtenberg, Odessa",
        media: "",
        hint: "In een cel trachtte iemand het hoofdrekenspel te versnellen. Welk stad werd deze persoon geboren?",
        lat: 46.4845967,
        lng: 30.7319079,
        radius: 20 // ongeveer 20 km
      },
      {
        name: "koud",
        hint: "",
        ans: "Waar de Titanic gezonken is",
        media: "https://jessesfn.github.io/iSFN/media-vragen/koud.wav",
        lat: 41.8171385,
        lng: -49.9650879,
        radius: 500 // ongeveer 500 km
      },
      {
        name: "Tik Tik",
        hint: "21,42,11,32",
        ans: "Tap Code voor FRAM die natuurlijk in Oslo zit",
        media: "",
        lat: 59.9033623,
        lng: 10.699552,
        radius: 0.2 // ongeveer 20 meter
      },
      {
        name: "Carpe Diem",
        hint: "O Captain! my Captain!",
        ans: "school waar Dead poets society is opgenomen",
        media: "",
        lat: 39.4331744,
        lng: -75.6897098,
        radius: 0.5 // ongeveer 50 meter
      },
      {
        name: "Bleek",
        hint: "Toen sterren speren wierpen neer, En hemel drenkte in tranenmeer, Glimlachte hij om wat hij schiep? Maakte hij, die ’t Lam vormgaf, ook die?",
        ans: "William Blake - Soho London",
        media: "",
        lat: 51.5136782,
        lng: -0.1347802,
        radius: 1 // ongeveer 1 km
      },
      {
        name: "Klinkt als muziek voor mijn oren",
        hint: "",
        ans: "Sweet Home Alabama. Songsterr.com",
        media: "https://jessesfn.github.io/iSFN/media-vragen/KAMVMO.png",
        lat: 32.9598909,
        lng: -86.7617503,
        radius: 400 // ongeveer 400 km
      },
];
