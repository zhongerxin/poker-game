import { StrictMode } from 'react';
import "./index.css";
import Table from './Table';
import Start from './Start';
import { createRoot } from "react-dom/client";



const params = new URLSearchParams(location.search);
const view = (params.get('widget') || 'start').toLowerCase();
const View = view === 'table' ? Table : Start;


createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<View />
	</StrictMode>,
);
