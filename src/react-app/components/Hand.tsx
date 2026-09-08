import Card from './Card';
import memojiCoin from '../assets/memoji-coin.png';
import memojiEnraged from '../assets/memoji-enraged-face.png';
import memojiHorns from '../assets/memoji-smiling-face-with-horns.png';
import memojiClown from '../assets/memoji-clown-face.png';

type HeroHandProps = {
    heroStack: number | string;
    heroHole: string[];
};

export function HeroHand({ heroStack, heroHole }: HeroHandProps) {
    return (
        <div className="w-68 h-22 bg-green-900 rounded-full gap-0 items-center flex overflow-hidden">
            <div className="flex items-center justify-center -space-x-7 pt-7 ml-8">
                {heroHole.map((v, i) => (
                    <div
                        key={i}
                        className="transform origin-bottom"
                        style={{ transform: `rotate(${i === 0 ? -8 : 8}deg)` }}
                    >
                        <Card value={v} />
                    </div>
                ))}
            </div>
            <div className="items-center flex justify-center h-24 w-full gap-1">
                <img
                    className="w-6 h-6"
                    src={memojiCoin}
                    alt="Coin"
                />
                <span className="text-white font-bold max-w-[72px] min-w-[30px] text-lg text-center break-all leading-tight">
                   {heroStack}               
                </span>
            </div>
        </div>
    );
}

type AiHandProps = {
    aiStack: number | string;
    aiHole: string[];
    showHole: boolean; // 是否展示底牌
    moodTier: 0 | 1 | 2;
};

const faces = [
    memojiEnraged, // 0：筹码落后
    memojiHorns,   // 1：中性
    memojiClown,   // 2：筹码领先
];

export function AiHand({ aiStack, aiHole, showHole, moodTier }: AiHandProps) {
    const face = faces[moodTier] ?? faces[1];
    return (
        <div className="w-68 h-22 bg-green-900 rounded-full gap-5 items-center flex overflow-hidden">
            <div className="items-center flex justify-center h-24 ml-5">
                <img className="w-14 h-14" src={face} alt="AI face"/>
            </div>

            {showHole ? (
                <div className="flex items-center justify-center -space-x-0 pb-7 ml-2">
                    {aiHole.map((v, i) => (
                        <div
                            key={i}
                            className="transform origin-bottom"
                            style={{ transform: `rotate(${i === 0 ? 8 : -8}deg)` }}
                        >
                            <Card value={v} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="items-center flex justify-center h-24 w-[120px] gap-1">
                    <img
                        className="w-6 h-6"
                        src={memojiCoin}
                        alt="Coin"
                    />
                    <span className="text-white font-bold max-w-[72px] min-w-[30px] text-lg text-center break-all leading-tight">
                        {aiStack}
                    </span>
                </div>
            )}
        </div>
    );
}
