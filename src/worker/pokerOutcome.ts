// Compare the best five-card hand out of seven. No hole cards are sent to GA4.
function rankFive(cards: string[]): number[] {
  const ranks = cards.map(card => '23456789TJQKA'.indexOf(card[1]) + 2).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card[0] === cards[0][0]);
  const unique = [...new Set(ranks)];
  const straight = unique.length === 5
    ? (unique[0] - unique[4] === 4 ? unique[0] : unique.join() === '14,5,4,3,2' ? 5 : 0) : 0;
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, ...groups.map(g => g[0])];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...groups.map(g => g[0])];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, ...groups.map(g => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.map(g => g[0])];
  if (groups[0][1] === 2) return [1, ...groups.map(g => g[0])];
  return [0, ...ranks];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function best(cards: string[]): number[] {
  let result: number[] = [];
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const rank = rankFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compare(rank, result) > 0) result = rank;
          }
  return result;
}

export function determineWinner(hero: string[], ai: string[], board: string[]): 'hero' | 'ai' | 'tie' {
  const cards = [...hero, ...ai, ...board];
  if (hero.length !== 2 || ai.length !== 2 || board.length !== 5 || new Set(cards).size !== 9 ||
      cards.some(card => !/^[♦♠♥♣][2-9TJQKA]$/.test(card))) throw new Error('Invalid showdown cards');
  const result = compare(best([...hero, ...board]), best([...ai, ...board]));
  return result > 0 ? 'hero' : result < 0 ? 'ai' : 'tie';
}
