import type { ReactNode } from 'react'

type Props = { name: string, image?: string | null, label?: string, className?: string }

const paths: Record<string, ReactNode> = {
  transfer: <path d="M8 3v17M4 7l4-4 4 4M16 21V4M12 17l4 4 4-4" />,
  gasoline: <><path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M2 21h14M4 10h10M14 12h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V8l-4-4M19 5v4h3" /></>,
  wallet: <><path d="M3 7V5l14-3v5M20 12V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" /><path d="M21 12h-5a2 2 0 0 0 0 4h5zM17 14h.01" /></>,
  bank: <path d="m3 8 9-5 9 5H3Zm2 3v8m5-8v8m4-8v8m5-8v8M3 21h18" />,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  tag: <path d="m4 4 7-2 9 9-9 9-9-9zM8 8h.01" />,
  food: <><path d="M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2v20M17 2c3 2 3 7 0 9" /></>,
  home: <><path d="m3 11 9-8 9 8v10H3z" /><path d="M9 21v-6h6v6" /></>,
  car: <><path d="m5 17-1 3M19 17l1 3M5 17h14l-1-7H6z" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  gift: <><path d="M20 12v10H4V12M2 7h20v5H2zM12 7v15" /><path d="M12 7H7a2.5 2.5 0 1 1 2.5-3.5zM12 7h5a2.5 2.5 0 1 0-2.5-3.5z" /></>,
  health: <path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11ZM8 12h8M12 8v8" />,
  groceries: <><path d="M4 5h2l2 11h10l2-8H7" /><circle cx="10" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>,
  shopping: <><path d="M5 8h14l-1 13H6z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
  transport: <><path d="m5 10 2-6h10l2 6M5 10h14a2 2 0 0 1 2 2v6H3v-6a2 2 0 0 1 2-2ZM5 18v3M19 18v3M7 14h.01M17 14h.01" /></>,
  salary: <><path d="m9 7-3-4h12l-3 4M9 7c-8 7-7 14 3 14s11-7 3-14Z" /><path d="M14 11h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3M12 10v8" /></>,
  savings: <><path d="M4 8h16v12H4z" /><path d="M7 8V5h10v3M8 14h8" /></>,
  bills: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  education: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v7" /></>,
  pets: <><circle cx="12" cy="14" r="4" /><circle cx="7" cy="8" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="17" cy="8" r="1.5" /></>,
  entertainment: <><rect x="3" y="6" width="18" height="12" rx="3" /><path d="M8 12h4M10 10v4M16 11h.01M18 13h.01" /></>,
  coffee: <><path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM17 10h2a2 2 0 0 1 0 4h-2" /><path d="M8 4v2M12 4v2" /></>,
  phone: <rect x="7" y="2" width="10" height="20" rx="2" />,
  utilities: <><path d="M12 2v20M4 12h16" /><circle cx="12" cy="12" r="6" /></>,
  music: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
}

const aliases: Record<string, keyof typeof paths> = {
  travel: 'car', clothing: 'gift', beauty: 'health', family: 'home', business: 'tag', freelance: 'tag', investments: 'gift', bonus: 'gift', cash: 'tag', bank: 'home', card: 'tag', insurance: 'health', tax: 'tag', charity: 'gift', fitness: 'health', games: 'gift', book: 'home', other: 'tag', wallet: 'tag',
}

export default function CategoryIcon({ name, image, label, className = '' }: Props) {
  const tone = name === 'food' ? 'category-tone-food' : ['salary', 'gasoline', 'fuel', 'savings'].includes(name) ? 'category-tone-mint' : ''
  return <svg className={`category-icon ${tone} ${image ? 'category-icon-image' : ''} ${className}`} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {image ? <image href={image} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid slice" /> : paths[name === 'fuel' ? 'gasoline' : name === 'cash' ? 'wallet' : name] ?? paths[aliases[name] ?? 'tag']}
  </svg>
}
