import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import QuickLinks from '../components/QuickLinks'
import StorySection from '../components/StorySection'
import ProposalSection from '../components/ProposalSection'
import Gallery from '../components/Gallery'
import Footer from '../components/Footer'
import { weddingData } from '../data/weddingData'

function Home() {
  return <div className="site-shell"><Navbar /><main><Hero /><QuickLinks /><StorySection id="historia" eyebrow="Nossa história" title="Dois caminhos, uma só história." text={weddingData.story} image={weddingData.images.story} watercolor /><ProposalSection proposal={weddingData.proposal} /><Gallery images={weddingData.images.gallery} /></main><Footer /></div>
}

export default Home
