import { createMcpHandler } from "agents/mcp";
import { routeAgentRequest } from "agents";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PokerDO, loadGame, saveGame } from "./PokerDO";
import { env } from "cloudflare:workers";
import { toolDescriptions, contentRsp } from "./prompt";



const getWidgetHtml = async (widget: string) => {
  let html = await (await env.ASSETS.fetch('http://localhost')).text();
  html = html.replace(
    '<script type="module"',
    `<script>window.__WIDGET_DEFAULT__="${widget}"</script><script type="module"`
  );
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


// 应该给一个整局游戏标一个 id，然后再给这一手牌标一个 id，这个 id 是一个递增的整数
// Button 当前轮游戏的庄家
export type Button = "hero" | "ai";
// Stage 游戏阶段，flop 是发三张公牌，turn 是发第四张公牌，river 是发第五张公牌
export type Stage = "preflop" | "afterflop" | "turn" | "river" | "showdown";

// PlayerState 玩家状态，AI 的和用户的状态都包含在这个接口中
interface PlayerState {
  hole?: [Card, Card];
  folded?: boolean;
  stack?: number;
}

// 当前游戏的状态，deck 是牌组，board 是公牌，hero 是用户的状态，ai 是 AI 的状态
export interface GameState {
  id: string;
  deck: Card[];
  board: Card[];
  hero: PlayerState;
  ai: PlayerState;
  pot?: number;
  sb?: number;
  bb?: number;
  button?: Button;
  stage?: Stage;
}

// 下面这些内容，其实主要是为了定义好，免得重复写的
const TABLE_CONFIG_WIDGET = {
  id: "tableConfig.widget",
  uri: "ui://widget/tableConfig.html",
  title: "New Game Setup",
  description: "Before starting a Texas Hold'em hand, set the stack and blinds first",
  invoking: "Preparing...",
  invoked: "Please make a selection",
} as const;

const TABLE_WIDGET = {
  id: "table.widget",
  uri: "ui://widget/table.html",
  title: "Poker Table",
  description: "The poker table representing the ongoing game; also used during showdown",
  invoking: "Preparing...",
  invoked: "Dealing completed",
} as const;


// CSP 域名相关
const WIDGET_DOMAIN = "https://poker-api.jiqiren.ai" as const;

const WIDGET_CSP = {
  connect_domains: [
    "https://poker-api.jiqiren.ai",
    "https://chatgpt.com",
  ],
  resource_domains: [
    "https://poker-api.jiqiren.ai",
    "https://*.oaistatic.com",
    "https://*.githubusercontent.com",
  ],
  redirect_domains: [],
  frame_domains: [],
} as const;

const TABLE_CONFIG_WIDGET_META = {
  "openai/outputTemplate": TABLE_CONFIG_WIDGET.uri,
  "openai/toolInvocation/invoking": TABLE_CONFIG_WIDGET.invoking,
  "openai/toolInvocation/invoked": TABLE_CONFIG_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": true,
  "openai/widgetDomain": WIDGET_DOMAIN,
  "openai/widgetCSP": WIDGET_CSP,
} as const;

const TABLE_WIDGET_META = {
  "openai/outputTemplate": TABLE_WIDGET.uri,
  "openai/toolInvocation/invoking": TABLE_WIDGET.invoking,
  "openai/toolInvocation/invoked": TABLE_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": true,
  "openai/widgetDomain": WIDGET_DOMAIN,
  "openai/widgetCSP": WIDGET_CSP,
} as const;

// ------------------ 注册资源 ------------------

server.registerResource(
  TABLE_CONFIG_WIDGET.id,
  TABLE_CONFIG_WIDGET.uri,
  {
    title: TABLE_CONFIG_WIDGET.title,
    description: TABLE_CONFIG_WIDGET.description,
  },
  async () => {
    return {
      contents: [
        {
          uri: TABLE_CONFIG_WIDGET.uri,
          mimeType: "text/html+skybridge",
          text: await getWidgetHtml("start"),
          _meta: {
            "openai/widgetPrefersBorder": true,
            "openai/widgetDomain": WIDGET_DOMAIN,
            "openai/widgetCSP": WIDGET_CSP,
          }
        }
      ]
    };
  }
);

server.registerResource(
  TABLE_WIDGET.id,
  TABLE_WIDGET.uri,
  {
    title: TABLE_WIDGET.title,
    description: TABLE_WIDGET.description,
  },
  async () => {
    return {
      contents: [
        {
          uri: TABLE_WIDGET.uri,
          mimeType: "text/html+skybridge",
          text: await getWidgetHtml("table"),
          _meta: {
            "openai/widgetPrefersBorder": true,
            "openai/widgetDomain": WIDGET_DOMAIN,
            "openai/widgetCSP": WIDGET_CSP,
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

function randomButton(): Button {
  return randomInt(2) === 0 ? "hero" : "ai";
}

// ------------------ 注册工具 ------------------

server.registerTool(
  "poker.tableConfig",
  {
    title: "New Game Setup",
    description: toolDescriptions.tableConfig,
    annotations: { readOnlyHint: true },
    _meta: {
      ...TABLE_CONFIG_WIDGET_META,
    },
  },
  async () => {
    const id = crypto.randomUUID();
    const g: GameState = {
      id,
      deck: [],
      board: [],
      hero: {},
      ai: {},
      stage: "preflop",
    };
    await saveGame(g);
    return {
      content: [
        {
          type: "text",
          text: "A new Texas Hold'em table has started; waiting for the user to choose the big blind (bb), small blind (sb), and total chip stack for both sides.",
        },
      ],
      structuredContent: {
        game_id: g.id,
        text: "A new Texas Hold'em table has started; waiting for the user to choose the big blind (bb), small blind (sb), and total chip stack for both sides.",
      },
      _meta: {
        ...TABLE_CONFIG_WIDGET_META,
      },
    };
  }
)


server.registerTool(
  "poker.preflop",
  {
    title: "Start a New Texas Hold'em Hand",
    description: toolDescriptions.preflop,
    annotations: { readOnlyHint: true },
    _meta: {
      ...TABLE_WIDGET_META,
    },
    inputSchema: {
      game_id: z.string().describe("ID of this hand; required so the system knows how to deal the remaining cards"),
      bb: z.number().describe("Big blind (bb) amount"),
      sb: z.number().describe("Small blind (sb) amount"),
      hero_stack: z.number().describe("For the first hand, set the user's stack based on the chip_stack chosen in “New Game Setup”; for later hands, set it to the user's updated stack after applying wins/losses from the previous round—ai_stack and hero_stack will differ after each round"),
      ai_stack: z.number().describe("For the first hand, set the AI stack based on the chip_stack chosen in “New Game Setup”; for later hands, set it to the AI's updated stack after applying wins/losses from the previous round—ai_stack and hero_stack will differ after each round"),
    }
  },
  async ({ game_id, bb, sb, hero_stack, ai_stack }) => {
    const deck = makeDeck();
    shuffle(deck);
    const button = randomButton()
    // 根据谁是庄家，以及 bb,sb 数额计算下当前的 pot 和用户以及ai 的stack
    const pot = bb + sb;
    const new_hero_stack = button === "hero" ? hero_stack - sb : hero_stack - bb;
    const new_ai_stack = button === "ai" ? ai_stack - sb : ai_stack - bb;

    const g: GameState = {
      id: game_id,
      deck,
      board: [],
      hero: { hole: [deck.pop()!, deck.pop()!], stack: new_hero_stack },
      ai: { hole: [deck.pop()!, deck.pop()!], stack: new_ai_stack },
      bb,
      sb,
      button: button,
      pot,
    };
    const hero_hole = g.hero.hole!;
    await saveGame(g);
    return {
      content: [
        {
          type: "text",
          text: contentRsp.preflop({ button, sb, bb, pot, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, game_id: g.id }),
        },
      ],
      structuredContent: {
        ai: g.ai,
        hero_stack: g.hero.stack,
        game_id: g.id,
        bb: g.bb,
        sb: g.sb,
        pot: g.pot,
        button: g.button,
        statusText: contentRsp.preflop({ button, sb, bb, pot, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, game_id: g.id }),
      },
      _meta: {
        ...TABLE_WIDGET_META, 
        hero_hole,
        pot,
        hero_stack: g.hero.stack,
        ai_stack: g.ai.stack,
      },
    };
  }
)


server.registerTool(
  "poker.afterflop",
  {
    title: "Deal Community Cards",
    description: toolDescriptions.afterflop,
    annotations: { readOnlyHint: true },
    _meta: {
      ...TABLE_WIDGET_META,
    },
    inputSchema: {
      stage: z.enum(["afterflop", "turn", "river"]).describe("Stage to deal cards; choose afterflop/turn/river"), 
      game_id: z.string().describe("ID of this hand; required so the system knows how to deal the remaining cards"),
      bet: z.number().describe("When the hand reaches afterflop/turn/river, the user and AI must agree on a matched bet size. Enter the final matched amount per side (one-sided value since both equal). The poker.afterflop tool uses this bet via “pot += 2 * bet” to update the pot and “stack -= bet” to deduct remaining stacks for both AI and user. Use 0 for a check."),
    }
  },
  async ({ stage, game_id, bet }) => {
    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`Game ${game_id} not found`);
    }
    const board = g.board;
    const hero_hole = g.hero.hole!;

    // 如果已经发过同一阶段的牌，再次调用时直接返回当前状态，避免重复发牌报错
    const alreadyDealt =
      (stage === "afterflop" && board.length >= 3) ||
      (stage === "turn" && board.length >= 4) ||
      (stage === "river" && board.length >= 5);

    switch (stage) {
      case "afterflop": {

        // 如果还没有发过翻牌，就发翻牌
        if (!alreadyDealt) {
          const afterflop= [g.deck.pop()!, g.deck.pop()!, g.deck.pop()!];
          board.push(...afterflop);
          g.pot! += 2 * bet;
          g.hero.stack! -= bet;
          g.ai.stack! -= bet;
          g.stage = stage;
          await saveGame(g);
        }
        return {
          content: [{
            type: "text", text: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          }],
          structuredContent: {
            game_id: game_id,
            stage,
            board,
            ai: g.ai,
            hero_stack: g.hero.stack,
            bb: g.bb,
            sb: g.sb,
            pot: g.pot,
            button: g.button,
            statusText: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          },
          _meta: {
            ...TABLE_WIDGET_META,
            board,
            hero_hole,
            pot: g.pot,
            ai_stack: g.ai.stack,
            hero_stack: g.hero.stack,
          },
        };
      }
      case "turn": {
        // 如果还没有发过转牌，就发转牌
        if (!alreadyDealt) {
          const turn = g.deck.pop()!;
          board.push(turn);
          g.pot! += 2 * bet;
          g.hero.stack! -= bet;
          g.ai.stack! -= bet;
          g.stage = stage;
          await saveGame(g);
        }
        return {
          content: [{
            type: "text", text: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          }],
          structuredContent: {
            game_id: game_id,
            stage,
            board,
            ai: g.ai,
            hero_stack: g.hero.stack,
            bb: g.bb,
            sb: g.sb,
            pot: g.pot,
            button: g.button,
            statusText: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          },
          _meta: {
            ...TABLE_WIDGET_META,
            board,
            hero_hole,
            pot: g.pot,
            ai_stack: g.ai.stack,
            hero_stack: g.hero.stack,
          },
        };
      }
      case "river": {
        // 如果还没有发过河牌，就发河牌
        if (!alreadyDealt) {
          const river = g.deck.pop()!;
          board.push(river);
          g.pot! += 2 * bet;
          g.hero.stack! -= bet;
          g.ai.stack! -= bet;
          g.stage = stage;
          await saveGame(g);
        }
        return {
          content: [{
            type: "text", text: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          }],
          structuredContent: {
            game_id: game_id,
            stage,
            board,
            ai: g.ai,
            hero_stack: g.hero.stack,
            bb: g.bb,
            sb: g.sb,
            pot: g.pot,
            button: g.button,
            statusText: contentRsp.afterflop({ stage, board, bet, pot: g.pot as number, heroStack: g.hero.stack as number, aiStack: g.ai.stack as number, button: g.button as Button }),
          },
          _meta: {
            ...TABLE_WIDGET_META,
            board,
            hero_hole,
            pot: g.pot,
            ai_stack: g.ai.stack,
            hero_stack: g.hero.stack,
          },
        };
      }
    }
  }
)

server.registerTool(
  "poker.showdown",
  {
    title: "Showdown",
    description: toolDescriptions.showdown,
    annotations: { readOnlyHint: true },
    _meta: {
      ...TABLE_WIDGET_META,
    },
    inputSchema: {
      game_id: z.string().describe("ID of this hand; required so the system knows how to resolve the showdown"),
      bet: z.number().describe("Before entering showdown, the user and AI must agree on a matched bet size; enter the final matched amount per side (one-sided value since both equal). The poker.showdown tool applies this bet via “pot += 2 * bet” to update the pot and “stack -= bet” to deduct remaining stacks for AI and user. Use 0 for a check."),
      is_fold: z.boolean().describe("Whether the hand reaches showdown because a player or the AI folded; pass true if so, otherwise false"),
    }
  },
  async ({ game_id, bet, is_fold }) => {
    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`Game ${game_id} not found`);
    }
    const board = g.board;
    const ai_hole = g.ai.hole!;
    const hero_hole = g.hero.hole!;
    // 如果因为有人弃牌进入摊牌，且公牌未满 5 张，则补足剩余公牌再摊牌
    if (is_fold && board.length < 5) {
      const need = 5 - board.length;
      for (let i = 0; i < need; i++) {
        const card = g.deck.pop();
        if (!card) throw new Error("Deck exhausted; unable to complete community cards.");
        board.push(card);
      }
    }
    // 检查牌局是否已经摊牌了,如果已经摊牌了,就不能再重新计算一次了
    if (g.stage !== "showdown") {
      g.pot! += 2 * bet;
      g.hero.stack! -= bet;
      g.ai.stack! -= bet;
      g.stage = "showdown";
      await saveGame(g);
    }
    return {
      content: [
        {
          type: "text",
          text: contentRsp.showdown({ board, ai_hole, hero_hole, bet, pot: g.pot as number, aiStack: g.ai.stack as number, heroStack: g.hero.stack as number }),
        },
      ],
      structuredContent: {
        board,
        ai_hole,
        hero_hole,
        pot: g.pot,
        ai_stack: g.ai.stack,
        hero_stack: g.hero.stack,
        bb: g.bb,
        sb: g.sb,
        button: g.button,
        statusText: contentRsp.showdown({ board, ai_hole, hero_hole, bet, pot: g.pot as number, aiStack: g.ai.stack as number, heroStack: g.hero.stack as number }),
      },
      _meta: {
        ...TABLE_WIDGET_META,
        board,
        ai_hole,
        hero_hole,
        pot: g.pot,
        ai_stack: g.ai.stack,
        hero_stack: g.hero.stack,
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

export { PokerDO }
