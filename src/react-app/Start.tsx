import { useCallback, useState } from 'react';
import './index.css';
import { Button } from '@/components/ui/button';
import { useDisplayMode } from './hooks/useOpenAi';
import { Maximize2, ArrowRight } from 'lucide-react';
import { SuitFan } from './components/SuitFan';
import memojiYen from './assets/memoji-yen-banknote.png';
import memojiDollar from './assets/memoji-dollar-banknote.png';
import memojiEuro from './assets/memoji-euro-banknote.png';


const options = [
	{ id: '200', chip: '200', bb_sb: 'BB 10 / SB 5', payload: { bb: 10, sb: 5, stack: 200 }, img_src: memojiYen },
	{ id: '500', chip: '500', bb_sb: 'BB 10 / SB 5', payload: { bb: 10, sb: 5, stack: 500 }, img_src: memojiDollar },		
	{ id: '1000', chip: '1000', bb_sb: 'BB 10 / SB 5', payload: { bb: 10, sb: 5, stack: 1000 }, img_src: memojiEuro },
];


function Start() {
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式
	const [sendingId, setSendingId] = useState<string | null>(null);

	const sendSelection = useCallback(async (id: string) => {
		const api = window.openai;
		if (!api?.sendFollowUpMessage) {
			console.warn('Follow-up messages are not supported in this environment');
			return;
		}
		const selected = options.find((item) => item.id === id);
		if (!selected) return;
		setSendingId(id);
		try {
			await api.sendFollowUpMessage({
				prompt: `Selected table setup: BB/SB ${selected.payload.bb}/${selected.payload.sb}, total stack ${selected.payload.stack}. Please start dealing by calling poker.preflop with this configuration.`,
			});
			console.log('Sent table configuration', selected.payload);
		} catch (err) {
			console.error('Failed to send table configuration:', err);
		} finally {
			setSendingId(null);
		}
	}, []);

	const toggleDisplayMode = useCallback(async () => {
		const api = window.openai;
		if (!api?.requestDisplayMode || !displayMode) {
			console.warn('Fullscreen/inline toggle is not supported in this environment');
			return;
		}
		const next = displayMode === 'inline' ? 'fullscreen' : 'inline';
		try {
			const { mode } = await api.requestDisplayMode({ mode: next });
			// 不需要手动 setState，宿主更新后会派发 set_globals，useDisplayMode 会自动刷新
			console.log('Toggle result:', mode);
		} catch (err) {
			console.error('Failed to toggle widget mode:', err);
		}
	}, [displayMode]);

	return (
		
		<div className="relative flex min-h-svh flex-col items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] p-6 text-white">
			<div className="py-8 gap-4 items-center justify-center flex-col flex">
				<div className="text-center items-center flex flex-col mb-2">
					<SuitFan />
				</div>
				<div className="grid w-72 gap-4">
					{options.map((item) => {
						//处理下img上下没居中问题
						const isSpecial = item.id === '200' || item.id === '1000';
						return (
							<Button
								key={item.id}
								className={`flex items-center justify-start bg-black/20 rounded-full hover:bg-black/35 transition-colors text-white h-16`}
								onClick={() => sendSelection(item.id)}
								disabled={!!sendingId}
							>	
								<img
									className={`w-11 h-11 ml-2 ${isSpecial ? 'mb-1.5' : ''}`}
									src={item.img_src}
									alt="Chip"
								/>
								<div className='flex flex-col items-start ml-2'>
									<span className="text-white text-lg font-bold leading-tight" >{item.chip}</span>
									<span className="text-white text-xs opacity-70" >{item.bb_sb}</span>
								</div>
								<ArrowRight className="h-6 w-6 ml-auto mr-2.5" />
							</Button>
					)})}
				</div>
				<span className="text-xs opacity-70 max-w-64 text-center leading-relaxed">Choose a chip, or just tell ChatGPT directly.</span>
			</div>
			{displayMode !== 'fullscreen' && (
				<Button
					variant="ghost"
					className="absolute top-4 right-4 rounded-full text-white"
					size="icon"
					onClick={toggleDisplayMode}
				>
					<Maximize2 className="h-8 w-8" />
				</Button>
			)}
		</div>
	);
}
export default Start
