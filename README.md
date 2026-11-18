# GymTrack – treeni, ruoka ja muistutukset

Henkilökohtainen elämäntapasovellus: kuntosalipäiväkirja, ruokaseuranta, kehon mittojen seuranta, päivän tehtävät ja oikeat puhelimen push-muistutukset.

Kevyt PWA-sovellus (HTML, CSS, JavaScript), ei frameworkeja eikä ulkoisia kirjastoja. Tiedot tallentuvat automaattisesti selaimen LocalStorageen ja toimivat myös ilman verkkoyhteyttä.

## Ominaisuudet

- **Tänään**: päivän tehtävät ja suoritusprosentti, seuraava muistutus, päivän kalorit ja proteiini, pikatoiminnot.
- **Ruoka**: ateriat (1.–3. ateria, välipalat), noin 60 ruoan tietokanta, omat ruoat, suosikit (myös kokonaiset ateriat yhdellä napautuksella), "toista eilinen ateria", tavoitteet, viikko- ja kuukausiraportit.
- **Muistutukset**: oletuksena 9.00, 12.00, 15.30, 19.30, 20.00, 21.00 ja sunnuntain viikkoraportti 18.00. Aikoja voi muuttaa, lisätä, poistaa ja kytkeä pois; tehtävät merkitään tehdyiksi tai torkutetaan (10 min / 30 min / 1 h). Aterian kirjaus kuittaa vastaavan ateriamuistutuksen automaattisesti.
- **Push-ilmoitukset** tulevat palvelimelta myös sovelluksen ollessa suljettuna (ks. alla).
- **Kehitys**: paino, vyötärö, rinta, hauis ja rasvaprosentti graafeina; näkymät mittauksittain, viikoittain ja kuukausittain. Liikkeiden kehitys ja ennätykset.
- **Viikkoraportti**: ruokaseurannan toteutuminen, keskimääräiset kalorit ja proteiini, painon kehitys, suoritetut tehtävät, treenit ja parannusehdotukset.
- **Treeni**: aiemmat treeniominaisuudet ennallaan (ohjelma, sessio, lepoajastin, historia, ennätykset).

## Push-ilmoitukset: käyttöönotto (iPhonella, ilman tietokonetta)

Ilmoitukset vaativat pienen palvelimen, joka muistaa muistutusajat ja lähettää ilmoitukset oikeaan aikaan. Se on `push-server/`-kansiossa ja toimii Cloudflaren ilmaisella Workers-tasolla (Worker + D1-tietokanta + ajastin joka minuutti). GitHub Actions asentaa sen automaattisesti.

1. **Cloudflare-tili**: luo ilmainen tili osoitteessa dash.cloudflare.com. Avaa kerran *Workers & Pages* ja hyväksy/valitse workers.dev-tunnus, jos sitä kysytään.
2. **Tilin tunnus**: *Workers & Pages* -sivun oikeassa reunassa lukee *Account ID*. Kopioi se.
3. **API-tunnus**: *My Profile → API Tokens → Create Token → Edit Cloudflare Workers (Use template)*. Lisää *+ Add more* -kohdasta oikeus **Account → D1 → Edit**. Luo tunnus ja kopioi se (näytetään vain kerran).
4. **GitHub-salaisuudet**: repositoriossa *Settings → Secrets and variables → Actions → New repository secret*:
   - `CLOUDFLARE_API_TOKEN` = API-tunnus
   - `CLOUDFLARE_ACCOUNT_ID` = tilin tunnus
5. **Käynnistä**: *Actions → Push-palvelimen käyttöönotto → Run workflow*. Työnkulku ajaa testit, luo tietokannan, julkaisee palvelimen ja kirjoittaa sen osoitteen tiedostoon `js/config.js`. GitHub Pages päivittyy hetken päästä.
6. **iPhonessa**: avaa sovellus **kotinäytön kuvakkeesta** (ei Safarista) → *Muistutukset → Ilmoitukset päälle / Ilmoitukset → Ota ilmoitukset käyttöön* → salli ilmoitukset.
7. **Testaa suljettuna**: *Ilmoitukset → Testi minuutin päästä*, sulje sovellus pyyhkäisemällä se pois sovellusvaihtajasta ja odota. Ilmoituksen pitää tulla lukitusnäytölle.

Vaatimukset ja rajoitukset:
- iOS 16.4 tai uudempi, ja sovellus pitää lisätä Koti-valikkoon (Safari → Jaa → Lisää Koti-valikkoon). Safarin välilehdessä iPhone ei näytä verkkosovellusten ilmoituksia.
- Jos lupa on estetty: *Asetukset → Ilmoitukset → GymTrack → Salli ilmoitukset*.
- Keskittymistila ja Ilmoitusten ajoitettu yhteenveto voivat viivästyttää ilmoituksia.
- iPhonessa ilmoituksen napautus avaa sovelluksen, jossa valitaan *Tehty* tai *Torkuta*. (Androidilla ja tietokoneella painikkeet näkyvät suoraan ilmoituksessa.)
- Jos sovellus asennetaan Koti-valikkoon uudelleen, ilmoitukset otetaan käyttöön uudelleen samasta näkymästä.
- Palvelin luo VAPID-avaimet itse ensimmäisellä käytöllä. Jokainen laite saa satunnaisen tunnisteen ja salaisuuden; tiedot ovat vain sinun Cloudflare-tililläsi.

Palvelimen osoitteen voi asettaa myös käsin: *Muistutukset → Ilmoitukset → Push-palvelimen osoite*.

## Testit

```bash
cd push-server && npm test        # salaus (RFC 8291 -testivektori), VAPID, ajastus, torkut, tilaukset, tilit, varmuuskopiot
python3 -m http.server 8000       # repositorion juuressa
node tests/dev-server.mjs         # paikallinen palvelin (Worker Nodessa, ei vaadi Cloudflarea)
node tests/e2e.mjs                # selaintestit iPhone-näkymässä (Playwright)
```

## Tiedostot

```
gymtrack/
├── index.html             Sovelluksen runko ja alavalikko
├── styles.css             Ulkoasu
├── manifest.webmanifest   PWA-asetukset (nimi, ikonit, koko näytön tila)
├── sw.js                  Service worker (offline-tuki)
├── icons/                 Sovellusikonit (iPhone + Android)
└── js/
    ├── storage.js         Tallennuskerros (LocalStorage, vienti/palautus, synkronoinnin liityntäkohta)
    ├── model.js           Oletusohjelma, ennätys- ja tilastolaskenta, muotoilut
    ├── charts.js          SVG-graafit
    ├── ui.js              Ikonit, ilmoitukset, alapaneelit ja lomakkeet
    ├── views.js           Treeni- ja mittausnäkymät
    ├── config.js          Push-palvelimen osoite (työnkulku kirjoittaa)
    ├── foods.js           Ruokatietokanta
    ├── life.js            Ruoka, muistutukset, tehtävät, viikkoraportti (laskenta)
    ├── push.js            Ilmoitusluvat, push-tilaus, synkronointi palvelimelle
    ├── lifeviews.js       Tänään-, Ruoka-, Muistutus-, Ilmoitus- ja raporttinäkymät
    ├── lifeactions.js     Edellisten toiminnot
    ├── cloud.js           Salaus, käyttäjätili ja automaattinen pilvivarmuuskopio
    ├── account.js         Tilin näkymät: luo tili, kirjaudu, unohtuiko salasana, versiot
    └── app.js             Reititys, toiminnot, lepoajastin
push-server/               Push-palvelin, tilit ja varmuuskopiot (Cloudflare Worker), testit
.github/workflows/         Push-palvelimen automaattinen käyttöönotto
tests/e2e.mjs              Selaintestit
```

## Käynnistys tietokoneella

Kansiossa ajetaan mikä tahansa kevyt paikallinen palvelin, esimerkiksi:

```bash
cd gymtrack
python3 -m http.server 8000
```

Avaa sitten selaimessa `http://localhost:8000`.

`index.html` aukeaa myös suoraan tuplaklikkaamalla, mutta silloin offline-tuki (service worker) ei ole käytössä.

## Asennus iPhonen kotinäyttöön

iPhone vaatii, että sovellus ladataan HTTPS-osoitteesta. Helpoin ilmainen tapa on GitHub Pages:

1. Luo GitHubiin uusi repositorio, esimerkiksi `gymtrack`.
2. Lataa kaikki `gymtrack`-kansion tiedostot repositorion juureen (*Add file → Upload files*), niin että `index.html` on juuressa.
3. Avaa repositoriossa *Settings → Pages*, valitse *Source: Deploy from a branch*, haaraksi `main` ja kansioksi `/ (root)`, ja tallenna.
4. Hetken päästä sovellus on osoitteessa `https://<käyttäjänimi>.github.io/gymtrack/`.
5. Avaa osoite iPhonen **Safarissa**, napauta *Jaa*-painiketta ja valitse **Lisää Koti-valikkoon**.

Sovellus aukeaa nyt kotinäytöltä koko näytön tilassa omana sovelluksenaan. Muita vaihtoehtoja ovat esim. Netlify Drop (raahaa kansio sivulle) tai Cloudflare Pages.

**Päivitykset:** kun muutat tiedostoja, kasvata `sw.js`-tiedoston `VERSION`-arvoa (esim. `gymtrack-v5`), jotta puhelin hakee uuden version.

## Tietojen säilyminen: käyttäjätili ja automaattinen pilvivarmuuskopio

- Kaikki muutokset tallentuvat heti puhelimeen (myös kesken treenin ja sovelluksen sulkeutuessa).
- **Luo tili** (*Asetukset → Tili ja pilvivarmuuskopio → Luo tili*): käyttäjänimi ja salasana. Sen jälkeen tiedot varmuuskopioituvat pilveen itsestään muutaman sekunnin kuluttua jokaisesta muutoksesta ja aina kun sovellus suljetaan.
- **Uusi puhelin**: asenna sovellus ja kirjaudu samalla käyttäjänimellä ja salasanalla, niin kaikki tiedot palautuvat. Jos käytössä on kaksi laitetta, toisen laitteen muutokset haetaan automaattisesti sovellusta avattaessa.
- **Unohtuiko salasana?** Tiliä luodessa näytetään kerran 20-merkkinen palautuskoodi. Tallenna se salasanojen hallintaan tai kuvakaappauksena. Koodilla voi asettaa uuden salasanan; muut kirjautuneet laitteet pyytävät silloin kirjautumaan uudelleen.
- **Aiemmat versiot**: palvelin säilyttää jokaiselta päivältä päivän viimeisimmän tilan 30 päivän ajan (*Palauta aiempi versio*).
- JSON-tiedostoon vienti ja palautus toimivat edelleen samassa näkymässä.

### Tietosuoja

- Sähköpostia tai muita henkilötietoja ei kysytä. Käyttäjänimen ei tarvitse olla oikea nimi.
- Salasana ja palautuskoodi eivät koskaan lähde puhelimesta. Niistä johdetaan puhelimessa PBKDF2:lla (SHA-256, 150 000 kierrosta) kaksi avainta: kirjautumisavain, josta palvelin tallentaa vain suolatun tiivisteen, ja salausavain, joka ei lähde puhelimesta.
- Tiedot pakataan ja salataan puhelimessa (AES-256-GCM) satunnaisella tietoavaimella ennen lähetystä. Palvelin (oma Cloudflare-tilisi) näkee vain salattua dataa eikä pysty lukemaan treenejä, ruokia tai mittoja.
- Tietoavain on palvelimella vain salasanalla ja palautuskoodilla lukittuna. Siksi salasanaa ei voi palauttaa ilman palautuskoodia: jos molemmat katoavat, pilvikopiota ei voi avata (puhelimen tiedot säilyvät silti).
- Toistuvat väärät salasanat lukitsevat tilin 15 minuutiksi.
- *Poista tili ja pilvikopiot* poistaa tilin ja kaikki varmuuskopiot palvelimelta pysyvästi.
- Tilit ja varmuuskopiot käyttävät samaa push-palvelinta (Worker + D1), joten erillistä käyttöönottoa ei tarvita.

## Käyttövinkit salilla

- Harmaat luvut sarjakentissä ovat ehdotuksia edellisen kerran tuloksista. Jos teit saman, napauta pelkkää ✓-painiketta.
- Sarjan kuittaus käynnistää lepoajastimen automaattisesti (oletus 1:30, muutettavissa asetuksista). Ajastinta voi säätää ±15 s.
- Ylätalja ja avustetut leuanvedot vuorottelevat oletuksena treenikerrasta toiseen, ja niiden tulokset seurataan erikseen.
- Ennätykset tunnistetaan automaattisesti (suurin paino, toistoennätys samalla painolla, arvioitu 1RM Epleyn kaavalla 1–12 toiston sarjoista).
