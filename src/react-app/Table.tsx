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

	// 计算心情等级（0-4），0 表示完全输，4 表示完全赢, 中等档位是当 AI 筹码占比 ratio 满足 0.4 ≤ ratio < 0.6 时返回 2
	const moodTier = useMemo(() => {
		const ai = Number(ai_stack) || 0;
		const hero = Number(hero_stack) || 0;
		const total = ai + hero;
		const ratio = total > 0 ? ai / total : 0.5; // 防 0，默认中性
		if (ratio < 0.2) return 0;
		if (ratio < 0.4) return 1;
		if (ratio < 0.6) return 2;
		if (ratio < 0.8) return 3;
		return 4;
	}, [ai_stack, hero_stack]);


	const toggleDisplayMode = useCallback(async () => {
		const api = window.openai;
		if (!api?.requestDisplayMode || !displayMode) {
			console.warn('当前环境不支持切换 fullscreen/inline');
			return;
		}
		const next = displayMode === 'inline' ? 'fullscreen' : 'inline';
		try {
			const { mode } = await api.requestDisplayMode({ mode: next });
			// 不需要手动 setState，宿主更新后会派发 set_globals，useDisplayMode 会自动刷新
			console.log('切换结果：', mode);
		} catch (err) {
			console.error('切换 widget 形态失败：', err);
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
