function Gallery({ images }) {
  return <section className="section gallery-section"><div className="container"><div className="section-heading"><span className="eyebrow">Alguns momentos</span><h2>Memórias que guardamos</h2><p>Uma pequena coleção de instantes especiais. Em breve, este espaço receberá nossas fotos favoritas.</p></div><div className="gallery">{images.map((image, index) => <img src={image} alt={`Momento do casal ${index + 1}`} key={image} />)}</div></div></section>
}

export default Gallery
