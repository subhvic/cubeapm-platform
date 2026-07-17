function K8sWheel({ size }) {
  const spokes = Array.from({ length: 7 }, (_, i) => {
    const angle = (i * (360 / 7) - 90) * (Math.PI / 180)
    return {
      x1: 12 + Math.cos(angle) * 4.2,
      y1: 12 + Math.sin(angle) * 4.2,
      x2: 12 + Math.cos(angle) * 9.6,
      y2: 12 + Math.sin(angle) * 9.6,
    }
  })
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#326CE5" strokeWidth="1.4" />
      {spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#326CE5" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      <circle cx="12" cy="12" r="3.3" fill="#326CE5" />
    </svg>
  )
}

const ICONS = {
  aws: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M4 15c3.2 2.6 12.6 2.6 16 0" stroke="#FF9900" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M16.5 12.8l3.3 1.9-3.3 1.9" stroke="#FF9900" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  gcp: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M14.5 8.2a5 5 0 00-4.9 4 3.6 3.6 0 00-4.1 3.6 3.6 3.6 0 003.6 3.6h9.4a3.9 3.9 0 001-7.7A5 5 0 0014.5 8.2z" fill="#4285F4" />
    </svg>
  ),
  k8s: (size) => <K8sWheel size={size} />,
  host: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#22D3EE" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <circle cx="7" cy="7" r=".6" fill="#22D3EE" stroke="none" />
      <circle cx="7" cy="17" r=".6" fill="#22D3EE" stroke="none" />
    </svg>
  ),
  apache: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 2c-1.2 4-6 5.2-6 10 0 3 2 5 4 6-1-2-1-4.2 0-6.2 1 3 3 4.2 3 4.2s-1-2.2 0-4.2c2 2 3.2 5 3.2 5 2-4.2 1.8-9.5-4.2-15z" fill="#D22128" />
    </svg>
  ),
  elastic: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="3.5" width="18" height="4.3" rx="1.8" fill="#FEC514" />
      <rect x="3" y="9.85" width="18" height="4.3" rx="1.8" fill="#00BFB3" />
      <rect x="3" y="16.2" width="18" height="4.3" rx="1.8" fill="#F04E98" />
    </svg>
  ),
  haproxy: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 2.2l8 4.4v11L12 21.9l-8-4.4v-11z" fill="#69AE38" />
    </svg>
  ),
  iis: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="3" y="3" width="8" height="8" fill="#00A4EF" />
      <rect x="13" y="3" width="8" height="8" fill="#7FBA00" />
      <rect x="3" y="13" width="8" height="8" fill="#F25022" />
      <rect x="13" y="13" width="8" height="8" fill="#FFB900" />
    </svg>
  ),
  kafka: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000000" />
      <circle cx="7" cy="6.5" r="1.3" fill="white" />
      <circle cx="7" cy="12" r="1.3" fill="white" />
      <circle cx="7" cy="17.5" r="1.3" fill="white" />
      <circle cx="17" cy="9" r="1.3" fill="white" />
      <circle cx="17" cy="15" r="1.3" fill="white" />
      <line x1="7" y1="6.5" x2="17" y2="9" stroke="white" strokeWidth=".9" />
      <line x1="7" y1="12" x2="17" y2="9" stroke="white" strokeWidth=".9" />
      <line x1="7" y1="12" x2="17" y2="15" stroke="white" strokeWidth=".9" />
      <line x1="7" y1="17.5" x2="17" y2="15" stroke="white" strokeWidth=".9" />
    </svg>
  ),
  memcached: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="12" r="10" fill="#6F81A5" />
      <text x="12" y="16.5" fontSize="12" fontWeight="700" textAnchor="middle" fill="white">M</text>
    </svg>
  ),
  mongo: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 2c3.3 4.2 5 8 5 11.5a5 5 0 01-10 0C7 10 8.7 6.2 12 2z" fill="#4FAA41" />
      <line x1="12" y1="14.5" x2="12" y2="22" stroke="#4FAA41" strokeWidth="1.3" />
    </svg>
  ),
  mysql: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M3.5 17c4-6.5 8.5-9.5 13.5-9.5 2 0 3.2.6 3.2.6s-4 .2-6.8 3.2c2.8-.3 5 .6 6 2.7-2.8-1-5-.8-7 .3-2.6 1.4-5.8 2.7-8.9 2.7z" fill="#00758F" />
      <circle cx="18.3" cy="8.6" r=".9" fill="#E48E00" />
    </svg>
  ),
  nginx: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#009639" />
      <path d="M8 8.3v7.4l8-7.4v7.4" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  postgres: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12 2.5a7.2 7.2 0 00-7.2 7.2c0 2.1 1 3.1 1 5.1 0 1-.8 1.9-.8 1.9h3s.8-1 .8-1.9c1 .8 2 .9 3.2.9s2.2-.1 3.2-.9c0 .9.8 1.9.8 1.9h3s-.8-.9-.8-1.9c0-2 1-3 1-5.1A7.2 7.2 0 0012 2.5z" fill="#336791" />
    </svg>
  ),
  rabbit: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#FF6600" />
      <rect x="7.2" y="5" width="2.3" height="5.2" fill="white" />
      <rect x="11.2" y="5" width="2.3" height="5.2" fill="white" />
      <rect x="7.2" y="12" width="9.6" height="6" fill="white" />
    </svg>
  ),
  redis: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <ellipse cx="12" cy="6.3" rx="8.3" ry="2.3" fill="#DC382D" />
      <ellipse cx="12" cy="12" rx="8.3" ry="2.3" fill="#DC382D" />
      <ellipse cx="12" cy="17.7" rx="8.3" ry="2.3" fill="#DC382D" />
      <circle cx="16.5" cy="6.1" r=".8" fill="#F5D9A8" />
      <circle cx="15" cy="11.8" r=".8" fill="#F5D9A8" />
    </svg>
  ),
  sqlsvr: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <ellipse cx="12" cy="6" rx="8" ry="2.8" fill="#CC2927" />
      <path d="M4 6v12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V6" fill="none" stroke="#CC2927" strokeWidth="1.5" />
    </svg>
  ),
  varnish: (size) => (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M4.5 5l7.5 13.5L19.5 5" fill="none" stroke="#E7500E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

export default function InfraIcon({ id, size = 16 }) {
  const render = ICONS[id]
  if (!render) {
    return <span className="infra-source-icon-fallback" style={{ width: size, height: size }} />
  }
  return <span className="infra-source-icon-svg" style={{ width: size, height: size }}>{render(size)}</span>
}
