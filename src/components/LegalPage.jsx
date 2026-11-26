import '../styles/legal.css';
import { LEGAL_UPDATED, CONTACT_URL } from '../legal/content.js';

// A public, static page: no sign-in, no workspace code. Indonesian first, English below, each reachable by an anchor.
const label = { id: { updated: 'Diperbarui', contact: 'Kontak', home: 'Vayora Social Studio', other: 'English' }, en: { updated: 'Updated', contact: 'Contact', home: 'Vayora Social Studio', other: 'Bahasa Indonesia' } };

function Document({ lang, doc }) {
  const t = label[lang];
  return (
    <article id={lang} lang={lang} className="legal-doc">
      <h2>{doc.title}</h2>
      <p className="legal-meta">{t.updated}: {LEGAL_UPDATED} · <a href={CONTACT_URL}>{t.contact}: vayora.id</a></p>
      <p>{doc.intro}</p>
      {doc.sections.map(section => (
        <section key={section.h}>
          <h3>{section.h}</h3>
          {(section.p || []).map(text => <p key={text}>{text}</p>)}
          {section.ul ? <ul>{section.ul.map(text => <li key={text}>{text}</li>)}</ul> : null}
        </section>
      ))}
    </article>
  );
}

export default function LegalPage({ content }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-brand" href="/"><img src="/brand/logo.svg" alt="Vayora.id" width="132" height="40" /></a>
        <nav aria-label="Language"><a href="#id">Bahasa Indonesia</a> · <a href="#en">English</a></nav>
      </header>
      <Document lang="id" doc={content.id} />
      <hr />
      <Document lang="en" doc={content.en} />
      <footer className="legal-footer"><a href="/privacy">Privacy · Privasi</a> · <a href="/terms">Terms · Syarat</a> · <a href={CONTACT_URL}>vayora.id</a></footer>
    </main>
  );
}
