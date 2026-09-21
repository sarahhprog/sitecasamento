function StorySection({ id, eyebrow, title, text, image, details, watercolor = false, reverse = false }) {
  const paragraphs = Array.isArray(text) ? text : [text]
  return <section className={`section ${reverse ? 'paper-section' : ''}`} id={id}><div className={`container story-grid ${reverse ? 'reverse' : ''}`}><div className={`story-image ${watercolor ? 'watercolor' : ''}`}><img src={image} alt={watercolor ? 'Praça e arquitetura urbana, em referência à Praça Milton Campos' : ''} /></div><div className="story-copy"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{details && <div className="story-details">{details.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}</div></div></section>
}

export default StorySection
