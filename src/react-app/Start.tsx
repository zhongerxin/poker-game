import { useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button"
import { useToolResponseMetadata, useDisplayMode } from './hooks/useOpenAi';
import { PictureInPicture2 } from "lucide-react"
import Card from './Card';



function Start() {
	const meta = useToolResponseMetadata();
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式

	const board = useMemo(() => {
		const raw = Array.isArray(meta?.board) ? meta.board.slice(0, 5) : [];
		return Array.from({ length: 5 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);

	const hero = useMemo(() => {
		const raw = Array.isArray(meta?.hero) ? meta.hero.slice(0, 2) : [];
		return Array.from({ length: 2 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);

	const ai = useMemo(() => {
		const raw = Array.isArray(meta?.ai) ? meta.ai.slice(0, 2) : [];
		return Array.from({ length: 2 }, (_, i) => String(raw[i] ?? '??'));
	}, [meta]);


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
		<div className="flex min-h-svh flex-col gap-6 items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] rounded-[24px] p-4">
			<div className="flex items-center justify-center -space-x-5">
				{ai.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-3">
				{board.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-5">
				{hero.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-3">
				{board.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-5">
				{hero.map((v, i) => <Card key={i} value={v} />)}
			</div>
			<Button variant="ghost" className="absolute top-6 right-6 rounded-full text-white" size="icon" onClick={toggleDisplayMode}>
				<PictureInPicture2 className="h-6 w-6" />
			</Button>
		</div>
	);
}
export default Start
