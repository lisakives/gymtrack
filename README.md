# GymTrack – henkilökohtainen kuntosalipäiväkirja

Kevyt PWA-sovellus (HTML, CSS, JavaScript), ei frameworkeja eikä ulkoisia kirjastoja. Tiedot tallentuvat automaattisesti selaimen LocalStorageen ja toimivat myös ilman verkkoyhteyttä.

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
    ├── views.js           Kaikki näkymät
    └── app.js             Reititys, toiminnot, lepoajastin
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

**Päivitykset:** kun muutat tiedostoja, kasvata `sw.js`-tiedoston `VERSION`-arvoa (esim. `gymtrack-v2`), jotta puhelin hakee uuden version.

## Tietojen säilyminen ja varmuuskopiot

- Kaikki muutokset tallentuvat automaattisesti heti (myös kesken treenin ja sovelluksen sulkeutuessa).
- Tiedot ovat laitekohtaisia: kotinäytön sovelluksella ja Safarilla on iPhonessa eri tallennustila.
- Ota varmuuskopio säännöllisesti: *Etusivu → rataskuvake → Vie tiedot (JSON)*. Samasta näkymästä tiedot palautetaan tiedostosta.

## Käyttövinkit salilla

- Harmaat luvut sarjakentissä ovat ehdotuksia edellisen kerran tuloksista. Jos teit saman, napauta pelkkää ✓-painiketta.
- Sarjan kuittaus käynnistää lepoajastimen automaattisesti (oletus 1:30, muutettavissa asetuksista). Ajastinta voi säätää ±15 s.
- Ylätalja ja avustetut leuanvedot vuorottelevat oletuksena treenikerrasta toiseen, ja niiden tulokset seurataan erikseen.
- Ennätykset tunnistetaan automaattisesti (suurin paino, toistoennätys samalla painolla, arvioitu 1RM Epleyn kaavalla 1–12 toiston sarjoista).

## Pilvisynkronointi myöhemmin

Kaikki tallennus kulkee `js/storage.js`:n `GT.Store`-olion kautta. Synkronointi lisätään rekisteröimällä adapteri:

```js
GT.Store.registerSync({
  name: 'cloud',
  push(state) { /* lähetä tila palvelimelle */ },
  pull() { return fetch('/api/state').then(r => r.json()); } // valinnainen
});
```
