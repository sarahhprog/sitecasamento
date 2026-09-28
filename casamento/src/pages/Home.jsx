import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import QuickLinks from '../components/QuickLinks'
import StorySection from '../components/StorySection'
import ProposalSection from '../components/ProposalSection'
import Gallery from '../components/Gallery'
import Footer from '../components/Footer'
import { useWeddingData } from '../context/weddingData'

function Home() {
  const { data } = useWeddingData()
  return <div className="site-shell"><Navbar /><main><Hero /><QuickLinks /><StorySection id="historia" eyebrow="Nossa história" title="Dois caminhos, uma só história." text={data.story} watercolor /><ProposalSection proposal={data.proposal} /><Gallery images={data.images.gallery} /></main><Footer /></div>
}

export default Home
