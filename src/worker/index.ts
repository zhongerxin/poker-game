import { createMcpHandler } from "agents/mcp";
import { routeAgentRequest } from "agents";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PokerDO, loadGame, saveGame } from "./PokerDO";
import { env } from "cloudflare:workers";



const getWidgetHtml = async (path: string) => {
  console.log(path);
  const html = await (await env.ASSETS.fetch(`http://localhost/client/${path}.html`)).text();
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


// 应该给一个整局游戏标一个 id，然后再给这一手牌标一个 id，这个 id 是一个递增的整数
// Button 当前轮游戏的庄家
type Button = "hero" | "ai";


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
}

// Stage 游戏阶段，flop 是发三张公牌，turn 是发第四张公牌，river 是发第五张公牌
const STAGES = ["flop", "turn", "river"] as const;

// 下面这些内容，其实主要是为了定义好，免得重复写的
const TABLE_CONFIG_WIDGET_URI = "ui://widget/tableConfig.html";
const START_HAND_WIDGET_URI = "ui://widget/table.html";


const TABLE_CONFIG_WIDGET = {
  id: "tableConfig.widget",
  title: "选择筹码池",
  invoking: "正在选择筹码池…",
  invoked: "筹码池已选择",
} as const;

const START_HAND_WIDGET = {
  id: "start_hand.widget",
  title: "开始一手德州扑克",
  invoking: "正在开始一手德州扑克…",
  invoked: "德州扑克已开始",
} as const;

const BOARD_WIDGET = {
  id: "board.widget",
  title: "公牌",
  invoking: "正在发公牌…",
  invoked: "公牌已发完",
} as const;

const SHUTDOWN_WIDGET = {
  id: "shutdown.widget",
  title: "摊牌",
  invoking: "准备摊牌",
  invoked: "已摊牌",
} as const;

const TABLE_CONFIG_WIDGET_META = {
  "openai/outputTemplate": TABLE_CONFIG_WIDGET_URI,
  "openai/toolInvocation/invoking": TABLE_CONFIG_WIDGET.invoking, 
  "openai/toolInvocation/invoked": TABLE_CONFIG_WIDGET.invoked,
  "openai/widgetAccessible": true,
  "openai/resultCanProduceWidget": true,
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
  "tableConfig.widget",
  "ui://widget/tableConfig.html",
  {
    title: "选择筹码池",
    description: "选择筹码池 Widget 的 HTML 模板。",
  },
  async () => {
    return {
      contents: [
        {
          uri: "ui://widget/tableConfig.html",
          mimeType: "text/html+skybridge",
          text: "<div>选择筹码池</div>",
          _meta: {
            "openai/widgetPrefersBorder": true,
          }
        }
      ]
    };
  }
);

server.registerResource(
  "table.widget",
  "ui://widget/table.html",
  {
    title: "发牌",
    description: "开始一手德州扑克 Widget 的 HTML 模板。",
  },
      async () => {
        return {
          contents: [
            {
              uri: "ui://widget/table.html",
              mimeType: "text/html+skybridge",
              text: await getWidgetHtml("table"),
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

function randomButton(): Button {
  return randomInt(2) === 0 ? "hero" : "ai";
}

server.registerTool(
  "poker.choose_chip",
  {
    title: "选择筹码池",
    description: "创建一局新的德州牌桌，生成 game_id 并让用户先选筹码额度，用户选好筹码额度后，会返回当前牌局的 game_id 和用户选的筹码额度。注意如果当前对话历史中已经创建过牌桌，那开始新的一手牌只需要用之前的 game_id 调用 start_hand 即可。当然如果用户要求全新的一局牌桌再使用本工具生成一个新的 game_id。",
    annotations: { readOnlyHint: true },
    _meta: {
      ...TABLE_CONFIG_WIDGET_META,
    },
  },
  async () => {
    const id = crypto.randomUUID();
    const g: GameState = {
      id,
      deck:[],
      board: [],
      hero: {},
      ai: {},
    };
    await saveGame(g);
    return {
      content: [
        {
          type: "text",
          text: "新一局新的德州牌桌已开始，等待用户选择大盲（bb）和小盲（sb）的盲注额度，以及双方的总筹码额度(chip_stack)。",
        },
      ],
      structuredContent: {
        game_id: g.id,
        text: "新一局新的德州牌桌已开始，等待用户选择大盲（bb）和小盲（sb）的盲注额度，以及双方的总筹码额度(chip_stack)。",
      },
      _meta: {
        ...TABLE_CONFIG_WIDGET_META,
      },
    };
  }
)


server.registerTool(
  "poker.start_hand",
  {
    title: "开始一手德州扑克",
    description: "为当前牌局洗牌并发双方底牌，会返回 AI 底牌和用户的底牌（用户底牌模型不可见），在请求时带上当前牌局的大盲（bb）和小盲（sb）的盲注，以及用户双方的剩余总筹码(chip_stack)，并随机选择玩家或者 AI 作为庄家（button）。",
    annotations: { readOnlyHint: true },
    _meta: {
      ...START_HAND_WIDGET_META,
    },
    inputSchema: {
      game_id: z.string().describe("这局牌的id，需要传入才知道剩下的牌如何发"),
      bb: z.number().describe("大盲（bb）的盲注额度"),
      sb: z.number().describe("小盲（sb）的盲注额度"),
      stack: z.number().describe("双方各自当前的筹码额度(chip_stack)"),
    }
  },
  async ({ game_id, bb, sb, stack }) => {
    const deck = makeDeck();
    shuffle(deck);
    const button = randomButton()
    // 根据谁是庄家，以及 bb,sb 数额计算下当前的 pot 和用户以及ai 的stack
    const pot = bb + sb;
    const heroStack = button === "hero" ? stack - bb : stack - sb;
    const aiStack = button === "ai" ? stack - bb : stack - sb;

    const g: GameState = {
      id: game_id,
      deck,
      board: [],
      hero: { hole: [deck.pop()!, deck.pop()!], stack: heroStack },
      ai: { hole: [deck.pop()!, deck.pop()!], stack: aiStack },
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
          text: `德州扑克已完成发牌,你现在仅能看到自己的牌，你的不能将自己的牌透露给用户，当前庄家是 ${g.button === "hero" ? "用户" : "AI"}。` +
            `请根据双人游戏规则，庄家是小盲已经下注${ g.sb },大盲也同时已经下注${ g.bb }。当前 pot 是 ${g.pot}` +
            `支付完盲注后，用户当前筹码是 ${g.hero.stack}，AI 当前筹码是 ${g.ai.stack}。`+
            `game_id 是这局牌的id，后续请求 deal 时需要传入这个id`+
            `现在是翻牌前，因此是庄家先行动，除了已经下好的盲注，庄家可以决定 Call / Raise / Fold，如果玩家是庄家引导玩家行动，如果你是庄家直接选择好行动，通过对话告诉玩家你的行动`+
            `通过对话，当双方的本轮下注相等，且按规则不能增加后，你就直接开始调用 发公牌 工具，开始翻牌后阶段`+
            `如果有人选择 fold ，你就直接开始调用 摊牌 工具，开始摊牌`,
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
      },
      _meta: {
        ...START_HAND_WIDGET_META,
        hero_hole,
      },
    };
  }
)


server.registerTool(
  "poker.deal",
  {
    title: "发公牌",
    description: "为当前牌局发公牌，会返回当前牌局的 board，以及当前 pot，用户以及 AI 的 stack。在请求时带上当前牌局的 game_id，发牌的阶段，以及当前等筹后玩家的下注额度（如果都是过牌，bet 为 0）。",
    annotations: { readOnlyHint: true },
    _meta: {
      ...BOARD_WIDGET_META,
    },
    inputSchema: {
      stage: z.enum(STAGES).describe("要发牌的阶段，可选 flop/turn/river"),
      game_id: z.string().describe("这局牌的id，需要传入才知道剩下的牌如何发"),
      bet: z.number().describe("当前下注等筹后玩家上轮下注额度，如果都是过牌，bet 为 0"),
    }
  },
  async ({ stage, game_id, bet }) => {

    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`未找到牌局 ${game_id}`);
    }
    const board = g.board;
    const hero_hole = g.hero.hole!;

    switch (stage) {
      case "flop": {
        if (board.length !== 0) {
          throw new Error("翻牌已发。");
        }
        const flop = [g.deck.pop()!, g.deck.pop()!, g.deck.pop()!];
        board.push(...flop);
        g.pot! += 2*bet;
        g.hero.stack! -= bet;
        g.ai.stack! -= bet;
        await saveGame(g);
        return {
          content: [{ type: "text", text: `Flop 已发：${board.join(" ")}`+
          `当前双方各下注${bet}，当前 pot 是 ${g.pot}` +
          `用户当前筹码是 ${g.hero.stack}，AI 当前筹码是 ${g.ai.stack}`+
          `现在是翻牌后，因此是大盲（当前非庄家那个）先行动，大盲可以先决定 Call / Raise / Fold，如果玩家是大盲引导玩家行动，如果你是大盲直接选择好行动，通过对话告诉玩家你的行动`+
          `通过对话，当双方的本轮下注相等，且按规则不能增加后，你就直接开始调用 发公牌 工具，开始下一轮发牌`+
          `如果有人选择 fold ，你就直接开始调用 摊牌 工具，开始摊牌分析牌局信息`
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
          },
          _meta: {
            ...BOARD_WIDGET_META,
            board,
            hero_hole,
            pot: g.pot,
            ai_stack: g.ai.stack,
            hero_stack: g.hero.stack,
          },
        };
      }
      case "turn": {
        if (board.length !== 3) {
          throw new Error("请先发翻牌。");
        }
        const turn = g.deck.pop()!;
        board.push(turn);
        g.pot! += 2*bet;
        g.hero.stack! -= bet;
        g.ai.stack! -= bet;
        await saveGame(g);
        return {
          content: [{ type: "text", text: `Turn 已发：${board.join(" ")}`+
          `当前双方各下注${bet}，当前 pot 是 ${g.pot}` +
          `用户当前筹码是 ${g.hero.stack}，AI 当前筹码是 ${g.ai.stack}`+
          `现在是翻牌后，因此是大盲（当前非庄家那个）先行动，大盲可以先决定 Call / Raise / Fold，如果玩家是大盲引导玩家行动，如果你是大盲直接选择好行动，通过对话告诉玩家你的行动`+
          `通过对话，当双方的本轮下注相等，且按规则不能增加后，你就直接开始调用 发公牌 工具，开始下一轮发牌`+
          `如果有人选择 fold ，你就直接开始调用 摊牌 工具，开始摊牌分析牌局信息`
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
          },
          _meta: {
            ...BOARD_WIDGET_META,
            board,
            hero_hole,
            pot: g.pot,
            ai_stack: g.ai.stack,
            hero_stack: g.hero.stack,
          },
        };
      }
      case "river": {
        if (board.length !== 4) {
          throw new Error("请先发转牌。");
        }
        const river = g.deck.pop()!;
        board.push(river);
        g.pot! += 2*bet;
        g.hero.stack! -= bet;
        g.ai.stack! -= bet;
        await saveGame(g);
        return {
          content: [{ type: "text", text: `River 已发：${board.join(" ")}`+
          `当前双方各下注${bet}，当前 pot 是 ${g.pot}` +
          `用户当前筹码是 ${g.hero.stack}，AI 当前筹码是 ${g.ai.stack}`+
          `现在是翻牌后，因此是大盲（当前非庄家那个）先行动，大盲可以先决定 Call / Raise / Fold，如果玩家是大盲引导玩家行动，如果你是大盲直接选择好行动，通过对话告诉玩家你的行动`+
          `通过对话，当双方的本轮下注相等，且按规则不能增加后，你就直接开始调用 摊牌 工具，开始摊牌分析牌局信息`+
          `如果有人选择 fold ，你就直接开始调用 摊牌 工具，开始摊牌分析牌局信息`
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
          },
          _meta: {
            ...BOARD_WIDGET_META,
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
  "poker.shutdown",
  {
    title: "摊牌",
    description: "进行最后的摊牌,分析牌局信息，计算输赢并更新筹码",
    annotations: { readOnlyHint: true },
    _meta: {
      ...SHUTDOWN_WIDGET_META,
    },
    inputSchema: {
      game_id: z.string().describe("这局牌的id，需要传入才知道应该怎样摊牌"),
      bet: z.number().describe("当前下注等筹后玩家摊牌前，river 轮下注额度，如果都是过牌，bet 为 0，如果是 fold bet 为 0"),
    }
  },
  async ({ game_id, bet }) => {
    const g = await loadGame(game_id);
    if (!g) {
      throw new Error(`未找到牌局 ${game_id}`);
    }
    const board = g.board;
    const ai_hole = g.ai.hole!;
    const hero_hole = g.hero.hole!;
    g.pot! += 2 * bet;
    g.hero.stack! -= bet;
    g.ai.stack! -= bet;
    await saveGame(g);
    return {
      content: [
        {
          type: "text",
          text: `已摊牌，最终公牌：${board.join(" ")}，AI：${ai_hole.join(" ")}，用户：${hero_hole.join(" ")}，当前 pot：${g.pot}，上轮下注${bet}后，用户剩余筹码：${g.hero.stack}，AI 剩余筹码：${g.ai.stack}`+
          `请根据最终的牌面结果，宣布胜者并更新双方的剩余筹码，然后再分析一下整个牌局，同时根据最终更新的双方剩余筹码，判断是否需要引导用户继续开始发牌或结束牌局`+
          `如果有一方的筹码为 0，你就直接结束牌局，宣布另一方为最终胜者，并引导用户是否要重新选择筹码池，开始全新的一轮牌局`
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
      },
      _meta: {
        ...SHUTDOWN_WIDGET_META,
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

export {PokerDO}
