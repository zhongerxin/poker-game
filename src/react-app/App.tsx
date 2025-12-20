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
const view = (injected ?? params.get('widget') ?? 'start').toLowerCase();
const Widget = view === 'table' ? Start : Table;


createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Widget />
	</StrictMode>,
);
