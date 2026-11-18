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
    ├── authgate.js        Kirjautumissivu latausnäytön jälkeen (salasana, Face ID, Google)
    ├── splash.js          Animoitu latausnäyttö
    ├── native.js          Silta iPhone-sovellukseen (widgetit, ilmoitukset)
    └── app.js             Reititys, toiminnot, lepoajastin
push-server/               Push-palvelin, tilit ja varmuuskopiot (Cloudflare Worker), testit
.github/workflows/         Push-palvelimen automaattinen käyttöönotto
tests/e2e.mjs              Selaintestit
ios/                       iPhone-sovellus ja widgetit (Xcode-projekti, ks. alla)
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
## iPhone-sovellus ja kotinäytön widgetit (Xcode)

`ios/`-kansiossa on Xcode-projekti, joka tekee GymTrackista oikean iPhone-sovelluksen. Sovelluksessa on sama käyttöliittymä kuin verkkosovelluksessa, ja lisäksi:

- **Kotinäytön widgetit**
  - *Ravinto* (pieni ja keskikokoinen): päivän kalorit renkaana, proteiini, hiilihydraatit ja rasva suhteessa tavoitteisiin.
  - *Päivän tehtävät* (pieni, keskikokoinen ja iso): suoritusprosentti, seuraava muistutus ja tehtävälista. Tehtävän voi kuitata tehdyksi suoraan widgetistä napauttamalla ympyrää.
  - *Päivän yhteenveto* (keskikokoinen ja iso): kalorit, proteiini ja tehtävät renkaina, ateriat, viikon treenit, paino ja seuraava muistutus.
  - Lukitusnäytölle: kalorimittari, tehtävämittari, seuraava muistutus ja yhden rivin teksti.
- **Muistutukset iPhonen omina ilmoituksina**: push-palvelinta ei tarvita. Ilmoituksessa on painikkeet *Tehty* ja *Torkuta 10 min* (paina ilmoitusta pitkään).
- Widgetit päivittyvät aina, kun kirjaat jotain sovellukseen, ja seuraava muistutus vaihtuu widgetissä itsestään ajan kuluessa. Keskiyöllä widget siirtyy uuteen päivään.
- Sovellus toimii kokonaan ilman verkkoyhteyttä (vain ruokahaku Open Food Factsista tarvitsee verkon).

### Mitä tarvitaan

- **Mac**, johon on asennettu **Xcode** (ilmainen, Mac App Storesta). Ilman Macia sovellusta ei voi asentaa.
- iPhone, jossa on **iOS 17** tai uudempi, ja USB-kaapeli.
- Apple ID. Ilmainen riittää, mutta silloin sovellus pitää asentaa uudelleen Xcodesta **7 päivän välein** (ks. alla).

### Asennus vaihe vaiheelta

1. **Lataa koodi Macille**: GitHubissa repositorion etusivulla *Code → Download ZIP*. Pura ZIP-tiedosto (tuplaklikkaus).
2. **Avaa projekti**: avaa purettu kansio ja sieltä `ios` → tuplaklikkaa `GymTrack.xcodeproj`. Xcode aukeaa.
3. **Kirjaudu Apple ID:llä**: Xcoden valikosta *Xcode → Settings… → Accounts* → vasemmasta alakulmasta **+** → *Apple ID* → kirjaudu.
4. **Valitse allekirjoitus**: vasemmasta reunasta ylin rivi **GymTrack** (sininen kuvake) → keskeltä välilehti **Signing & Capabilities**.
   - Valitse *TARGETS*-listasta **GymTrack** ja kohtaan **Team** oma nimesi (*Personal Team*).
   - Valitse sitten *TARGETS*-listasta **GymTrackWidgetExtension** ja valitse sama **Team**.
5. **iPhonen kehittäjätila**: liitä iPhone kaapelilla Maciin ja napauta iPhonessa *Luota tähän tietokoneeseen*. iPhonessa *Asetukset → Tietosuoja ja turvallisuus → Kehittäjätila* → päälle → iPhone käynnistyy uudelleen → vahvista *Laita päälle*. (Kehittäjätila-kohta tulee näkyviin vasta, kun iPhone on ollut kytkettynä Xcodeen.)
6. **Asenna**: valitse Xcoden yläpalkin keskeltä laitteeksi oma iPhonesi ja paina vasemmalla ylhäällä **▶**-painiketta. Ensimmäinen käännös kestää muutaman minuutin.
7. **Luota kehittäjään** (vain ensimmäisellä kerralla): jos iPhone sanoo *Epäluotettu kehittäjä*, avaa *Asetukset → Yleiset → VPN ja laitehallinta* → oma Apple ID → **Luota**. Paina sitten Xcodessa ▶ uudelleen.
8. **Siirrä vanhat tiedot**: sovelluksella on oma tallennustilansa, joten kotinäytön verkkosovelluksen tiedot eivät siirry itsestään.
   - Avaa vanha (kotinäytön verkko-) GymTrack → *Tänään* → rataskuvake → **Vie tiedot (JSON)** → *Tallenna Tiedostot-appiin*.
   - Avaa uusi GymTrack-sovellus → *Tänään* → rataskuvake → **Palauta varmuuskopiosta** → valitse tallentamasi tiedosto.
9. **Ilmoitukset**: uudessa sovelluksessa *Muistutukset → Ilmoitukset → Ota ilmoitukset käyttöön* → *Salli*. Poista samalla vanhan verkkosovelluksen ilmoitukset käytöstä (tai poista sen kuvake kotinäytöltä), ettei muistutuksia tule kahteen kertaan.
10. **Lisää widgetit**: paina kotinäytön tyhjää kohtaa pitkään → vasemmasta yläkulmasta **Muokkaa** → **Lisää widget** → etsi **GymTrack** → valitse koko → *Lisää widget*. Lukitusnäytön widgetit: paina lukitusnäyttöä pitkään → *Muokkaa* → *Lukitusnäyttö* → napauta widgettialuetta.

### Hyvä tietää

- **7 päivän raja (ilmainen Apple ID)**: Applen sääntöjen mukaan ilmaisella tunnuksella asennettu sovellus lakkaa aukeamasta 7 päivän päästä. Kytke iPhone Maciin ja paina Xcodessa ▶ uudelleen, niin se toimii taas 7 päivää. **Tiedot säilyvät**, kun asennat vanhan päälle. Älä poista sovellusta puhelimesta, koska silloin sen tiedot poistuvat. Maksullisella Apple Developer -jäsenyydellä (99 €/vuosi) asennus on voimassa vuoden.
- **Päivitykset**: sovellus käyttää repositorion verkkosovellustiedostoja (`index.html`, `styles.css`, `js/`). Kun koodi päivittyy, lataa uusi versio ja paina Xcodessa ▶.
- **Varmuuskopio**: ota silti välillä varmuuskopio (*Vie tiedot*). Sovellus pitää lisäksi omaa varakopiota tiedoista ja palauttaa sen automaattisesti, jos selaintallennus joskus tyhjenisi.

### Jos jokin menee pieleen

- **"Failed to register bundle identifier" tai "… is not available"**: tunniste on jo jonkun muun käytössä. Avaa Xcodessa vasemmalta `Config` → `Shared.xcconfig` ja vaihda rivin `GT_BUNDLE_PREFIX = com.lisakives` loppuun jokin oma, esim. `com.etunimisukunimi`. Paina ▶ uudelleen.
- **Punainen virhe Signing & Capabilities -välilehdellä**: tarkista, että Team on valittu *molemmille* kohteille (GymTrack ja GymTrackWidgetExtension), ja napauta virheen vieressä *Try Again*.
- **Widget sanoo "Avaa GymTrack kerran"**: avaa sovellus, odota hetki ja palaa kotinäytölle. Sovellus ja widgetit jakavat tiedot yhteisen avainnipun (*Keychain Sharing*) kautta, joka toimii myös ilmaisella Apple ID:llä.
- **"Could not launch" / laite lukittuna**: avaa iPhonen lukitus ja paina ▶ uudelleen.
- **Widget näyttää vanhoja tietoja**: avaa sovellus hetkeksi, niin widget päivittyy.
- **Ilmainen tunnus**: samalla tunnuksella voi olla asennettuna enintään 3 omaa sovellusta kerrallaan.

### Tekninen toteutus

- `ios/GymTrack/`: SwiftUI-sovellus, joka näyttää verkkosovelluksen `WKWebView`-näkymässä. Tiedostot kopioidaan sovelluksen sisään käännöksen aikana (*Kopioi verkkosovellus* -vaihe) ja tarjoillaan osoitteesta `gtapp://localhost/`, joten tallennus (localStorage) on pysyvä ja toimii ilman verkkoa.
- `js/native.js`: silta sovellukseen. Lähettää jokaisen tallennuksen jälkeen widgetin tiedot, seuraavan 7 päivän muistutukset ja varmuuskopion. Selaimessa moduuli ei tee mitään.
- `ios/Shared/`: yhteinen tallennus sovelluksen ja widgettien välillä (jaettu avainnippu, koska ilmainen Apple ID ei voi käyttää App Groupeja), widgetin tietomalli ja värit.
- `ios/GymTrackWidget/`: WidgetKit-laajennus (kolme widgettiä) ja `CompleteTaskIntent` (tehtävän kuittaus widgetistä). Widgetistä tai ilmoituksesta tehdyt kuittaukset jäävät jonoon ja siirtyvät sovelluksen tietoihin seuraavalla avauksella.
- Syvälinkit: `gymtrack://today`, `gymtrack://food`, `gymtrack://reminders`, `gymtrack://task/<id>`.

## Tietojen säilyminen ja varmuuskopiot

- Kaikki muutokset tallentuvat heti puhelimeen (myös kesken treenin ja sovelluksen sulkeutuessa).
- **Luo tili** (*Asetukset → Tili ja pilvivarmuuskopio → Luo tili*): käyttäjänimi ja salasana. Sen jälkeen tiedot varmuuskopioituvat pilveen itsestään muutaman sekunnin kuluttua jokaisesta muutoksesta ja aina kun sovellus suljetaan.
- **Uusi puhelin**: asenna sovellus ja kirjaudu samalla käyttäjänimellä ja salasanalla, niin kaikki tiedot palautuvat. Jos käytössä on kaksi laitetta, toisen laitteen muutokset haetaan automaattisesti sovellusta avattaessa.
- **Unohtuiko salasana?** Tiliä luodessa näytetään kerran 20-merkkinen palautuskoodi. Tallenna se salasanojen hallintaan tai kuvakaappauksena. Koodilla voi asettaa uuden salasanan; muut kirjautuneet laitteet pyytävät silloin kirjautumaan uudelleen.
- **Aiemmat versiot**: palvelin säilyttää jokaiselta päivältä päivän viimeisimmän tilan 30 päivän ajan (*Palauta aiempi versio*).
- JSON-tiedostoon vienti ja palautus toimivat edelleen samassa näkymässä.

### Pikakirjautuminen: Face ID ja Google

- **Face ID**: kirjautumissivulla *Kirjaudu Face ID:llä*. Käyttöön otetaan tilin luonnin tai kirjautumisen jälkeen (tai *Asetukset → Kirjautumistavat*). Pääsyavain synkronoituu iCloud-avainnipun kautta, joten se toimii myös uudessa iPhonessa samalla Apple ID:llä. Salaus säilyy päästä päähän (pääsyavaimen PRF-laajennus, iOS 18 tai uudempi).
- **Google**: *Jatka Googlella* luo uuden tilin tai kirjautuu tilille, johon Google on yhdistetty (*Asetukset → Yhdistä Google-tili*). Google-kirjautumisessa salausavain säilytetään palvelimella palvelimen omalla avaimella lukittuna, joten palvelin voisi teknisesti avata varmuuskopion. Googlelta tallennetaan vain tunniste, ei sähköpostia.
- **Google-kirjautumisen käyttöönotto (kerran)**:
  1. Avaa console.cloud.google.com → luo projekti (esim. GymTrack).
  2. *APIs & Services → OAuth consent screen*: User type *External*, sovelluksen nimi GymTrack, tallenna. Lisää itsesi testikäyttäjäksi tai julkaise (*Publish app*).
  3. *APIs & Services → Credentials → Create credentials → OAuth client ID*: tyyppi *Web application*, *Authorized JavaScript origins*: `https://lisakives.github.io`. Luo.
  4. Kopioi *Client ID* (muotoa `…apps.googleusercontent.com`; se ei ole salaisuus) tiedostoon `push-server/wrangler.toml` kohtaan `GOOGLE_CLIENT_ID` ja mergeä `main`-haaraan. Työnkulku julkaisee palvelimen, ja Google-painike ilmestyy sovellukseen.

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
