import { useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button"
import { useToolResponseMetadata, useDisplayMode } from './hooks/useOpenAi';
import { Maximize2 } from "lucide-react"
import Card from './components/Card';
import { HeroHand, AiHand }  from './components/Hand';





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

	// 三档心情：筹码占比低于 40% 为愤怒，40%–60% 为中性，达到 60% 为小丑。
	const moodTier = useMemo<0 | 1 | 2>(() => {
		const ai = Number(ai_stack) || 0;
		const hero = Number(hero_stack) || 0;
		const total = ai + hero;
		const ratio = total > 0 ? ai / total : 0.5; // 防 0，默认中性
		if (ratio < 0.4) return 0;
		if (ratio < 0.6) return 1;
		return 2;
	}, [ai_stack, hero_stack]);


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
		<div className="flex min-h-svh flex-col items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] p-4">
			<div className="py-8 gap-6 items-center justify-center flex-col flex">
				<AiHand aiStack={ai_stack} aiHole={ai_hole} showHole={Boolean(meta?.ai_hole)} moodTier={moodTier} />
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
				<HeroHand heroStack={hero_stack} heroHole={hero_hole} />
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
		</div>
	);
}
export default Table
