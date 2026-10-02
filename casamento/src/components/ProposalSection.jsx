function ProposalSection({ proposal }) {
  function renderParagraph(paragraph) {
    if (paragraph.startsWith('O pedido aconteceu')) {
      return <>O pedido aconteceu no <strong>Hortus Botanicus Amsterdam</strong>, um dos jardins botânicos mais antigos do mundo. O lugar, cercado por plantas, estufas e muita natureza, tornou aquele momento ainda mais especial.</>
    }

    return paragraph
  }

  return <section className="section proposal-section" id="pedido">
    <div className="container proposal-layout">
      <div className="proposal-copy">
        <span className="eyebrow">E então, chegou o pedido...</span>
        <h2>O pedido</h2>
        <div className="proposal-date">{proposal.date}</div>
        {proposal.story.map((paragraph) => <p key={paragraph}>{renderParagraph(paragraph)}</p>)}
      </div>
      <div className="proposal-gallery">
        <figure className="proposal-photo proposal-photo-main" aria-hidden="true" />
        <figure className="proposal-photo proposal-photo-secondary" aria-hidden="true" />
        <span className="proposal-botanical" aria-hidden="true">✦</span>
      </div>
    </div>
  </section>
}

export default ProposalSection
