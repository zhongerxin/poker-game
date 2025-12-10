import React from 'react';

type CardProps = { value: string };

const formatRank = (v: string) => {
    const rank = v.slice(1);
    return rank === 'T' ? '10' : rank;
};

const Card: React.FC<CardProps> = ({ value }) => {
    const isBack = value === '??';
    const suit = isBack ? '' : value[0];
    const rank = isBack ? '' : formatRank(value);
    const isRed = suit === '♦' || suit === '♥';

    return (
        <div className="w-16 h-22 rounded-xl overflow-hidden shadow-[-4px_4px_12px_rgba(0,0,0,0.2)] bg-white p-1.5 z-10">
            {isBack ? (
                <div className="h-full overflow-hidden relative w-full bg-white rounded-lg">
                    <svg className="absolute inset-0 h-full w-full text-[#F13939]" aria-hidden>
                        <defs>
                            <pattern
                                id="diag-stripes"
                                width="3.5"
                                height="3.5"
                                x="0"
                                y="2.8"
                                patternUnits="userSpaceOnUse"
                                patternTransform="rotate(45)"
                            >
                                <rect width="2" height="2" fill="currentColor" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#diag-stripes)" />
                    </svg>
                </div>
            ) : (
                <div
                        className={`h-full w-full relative ${isRed ? 'text-[#F13939]' : 'text-slate-900'
                        }`}
                >
                        <span className="leading-none absolute top-1.5 left-1.5 text-2xl font-semibold">{rank}</span>
                        <span className="text-2xl leading-none absolute bottom-1.5 left-1.5">{suit}</span>
                </div>
            )}
        </div>
    );
};

export default Card;
