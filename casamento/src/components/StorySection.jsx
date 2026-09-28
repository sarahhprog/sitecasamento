function StorySection({ id, eyebrow, title, text, details, watercolor = false, reverse = false }) {
  const paragraphs = Array.isArray(text) ? text : [text]
  return <section className={`section story-section ${reverse ? 'paper-section' : ''}`} id={id}>
    <div className={`container story-layout ${reverse ? 'reverse' : ''}`}>
      <header className="story-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      <div className="story-feature">
        <figure className={`story-image ${watercolor ? 'watercolor' : ''}`} aria-hidden="true" />
        <div className="story-copy">
          {paragraphs.slice(0, 4).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {details && <div className="story-details">{details.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}
        </div>
      </div>
      {paragraphs.length > 4 && <div className="story-continuation">
        <div className="story-copy">
          {paragraphs.slice(4).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <figure className="story-inline-photo" aria-hidden="true" />
      </div>}
    </div>
  </section>
}

export default StorySection
