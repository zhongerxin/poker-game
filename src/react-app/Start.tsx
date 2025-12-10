import { useCallback, useState } from 'react';
import './index.css';
import { Button } from '@/components/ui/button';
import { useDisplayMode } from './hooks/useOpenAi';
import { PictureInPicture2 } from 'lucide-react';

const options = [
	{ id: '200', label: 'BB/SB 10/5 · 总筹码 200', payload: { bb: 10, sb: 5, stack: 200 } },
	{ id: '500', label: 'BB/SB 10/5 · 总筹码 500', payload: { bb: 10, sb: 5, stack: 500 } },
	{ id: '1000', label: 'BB/SB 10/5 · 总筹码 1000', payload: { bb: 10, sb: 5, stack: 1000 } },
];


function Start() {
	const displayMode = useDisplayMode(); // 实时反映宿主当前模式
	const [sendingId, setSendingId] = useState<string | null>(null);

	const sendSelection = useCallback(async (id: string) => {
		const api = window.openai;
		if (!api?.sendFollowUpMessage) {
			console.warn('当前环境不支持发送 follow-up 消息');
			return;
		}
		const selected = options.find((item) => item.id === id);
		if (!selected) return;
		setSendingId(id);
		try {
			await api.sendFollowUpMessage({
				prompt: `选择牌局设置：BB/SB ${selected.payload.bb}/${selected.payload.sb}，总筹码 ${selected.payload.stack}`,
			});
			console.log('已发送牌局配置', selected.payload);
		} catch (err) {
			console.error('发送牌局配置失败：', err);
		} finally {
			setSendingId(null);
		}
	}, []);

	const toggleDisplayMode = useCallback(async () => {
		const api = window.openai;
		if (!api?.requestDisplayMode || !displayMode) {
			console.warn('当前环境不支持切换 pip/inline');
			return;
		}
		const next = displayMode === 'inline' ? 'pip' : 'inline';
		try {
			const { mode } = await api.requestDisplayMode({ mode: next });
			console.log('切换结果：', mode);
		} catch (err) {
			console.error('切换 widget 形态失败：', err);
		}
	}, [displayMode]);

	return (
		<div className="relative flex min-h-svh flex-col gap-6 items-center justify-center bg-green-800 border-2 border-green-900 shadow-[inset_0_0px_100px_rgba(0,0,0,0.2)] rounded-[24px] p-6 text-white">
			<div className="text-center space-y-2">
				<h1 className="text-2xl font-semibold">请选择牌局</h1>
				<p className="text-sm opacity-80">你也可以直接和 AI 对话说明你想要的盲注和筹码</p>
			</div>
			<div className="grid w-full max-w-md gap-3">
				{options.map((item) => (
					<Button
						key={item.id}
						variant="secondary"
						size="lg"
						className="justify-between bg-green-900 rounded-full hover:bg-green-600 text-white "
						onClick={() => sendSelection(item.id)}
						disabled={!!sendingId}
					>
						<span>{item.label}</span>
						{sendingId === item.id ? <span className="text-xs opacity-80">发送中…</span> : <span className="text-xs opacity-60"> </span>}
					</Button>
				))}
			</div>
			<Button variant="ghost" className="absolute top-6 right-6 rounded-full text-white" size="icon" onClick={toggleDisplayMode}>
				<PictureInPicture2 className="h-6 w-6" />
			</Button>
		</div>
	);
}
export default Start
