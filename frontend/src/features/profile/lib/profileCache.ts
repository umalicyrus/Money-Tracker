export type CachedProfile = {
  name: string
  phone: string | null
  email: string
  hasPhoto: boolean
}

function key(userId: string): string {
  return `money-tracker-profile-${userId}`
}

export function readCachedProfile(userId: string): CachedProfile | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(userId)) ?? 'null')
    if (
      typeof value === 'object' && value !== null &&
      typeof (value as CachedProfile).name === 'string' &&
      typeof (value as CachedProfile).email === 'string'
    ) {
      return value as CachedProfile
    }
  } catch {
    // A malformed optional display cache should never block the app.
  }

  return null
}

export function cacheProfile(userId: string, profile: CachedProfile): void {
  localStorage.setItem(key(userId), JSON.stringify(profile))
}
