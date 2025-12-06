import { GameState } from "./index";
import { pokerNamespace } from "./index";

//storage
// 为单局牌生成对应 DO 实例的 stub，不做本地缓存，依赖 idFromName 保证同名命中同一实例
function getPokerStub(gameId: string) {
  if (!pokerNamespace) throw new Error("POKER Durable Object 未初始化");
  const pokerStub = pokerNamespace.get(pokerNamespace.idFromName(gameId));
  return pokerStub;
}

export async function loadGame(gameId: string): Promise<GameState | null> {
  // 通过 DO 实例读取持久化的牌局状态，404 表示不存在
  const res = await getPokerStub(gameId).fetch(`https://poker/game?id=${gameId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`加载牌局失败: ${res.statusText}`);

  const game = (await res.json()) as GameState;
  return game;
}

export async function saveGame(game: GameState) {
  // 将牌局状态写入对应的 DO 存储
  const res = await getPokerStub(game.id).fetch("https://poker/game", {
    method: "POST",
    body: JSON.stringify(game),
  });
  if (!res.ok) throw new Error(`保存牌局失败: ${res.statusText}`);
}

export async function deleteGame(gameId: string) {
  // 删除 DO 存储中的该局数据，不销毁实例
  await getPokerStub(gameId).fetch(`https://poker/game?id=${gameId}`, { method: "DELETE" });
}

export class PokerDO {
  constructor(private state: DurableObjectState) {}

  async fetch(req: Request) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      if (!id) return new Response("missing id", { status: 400 });
      const game = await this.state.storage.get<GameState>(id);
      if (!game) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(game), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const game = (await req.json()) as GameState;
      await this.state.storage.put(game.id, game);
      return new Response(null, { status: 204 });
    }

    if (req.method === "DELETE") {
      if (!id) return new Response("missing id", { status: 400 });
      await this.state.storage.delete(id);
      return new Response(null, { status: 204 });
    }

    return new Response("method not allowed", { status: 405 });
  }
}
