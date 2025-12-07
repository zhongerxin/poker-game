// src/App.tsx

// import { useState } from "react";
// import reactLogo from "./assets/react.svg";
// import viteLogo from "./assets/vite.svg";
// import cloudflareLogo from "./assets/Cloudflare_Logo.svg";
// import honoLogo from "./assets/hono.svg";

import { useState, useCallback, useEffect } from 'react';
import "./App.css";
import { Button } from "@/components/ui/button"


function App() {
	const [hole, setHole] = useState<[string, string]>(['??', '??']);

	const syncHole = useCallback(() => {
		const meta = window.openai?.toolResponseMetadata ?? {};
		const heroHole = Array.isArray(meta.heroHole) ? meta.heroHole : ['??', '??'];
		setHole([String(heroHole[0] ?? '??'), String(heroHole[1] ?? '??')]);
	}, []);

	useEffect(() => {
		// 监听 openai:set_globals，等待宿主推送更新
		const handler = () => syncHole();
		window.addEventListener('openai:set_globals', handler);
		return () => window.removeEventListener('openai:set_globals', handler);
	}, [syncHole]);

	const [displayMode, setDisplayMode] = useState<'inline' | 'pip'>('inline');
	const toggleDisplayMode = useCallback(async () => {
		const api = window.openai;
		if (!api?.requestDisplayMode) {
			console.warn('当前环境不支持切换 pip/inline');
			return;
		}
		const next = displayMode === 'inline' ? 'pip' : 'inline';
		try {
			await api.requestDisplayMode({ mode: next });
			setDisplayMode(next);
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
