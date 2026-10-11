export function priorityRank(priority: string): number {
  return ({ P1: 1, P2: 2, P3: 3, P4: 4 } as Record<string, number>)[priority] ?? 99
}
export function isClosedStatus(status: string): boolean {
  return status === 'RESOLVED' || status === 'REJECTED'
}
