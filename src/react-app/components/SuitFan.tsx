import memojiClub from '../assets/memoji-club-suit.png';
import memojiHeart from '../assets/memoji-heart-suit.png';
import memojiDiamond from '../assets/memoji-diamond-suit.png';
import memojiSpade from '../assets/memoji-spade-suit.png';
export function SuitFan() {
    return (
        <div className="flex items-center justify-center -space-x-12 pb-7 ml-2">
            {/* card 1 */}
            <div
                style={{ transform: 'rotate(-36deg)' }}
                className="mt-3.5 transform origin-bottom w-16 h-22 rounded-xl overflow-hidden shadow-[-4px_4px_12px_rgba(0,0,0,0.2)] bg-white p-1 z-10"
            >
                <div className="h-full overflow-hidden bg-white relative w-full rounded-lg flex items-center justify-center">
                    <img className="w-8 h-8" src={memojiClub} alt="Club Suit" />
                </div>
            </div>
            {/* card 2 */}
            <div
                style={{ transform: 'rotate(-12deg)' }}
                className="transform origin-bottom w-16 h-22 rounded-xl overflow-hidden shadow-[-4px_4px_12px_rgba(0,0,0,0.2)] bg-white p-1 z-10"
            >
                <div className="h-full overflow-hidden bg-white relative w-full rounded-lg flex items-center justify-center">
                    <img className="w-8 h-8" src={memojiHeart} alt="Heart Suit" />
                </div>
            </div>
            {/* card 3 */}
            <div
                style={{ transform: 'rotate(12deg)' }}
                className="transform origin-bottom w-16 h-22 rounded-xl overflow-hidden shadow-[-4px_4px_12px_rgba(0,0,0,0.2)] bg-white p-1 z-10"
            >
                <div className="h-full overflow-hidden bg-white relative w-full rounded-lg flex items-center justify-center">
                    <img className="w-8 h-8" src={memojiDiamond} alt="Diamond Suit" />
                </div>
            </div>
            {/* card 4 */}
            <div
                style={{ transform: 'rotate(36deg)' }}
                className="mt-3.5 transform origin-bottom w-16 h-22 rounded-xl overflow-hidden shadow-[-4px_4px_12px_rgba(0,0,0,0.2)] bg-white p-1 z-10"
            >
                <div className="h-full overflow-hidden bg-white relative w-full rounded-lg flex items-center justify-center">
                    <img className="w-8 h-8" src={memojiSpade} alt="Spade Suit" />
                </div>
            </div>
        </div>
    );
}
