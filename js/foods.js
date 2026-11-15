/* GymTrack – yleisten ruokien ravintoarvot (per 100 g tai 100 ml).
 * Arvot ovat suuntaa-antavia keskiarvoja (lähteinä mm. Fineli ja
 * pakkausmerkinnät). Tarkista tarvittaessa oman tuotteen pakkauksesta.
 * por = tavallinen annos/kpl: [nimi, grammaa]
 */
(function () {
  'use strict';
  const F = (n, kcal, p, c, f, por, unit) => ({ n, kcal, p, c, f, por: por || null, unit: unit || 'g' });
  GT.FOODS = [
    // Liha, kala, kananmuna
    F('Kananmuna', 140, 12.5, 0.5, 9.7, ['kpl', 60]),
    F('Kananrintafilee (broileri), kypsä', 150, 30, 0, 2.5, ['annos', 150]),
    F('Broilerin suikale, maustamaton', 110, 23, 0, 2, ['annos', 150]),
    F('Jauheliha 10 %, kypsä', 215, 26, 0, 12, ['annos', 120]),
    F('Jauheliha 17 %, kypsä', 250, 24, 0, 17, ['annos', 120]),
    F('Naudan paisti', 190, 28, 0, 8.5, ['annos', 150]),
    F('Porsaan sisäfilee', 145, 28, 0, 3.5, ['annos', 150]),
    F('Lohi, kypsä', 210, 22, 0, 13.5, ['annos', 150]),
    F('Tonnikala vedessä', 110, 25, 0, 1, ['purkki', 150]),
    F('Katkarapu', 75, 16, 0.5, 1, ['annos', 100]),
    F('Kinkkuleike', 110, 18, 2, 3, ['viipale', 15]),
    F('Kalkkunaleike', 100, 19, 2, 1.5, ['viipale', 15]),
    F('Nakki', 240, 11, 3, 21, ['kpl', 40]),
    // Maitotuotteet
    F('Rasvaton maito', 34, 3.4, 4.8, 0.1, ['lasi', 200], 'ml'),
    F('Kevytmaito', 46, 3.5, 4.8, 1.5, ['lasi', 200], 'ml'),
    F('Rahka, maustamaton', 65, 11, 4, 0.2, ['purkki', 250]),
    F('Raejuusto', 95, 12.5, 2.5, 4, ['purkki', 200]),
    F('Turkkilainen jogurtti 10 %', 125, 3.5, 4, 10, ['annos', 150]),
    F('Maustamaton jogurtti', 60, 4, 6, 2, ['annos', 150]),
    F('Proteiinivanukas', 75, 10, 6, 1, ['purkki', 200]),
    F('Skyr, maustamaton', 60, 11, 4, 0.2, ['purkki', 150]),
    F('Juusto 17 %', 270, 28, 0, 17, ['viipale', 10]),
    F('Juusto 25 %', 330, 26, 0, 25, ['viipale', 10]),
    F('Proteiinijauhe (hera)', 380, 78, 6, 5, ['mitta', 30]),
    F('Proteiinijuoma', 50, 8, 3, 0.5, ['tölkki', 330], 'ml'),
    // Viljat ja perunat
    F('Kaurahiutaleet', 370, 13, 58, 7, ['annos', 40]),
    F('Kaurapuuro (vesi)', 60, 2, 10, 1.2, ['annos', 250]),
    F('Ruisleipä', 230, 8, 40, 2.5, ['viipale', 35]),
    F('Paahtoleipä', 260, 8.5, 47, 3.5, ['viipale', 30]),
    F('Täysjyväriisi, keitetty', 125, 2.8, 26, 1, ['annos', 150]),
    F('Riisi, keitetty', 130, 2.5, 28, 0.3, ['annos', 150]),
    F('Pasta, keitetty', 150, 5.5, 30, 0.8, ['annos', 150]),
    F('Täysjyväpasta, keitetty', 140, 5.5, 26, 1, ['annos', 150]),
    F('Peruna, keitetty', 80, 2, 17, 0.1, ['kpl', 80]),
    F('Bataatti, kypsä', 90, 2, 20, 0.2, ['annos', 150]),
    F('Tortilla', 310, 8.5, 50, 7.5, ['kpl', 60]),
    F('Mysli', 380, 9, 60, 10, ['annos', 50]),
    // Kasvikset, hedelmät
    F('Banaani', 95, 1.1, 21, 0.3, ['kpl', 120]),
    F('Omena', 50, 0.3, 11, 0.2, ['kpl', 150]),
    F('Appelsiini', 45, 0.9, 9, 0.2, ['kpl', 170]),
    F('Mustikka', 45, 0.6, 7.5, 0.6, ['dl', 65]),
    F('Pakastemarjat', 40, 0.8, 7, 0.4, ['dl', 60]),
    F('Tomaatti', 20, 0.8, 3, 0.2, ['kpl', 90]),
    F('Kurkku', 12, 0.6, 2, 0.1, ['annos', 100]),
    F('Parsakaali', 35, 3.5, 3, 0.4, ['annos', 100]),
    F('Salaatti, sekoitus', 18, 1.2, 2, 0.3, ['annos', 50]),
    F('Pakastevihannekset', 45, 2.5, 6, 0.5, ['annos', 150]),
    F('Avokado', 200, 2, 1.5, 20, ['puolikas', 70]),
    // Rasvat, pähkinät, muut
    F('Oliiviöljy', 900, 0, 0, 100, ['rkl', 10], 'ml'),
    F('Voi', 720, 0.6, 0.6, 80, ['nokare', 5]),
    F('Margariini 60 %', 540, 0, 0.5, 60, ['nokare', 5]),
    F('Maapähkinävoi', 600, 25, 14, 50, ['rkl', 15]),
    F('Mantelit', 600, 21, 6, 52, ['kourallinen', 30]),
    F('Pähkinäsekoitus', 620, 18, 10, 55, ['kourallinen', 30]),
    F('Hummus', 260, 7, 13, 19, ['rkl', 20]),
    F('Proteiinipatukka', 360, 33, 30, 12, ['kpl', 55]),
    F('Tumma suklaa 70 %', 580, 8, 33, 43, ['pala', 10]),
    F('Kahvi, musta', 2, 0.2, 0, 0, ['kuppi', 200], 'ml'),
    F('Appelsiinitäysmehu', 45, 0.7, 10, 0.1, ['lasi', 200], 'ml'),
    F('Pizza', 260, 11, 30, 10, ['pala', 120]),
    F('Hampurilainen', 250, 13, 25, 11, ['kpl', 200])
  ];
})();
