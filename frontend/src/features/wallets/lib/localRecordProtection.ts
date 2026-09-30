export function keepsLocalRecord(
  record: { version?: unknown; localStatus?: unknown } | undefined,
  serverVersion: string,
  protectedRecordIds: Set<string>,
  recordId: string,
): boolean {
  if (!record) return false

  if (protectedRecordIds.has(recordId) || record.localStatus === 'pending' || record.localStatus === 'sending' || record.localStatus === 'error') {
    return true
  }

  if (typeof record.version !== 'string' || !/^\d+$/.test(record.version) || !/^\d+$/.test(serverVersion)) {
    return false
  }

  return BigInt(record.version) > BigInt(serverVersion)
}
