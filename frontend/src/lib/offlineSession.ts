const lastVerifiedUserKey = 'money-tracker-last-verified-user'

export function rememberVerifiedUser(userId: string): void {
  localStorage.setItem(lastVerifiedUserKey, userId)
}

export function getLastVerifiedUser(): string | null {
  return localStorage.getItem(lastVerifiedUserKey)
}

export function clearVerifiedUser(): void {
  localStorage.removeItem(lastVerifiedUserKey)
}
