import { createMcpHandler } from "agents/mcp";
import { routeAgentRequest } from "agents";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// import startHandHtml from "./widget/start_hand.html";
// import boardHtml from "./widget/board.html";
// import shutdownHtml from "./widget/shutdown.html";
import { z } from "zod";
import { PokerDO, loadGame, saveGame } from "./PokerDO";
import { env } from "cloudflare:workers";



const getWidgetHtml = async (path: string) => {
  const html = await (await env.ASSETS.fetch(`http://localhost/${path}`)).text();
//   html = html.replace(
//     "<!--RUNTIME_CONFIG-->",
//     `<script>window.HOST = \`${host}\`;</script>`
//   );
  return html;
};

const server = new McpServer({ name: "Poker", version: "v1.0.0" });
// Worker 入口传入的 env，需要包含 Wrangler 绑定的 POKER_DO DO 命名空间
type DurableEnv = Env & { POKER_DO: DurableObjectNamespace };

// 模块级保存 DO 命名空间，fetch 入口会赋值，后续构造 stub 时使用
export let pokerNamespace: DurableObjectNamespace | undefined;


// 德州扑克相关类型定义
// Suit 花色
const SUITS: Suit[] = ["♦", "♠", "♥", "♣"];
type Suit = "♦" | "♠" | "♥" | "♣";

// Rank 牌值
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
// Rank 这个取值代表牌面的牌值，例如 "2" 到 "A"，并且只能从这个数组中取值
type Rank = (typeof RANKS)[number];

// 牌组 牌组是一个数组，每个元素都是一个字符串，例如 "♦2" 到 "♣A" ，并且德州是没有大小王的
type Card = `${Suit}${Rank}`;


// PlayerState 玩家状态，AI 的和用户的状态都包含在这个接口中
interface PlayerState {
  hole?: [Card, Card];
  folded?: boolean;
}

// 当前游戏的状态，deck 是牌组，board 是公牌，hero 是用户的状态，ai 是 AI 的状态
export interface GameState {
  id: string;
  deck: Card[];
  board: Card[];
  hero: PlayerState;
  ai: PlayerState;
}

// Stage 游戏阶段，flop 是发三张公牌，turn 是发第四张公牌，river 是发第五张公牌
const STAGES = ["flop", "turn", "river"] as const;

// 下面这些内容，其实主要是为了定义好，免得重复写的
const START_HAND_WIDGET_URI = "ui://widget/start_hand.html";


const START_HAND_WIDGET = {
  id: "start_hand.widget",
  title: "开始一手德州扑克",
  invoking: "正在开始一手德州扑克…",
  invoked: "德州扑克已开始",
  html: "<html><body><h1>开始一手德州扑克</h1></body></html>",
} as const;

const BOARD_WIDGET = {
  id: "board.widget",
  title: "公牌",
  invoking: "正在发公牌…",
  invoked: "公牌已发完",
  html: "<html><body><h1>开始一手德州扑克</h1></body></html>",
} as const;

const SHUTDOWN_WIDGET = {
  id: "shutdown.widget",
  title: "摊牌",
  invoking: "准备摊牌",
  invoked: "已摊牌",
  html: "<html><body><h1>开始s一手德州扑克</h1></body></html>",
} as const;

const START_HAND_WIDGET_META = {
  "openai/outputTemplate": START_HAND_WIDGET_URI,
  "openai/toolInvocation/invoking": START_HAND_WIDGET.invoking,
  "openai/toolInvocation/invoked": START_HAND_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": true,
} as const;

const BOARD_WIDGET_META = {
  "openai/outputTemplate": START_HAND_WIDGET_URI,
  "openai/toolInvocation/invoking": BOARD_WIDGET.invoking,
  "openai/toolInvocation/invoked": BOARD_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": false,
} as const;

const SHUTDOWN_WIDGET_META = {
  "openai/outputTemplate": START_HAND_WIDGET_URI,
  "openai/toolInvocation/invoking": SHUTDOWN_WIDGET.invoking,
  "openai/toolInvocation/invoked": SHUTDOWN_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": false,
} as const;





server.registerResource(
  "start_hand.widget",
  "ui://widget/start_hand.html",
  {
    title: "发牌",
    description: "开始一手德州扑克 Widget 的 HTML 模板。",
  },
      async () => {
        return {
          contents: [
            {
              uri: "ui://widget/start_hand.html",
              mimeType: "text/html+skybridge",
              text: await getWidgetHtml("stage"),
              _meta: {
                "openai/widgetPrefersBorder": true,
              }
            }
          ]
        };
      }
  );




//functions
function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${s}${r}`);
    }
  }
  return deck;
}

function randomInt(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

function shuffle(deck: Card[]) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}



server.registerTool(
  "poker.start_hand",
  {
    title: "开始一手德州扑克",
    annotations: { readOnlyHint: true },
    _meta: {
      ...START_HAND_WIDGET_META,
    },
  },
  async () => {
    const id = crypto.randomUUID();
    const deck = makeDeck();
    shuffle(deck);
    const g: GameState = {
      id,
      deck,
      board: [],
      hero: { hole: [deck.pop()!, deck.pop()!] },
      ai: { hole: [deck.pop()!, deck.pop()!] },
    };
    const hero = g.hero.hole!;
    await saveGame(g);
    return {
      content: [
        {
          type: "text",
          text: "德州扑克已完成发牌,你现在仅能看到自己的牌，你的不能将自己的牌透露给用户，现在请让用户开始下注",
        },
      ],
      structuredContent: {
        ai: g.ai.hole,
        game_id: g.id,
        text: "1. 德州扑克已完成发牌 2. 你现在仅能看到 ai 这是发给你的牌，你不能将自己的牌透露给用户 3.用户的牌也已经通过 Widget 给到了用户且你不能看到 4.stateId 是这局牌的id，后续请求 deal 时需要传入这个id 5.现在请提示让用户开始下注",
      },
      _meta: {
        ...START_HAND_WIDGET_META,
        hero,
      },
    };
  }
)


server.registerTool(
  "poker.deal",
  {
    title: "发公牌",
    annotations: { readOnlyHint: true },
    _meta: {
      ...BOARD_WIDGET_META,
    },
    inputSchema: {
      stage: z.enum(STAGES).describe("要发牌的阶段，可选 flop/turn/river"),
      game_id: z.string().describe("这局牌的id，需要传入才知道剩下的牌如何发"),
    }
  },
  async ({ stage, game_id }) => {

    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`未找到牌局 ${game_id}`);
    }
    const board = g.board;
    const hero = g.hero.hole!;
    switch (stage) {
      case "flop": {
        if (board.length !== 0) {
          throw new Error("翻牌已发。");
        }
        const flop = [g.deck.pop()!, g.deck.pop()!, g.deck.pop()!];
        board.push(...flop);
        await saveGame(g);
        return {
          content: [{ type: "text", text: `Flop 已发：${board.join(" ")}` }],
          structuredContent: { game_id: game_id, stage, board, text: `Flop 已发：${board.join(" ")}` },
          _meta: {
            ...BOARD_WIDGET_META,
            board,
            hero
          },
        };
      }
      case "turn": {
        if (board.length !== 3) {
          throw new Error("请先发翻牌。");
        }
        const turn = g.deck.pop()!;
        board.push(turn);
        await saveGame(g);
        return {
          content: [{ type: "text", text: `Turn 已发：${turn}。当前公牌：${board.join(" ")}` }],
          structuredContent: { game_id: game_id, stage, board, text: `Turn 已发：${turn}。当前公牌：${board.join(" ")}` },
          _meta: {
            ...BOARD_WIDGET_META,
            board,
            hero
          },
        };
      }
      case "river": {
        if (board.length !== 4) {
          throw new Error("请先发转牌。");
        }
        const river = g.deck.pop()!;
        board.push(river);
        await saveGame(g);
        return {
          content: [{ type: "text", text: `River 已发：${river}。最终公牌：${board.join(" ")}` }],
          structuredContent: { game_id: game_id, stage, board, text: `River 已发：${river}。最终公牌：${board.join(" ")}` },
          _meta: {
            ...BOARD_WIDGET_META,
            board,
            hero
          },
        };
      }
    }
  }
)

server.registerTool(
  "poker.shutdown",
  {
    title: "摊牌",
    annotations: { readOnlyHint: true },
    _meta: {
      ...SHUTDOWN_WIDGET_META,
    },
    inputSchema: {
      game_id: z.string().describe("这局牌的id，需要传入才知道应该怎样摊牌"),
    }
  },
  async ({ game_id }) => {
    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`未找到牌局 ${game_id}`);
    }
    const board = g.board;
    const ai = g.ai.hole!;
    const hero = g.hero.hole!;
    return {
      content: [
        {
          type: "text",
          text: `已摊牌，最终公牌：${board.join(" ")}，AI：${ai.join(" ")}，用户：${hero.join(" ")}`,
        },
      ],
      structuredContent: {
        board,
        ai,
        hero,
        text: "已经进入摊牌阶段，公牌是 board，ai 拿的牌是 ai，用户拿的牌是 hero，请你通过比对公牌告诉用户谁赢了，并且计算下大家输赢后应该更新的筹码",
      },
      _meta: {
        ...SHUTDOWN_WIDGET_META,
        board,
        ai,
        hero,
      },
    };
  }
)



const mcpHandler = createMcpHandler(server);

export default {
  async fetch(req: Request, env: DurableEnv, ctx: ExecutionContext) {
    // 将当前请求的 POKER_DO 绑定保存下来，供 getPokerStub 等函数使用
    pokerNamespace = env.POKER_DO;
    const url = new URL(req.url);
    if (url.pathname.startsWith("/mcp")) return mcpHandler(req, env, ctx);

    return (
      (await routeAgentRequest(req, env)) ??
      new Response("Not found", { status: 404 })
    );
  }
};

export {PokerDO}
