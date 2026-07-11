/**
 * Single source of truth for site-wide config: identity, links, nav.
 */
export const site = {
  name: 'Hamid Taheri',
  shortName: 'H. Taheri',
  role: 'research_engineer',
  title: 'Hamid Taheri — Robotics · Perception · Reinforcement Learning',
  description:
    'Hamid Taheri builds learning-based perception and control systems for intelligent robots and real-world AI — from safe mobile-robot navigation with deep reinforcement learning to real-time computer vision and production AI.',
  tagline: 'Robotics · Perception · Deep RL',
  url: 'https://hamidthri.github.io',
  location: 'Heilbronn, Germany',
  email: 'taheri.hamiid@gmail.com',
  ogImage: '/og/default-v2.png',
} as const;

export const links = {
  github: 'https://github.com/hamidthri',
  scholar: 'https://scholar.google.com/citations?user=lsBUB9QAAAAJ&hl=en',
  linkedin: 'https://www.linkedin.com/in/hamiid-taheri/',
  email: `mailto:${site.email}`,
  cv: '/cv/Hamid_Taheri_CV.pdf',
} as const;

export const githubUser = 'hamidthri';

export const navItems = [
  { href: '/home', label: 'home' },
  { href: '/research', label: 'research' },
  { href: '/projects', label: 'projects' },
  { href: '/blog', label: 'notes' },
  { href: '/contact', label: 'contact' },
] as const;

/** JSON-LD Person schema for SEO. */
export function personJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    url: site.url,
    image: `${site.url}/media/Hamid_prof.png`,
    email: site.email,
    jobTitle: 'Applied AI / Computer Vision & Robotics Engineer',
    address: { '@type': 'PostalAddress', addressLocality: 'Heilbronn', addressCountry: 'DE' },
    knowsAbout: [
      'Reinforcement Learning',
      'Robotics',
      'Computer Vision',
      'Deep Learning',
      'Mobile Robot Navigation',
      '3D Perception',
    ],
    sameAs: [
      links.github,
      links.scholar,
      links.linkedin,
      'https://orcid.org/0009-0002-4004-8466',
      'https://www.wikidata.org/wiki/Q140506078',
    ],
  };
}
