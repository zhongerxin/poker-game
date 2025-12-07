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



function App() {
	const meta = useToolResponseMetadata();
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式

	const hole = useMemo(() => {
		const heroHole = Array.isArray(meta?.heroHole) ? meta!.heroHole : ['??', '??'];
		return [String(heroHole[0] ?? '??'), String(heroHole[1] ?? '??')] as const;
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
		<div className="flex min-h-svh flex-col items-center justify-center bg-green-800">
			<div className="flex items-center justify-center">
				{hole.join(' ')}
			</div>
			<Button onClick={toggleDisplayMode}>Switch {displayMode === 'inline' ? 'PIP' : 'Inline'}</Button>
		</div>
	);
}

export default App;
