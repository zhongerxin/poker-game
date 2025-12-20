import { useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button"
import { useToolResponseMetadata, useDisplayMode } from './hooks/useOpenAi';
import { PictureInPicture2 } from "lucide-react"
import Card from './Card';




function Table() {
	const meta = useToolResponseMetadata();
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式

	const board = useMemo(() => {
		const raw = Array.isArray(meta?.board) ? meta.board.slice(0, 5) : [];
		return Array.from({ length: 5 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);

	const hero_hole = useMemo(() => {
		const raw = Array.isArray(meta?.hero_hole) ? meta.hero_hole.slice(0, 2) : [];
		return Array.from({ length: 2 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);

	const ai_hole = useMemo(() => {
		const raw = Array.isArray(meta?.ai_hole) ? meta.ai_hole.slice(0, 2) : [];
		return Array.from({ length: 2 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);

	const toNumber = useCallback((value: unknown) => {
		const n = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(n) ? n : 0;
	}, []);

	const pot = useMemo(() => toNumber(meta?.pot), [meta, toNumber]);
	const ai_stack = useMemo(() => toNumber(meta?.ai_stack), [meta, toNumber]);
	const hero_stack = useMemo(() => toNumber(meta?.hero_stack), [meta, toNumber]);


	const toggleDisplayMode = useCallback(async () => {
		const api = window.openai;
		if (!api?.requestDisplayMode || !displayMode) {
			console.warn('当前环境不支持切换 pip/inline');
			return;
		}
		const next = displayMode === 'inline' ? 'pip' : 'inline';
		try {
			const { mode } = await api.requestDisplayMode({ mode: next });
			// 不需要手动 setState，宿主更新后会派发 set_globals，useDisplayMode 会自动刷新
			console.log('切换结果：', mode);
		} catch (err) {
			console.error('切换 widget 形态失败：', err);
		}
	}, [displayMode]);

	return (
		<div className="flex min-h-svh flex-col gap-6 items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] p-4">
			<div className="w-68 h-22 bg-green-900 rounded-full gap-5 items-center flex overflow-hidden">
				<div className=" items-center flex justify-center h-24 ml-5">
					<img className="w-14 h-14" src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Smiling%20Face%20with%20Horns.png" alt="Smiling Face with Horns"/>
				</div>
				{meta?.ai_hole ? (
					<div className="flex items-center justify-center -space-x-7 pt-7 ml-8">
						{ai_hole.map((v, i) => (
							<div
								key={i}
								className="transform origin-bottom"
								style={{
									transform: `rotate(${i === 0 ? -8 : 8}deg)`,
								}}
							>
								<Card value={v} />
							</div>
						))}
					</div> 
				) : (<div className=" items-center flex justify-center h-24 w-[120px] gap-1">
					<img className='w-6 h-6' src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Coin.png" alt="Coin" />
					<span
						className=" text-white font-bold max-w-[72px] min-w-[30px] text-lg text-center break-all leading-tight "
					>
						{ai_stack}
					</span>
				</div>)}
			</div>
			<div className="flex items-center justify-center -space-x-3">
				{board.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<div className=" items-right flex justify-right gap-1 w-68">
				<span
					className="w-full text-white font-bold text-m text-center break-all leading-tight "
				>
					Pot {pot}
				</span>
			</div>
			<div className="w-68 h-22 bg-green-900 rounded-full gap-6 items-center flex overflow-hidden">
				<div className=" items-center flex justify-center h-24 gap-1 ml-6">
					<img className='w-6 h-6' src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Coin.png" alt="Coin"/>
					<span
						className=" text-white font-bold max-w-[72px] min-w-[30px] text-lg text-center break-all leading-tight "
					>
						{hero_stack}
					</span>
				</div>
				<div className="flex items-center justify-center -space-x-7 pt-7">
					{hero_hole.map((v, i) => (
						<div
							key={i}
							className="transform origin-bottom"
							style={{
								transform: `rotate(${i === 0 ? -8 : 8}deg)`,
							}}
						>
							<Card value={v} />
						</div>
					))}
				</div>
			</div>
			<Button variant="ghost" className="absolute top-6 right-6 rounded-full text-white" size="icon" onClick={toggleDisplayMode}>
				<PictureInPicture2 className="h-6 w-6" />
			</Button>
		</div>
	);
}
export default Table
