import { useNavigate } from 'react-router-dom'
import { backendEnabled } from '../../../services/backend/supabase'
import BottomNav from '../../../components/layout/BottomNav'

// A factual account of what the app stores, where it goes, and which rights the
// driver can exercise from inside the app. Written to match what the code
// actually does — if the data flows change, change this text with them.
//
// NB this is a data statement, not a reviewed legal privacy policy: the hosting
// party and the eventual payment provider still have to be named before launch.
export default function Privacy() {
  const navigate = useNavigate()

  return (
    <div className="screen">
      <header className="page-head">
        <button className="auth-link" onClick={() => navigate('/settings')}>← Instellingen</button>
        <h1>Privacy en gegevens</h1>
      </header>

      <div className="content">
        <div className="card">
          <h2 className="card-title">Wat we bewaren</h2>
          <ul className="prose-list">
            <li><strong>Je profiel</strong> — naam, kenteken en (bij een account) je e-mailadres.</li>
            <li><strong>Je parkeersessies</strong> — begin- en eindtijd, duur, zone, tarief, kosten
              en de coördinaten van je parkeerplek.</li>
            <li><strong>Je instellingen</strong> — thema, budget, dagmaximum, vergunningszones en
              of locatie aanstaat.</li>
          </ul>
        </div>

        <div className="card">
          <h2 className="card-title">Waar het staat</h2>
          <p className="card-desc">
            Alles staat eerst op dit apparaat, in de opslag van je browser.
            {backendEnabled
              ? ' Met een account wordt het daarnaast gesynchroniseerd met onze server (Supabase, EU-regio), zodat je het op een ander apparaat terugziet. Alleen jij kunt bij je eigen rijen.'
              : ' Er is geen account gekoppeld, dus je gegevens verlaten dit apparaat niet.'}
          </p>
        </div>

        <div className="card">
          <h2 className="card-title">Wat we aan derden vragen</h2>
          <ul className="prose-list">
            <li><strong>Kaarten</strong> — kaarttegels komen van CARTO/OpenStreetMap. Die zien het
              gebied dat je bekijkt.</li>
            <li><strong>Zoeken</strong> — zoek je een adres, dan gaat die zoekterm naar OpenStreetMap
              (Nominatim).</li>
            <li><strong>Laadpunten</strong> — de laadpuntenlaag haalt locaties op bij Open Charge Map,
              met het kaartgebied als zoekvenster. Alleen als je de laag aanzet.</li>
            <li><strong>Parkeertarieven</strong> — die zitten in de app zelf, uit open data van de RDW.
              Er gaat bij het bepalen van een tarief niets naar buiten.</li>
          </ul>
          <p className="card-desc">
            We sturen je kenteken, naam of parkeergeschiedenis naar geen van deze partijen.
          </p>
        </div>

        <div className="card">
          <h2 className="card-title">Jouw rechten</h2>
          <p className="card-desc">
            Je kunt je gegevens downloaden en je account volledig verwijderen — allebei
            bij Instellingen. Verwijderen wist ook de rijen op de server en kan niet
            ongedaan worden gemaakt.
          </p>
          <button className="btn btn-ghost" onClick={() => navigate('/settings')}>
            Naar Instellingen
          </button>
        </div>
      </div>

      <BottomNav active="settings" />
    </div>
  )
}
