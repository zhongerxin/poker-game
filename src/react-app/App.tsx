// src/App.tsx

// import { useState } from "react";
// import reactLogo from "./assets/react.svg";
// import viteLogo from "./assets/vite.svg";
// import cloudflareLogo from "./assets/Cloudflare_Logo.svg";
// import honoLogo from "./assets/hono.svg";

import { useMemo, useCallback } from 'react';
import "./App.css";
import { Button } from "@/components/ui/button"
import { useToolResponseMetadata, useDisplayMode } from './hooks/useOpenAi';
import { PictureInPicture2 } from "lucide-react"
import Card from './Card';



function App() {
	const meta = useToolResponseMetadata();
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式

	const hero = useMemo(() => {
		console.log('hero', meta?.hero);
		const hero = Array.isArray(meta?.hero) ? meta!.hero : [];
		return [String(hero[0] ?? '??'), String(hero[1] ?? '??')] as const;
	}, [meta]);

	const ai = useMemo(() => {
		console.log('ai', meta?.ai);
		const ai = Array.isArray(meta?.ai) ? meta!.ai : [];
		return [String(ai[0] ?? '??'), String(ai[1] ?? '??')] as const;
	}, [meta]);

	const board = useMemo(() => {
		console.log('board', meta?.board);
		const board = Array.isArray(meta?.board) ? meta!.board : [];
		return [String(board[0] ?? '??'), String(board[1] ?? '??'), String(board[2] ?? '??'), String(board[3] ?? '??'), String(board[4] ?? '??')] as const;
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
		<div className="flex min-h-svh flex-col gap-6 items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] rounded-[32px] p-4">
			<div className="flex items-center justify-center -space-x-5">
				{ai.map((v) => <Card key={v} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-3">
				{board.map((v) => <Card key={v} value={v} />)}
			</div>
			<div className="flex items-center justify-center -space-x-5">
				{hero.map((v) => <Card key={v} value={v} />)}
			</div>
			<Button variant="ghost" className="absolute top-6 right-6 rounded-full text-white" size="icon" onClick={toggleDisplayMode}>
				<PictureInPicture2 className="h-6 w-6" />
			</Button>
		</div>
	);
}

export default App;
