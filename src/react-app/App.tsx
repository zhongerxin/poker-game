import { StrictMode } from 'react';
import "./index.css";
import Table from './Table';
import Start from './Start';
import { createRoot } from "react-dom/client";


interface Window {
	__WIDGET_DEFAULT__?: string;
}

const injected = (globalThis as Window).__WIDGET_DEFAULT__;
const params = new URLSearchParams(location.search);


// 记住上次本地选择
const saved = localStorage.getItem('widget_view');

// 开发模式下，没有明确指定时默认看 table；有查询参数时同时写回 localStorage
const preferred =
	params.get('widget') ??
	saved ??
	(import.meta.env.DEV ? 'table' : undefined);

// const view = (injected ?? params.get('widget') ?? 'start').toLowerCase();
const view = (injected ?? preferred ?? 'start').toLowerCase();


if (params.get('widget')) {
	localStorage.setItem('widget_view', view);
}

const Widget = view === 'table' ? Table : Start ;


createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Widget />
	</StrictMode>,
);
