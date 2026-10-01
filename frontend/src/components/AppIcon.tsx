import type { SVGProps } from 'react'

type IconName = 'home' | 'wallet' | 'wallets' | 'brand' | 'transactions' | 'more' | 'bank' | 'savings' | 'card' | 'eye' | 'eye-off' | 'plus' | 'edit' | 'trash' | 'more-vertical' | 'person' | 'mail' | 'lock' | 'arrow-right'
export default function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const wallet = <><path d="M4 7V5a2 2 0 0 1 1.6-2L17 1.5V7M20 12V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" /><path d="M21 12h-5a2 2 0 0 0 0 4h5zM17 14h.01" /></>
  const paths = {
    home: <><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" /></>,
    wallet, wallets: wallet, brand: wallet,
    transactions: <path d="M8 3v17M4 7l4-4 4 4M16 21V4M12 17l4 4 4-4" />,
    more: <><circle cx="5" cy="12" r=".8" /><circle cx="12" cy="12" r=".8" /><circle cx="19" cy="12" r=".8" /></>,
    bank: <path d="m3 8 9-5 9 5H3Zm2 3v8m5-8v8m4-8v8m5-8v8M3 21h18" />,
    savings: <><path d="m12 3 3 3 4 1 1 4-2 4-4 2-4-1-3 2-1-5-3-3 3-3 1-4 5-1Z" /><path d="M10 9h4" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    'eye-off': <><path d="m3 3 18 18M10 5h2c6 0 10 7 10 7a23 23 0 0 1-3 4M6 6a25 25 0 0 0-4 6s4 7 10 7c2 0 4-.7 5-1.5M10 10a3 3 0 0 0 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z" /></>,
    trash: <><path d="M4 7h16M10 4h4m-8 3 1 14h10l1-14M10 11v6m4-6v6" /></>,
    'more-vertical': <><circle cx="12" cy="5" r=".8" /><circle cx="12" cy="12" r=".8" /><circle cx="12" cy="19" r=".8" /></>,
    person: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    lock: <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M7 10V7a5 5 0 0 1 10 0v3" /></>,
    'arrow-right': <path d="M4 12h16m-7-7 7 7-7 7" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}
