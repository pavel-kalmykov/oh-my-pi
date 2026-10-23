/** ANSI SGR renderer: turns escape-laden monospace rows into styled spans. */
import type { ReactNode } from "react";

interface SgrState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	inverse: boolean;
	fg: string | null;
	bg: string | null;
}

const BASE_PALETTE = [
	"#000000",
	"#cd3131",
	"#0dbc79",
	"#e5e510",
	"#2472c8",
	"#bc3fbc",
	"#11a8cd",
	"#e5e5e5",
];
const BRIGHT_PALETTE = [
	"#666666",
	"#f14c4c",
	"#23d18b",
	"#f5f543",
	"#3b8eea",
	"#d670d6",
	"#29b8db",
	"#ffffff",
];

const ANSI_RE = /\x1b\[([0-9;?]*)([ -/]*[@-~])/g;

function colorFromCodes(codes: number[], offset: number): { color: string | null; next: number } {
	const mode = codes[offset];
	if (mode === 2 && offset + 3 < codes.length) {
		const [r, g, b] = [codes[offset + 1]!, codes[offset + 2]!, codes[offset + 3]!];
		return { color: `rgb(${r}, ${g}, ${b})`, next: offset + 4 };
	}
	if (mode === 5 && offset + 1 < codes.length) {
		const n = codes[offset + 1]!;
		if (n < 16) {
			const palette = n < 8 ? BASE_PALETTE : BRIGHT_PALETTE;
			return { color: palette[n % 8]!, next: offset + 2 };
		}
		if (n < 232) {
			const v = n - 16;
			const step = (channel: number): number => {
				const level = channel === 0 ? 0 : 55 + channel * 40;
				return Math.min(255, level);
			};
			return { color: `rgb(${step((v / 36) | 0)}, ${step(((v / 6) | 0) % 6)}, ${step(v % 6)})`, next: offset + 2 };
		}
		const gray = 8 + (n - 232) * 10;
		return { color: `rgb(${gray}, ${gray}, ${gray})`, next: offset + 2 };
	}
	return { color: null, next: offset + 1 };
}

function applySgr(state: SgrState, codes: number[]): SgrState {
	const next: SgrState = { ...state };
	let i = 0;
	while (i < codes.length) {
		const code = codes[i]!;
		if (code === 0) {
			next.bold = false;
			next.italic = false;
			next.underline = false;
			next.inverse = false;
			next.fg = null;
			next.bg = null;
		} else if (code === 1) next.bold = true;
		else if (code === 22) next.bold = false;
		else if (code === 3) next.italic = true;
		else if (code === 23) next.italic = false;
		else if (code === 4) next.underline = true;
		else if (code === 24) next.underline = false;
		else if (code === 7) next.inverse = true;
		else if (code === 27) next.inverse = false;
		else if (code === 39) next.fg = null;
		else if (code === 49) next.bg = null;
		else if (code >= 30 && code <= 37) next.fg = BASE_PALETTE[code - 30]!;
		else if (code >= 40 && code <= 47) next.bg = BASE_PALETTE[code - 40]!;
		else if (code >= 90 && code <= 97) next.fg = BRIGHT_PALETTE[code - 90]!;
		else if (code >= 100 && code <= 107) next.bg = BRIGHT_PALETTE[code - 100]!;
		else if (code === 38) {
			const { color, next: consumed } = colorFromCodes(codes, i + 1);
			if (color) next.fg = color;
			i = consumed - 1;
		} else if (code === 48) {
			const { color, next: consumed } = colorFromCodes(codes, i + 1);
			if (color) next.bg = color;
			i = consumed - 1;
		}
		i += 1;
	}
	return next;
}

function styleFor(state: SgrState): React.CSSProperties | undefined {
	const fg = state.inverse ? state.bg : state.fg;
	const bg = state.inverse ? state.fg : state.bg;
	const style: React.CSSProperties = {};
	if (fg) style.color = fg;
	if (bg) style.backgroundColor = bg;
	if (state.bold) style.fontWeight = 700;
	if (state.italic) style.fontStyle = "italic";
	if (state.underline) style.textDecoration = "underline";
	return Object.keys(style).length > 0 ? style : undefined;
}

/** Renders one ANSI-bearing row as styled spans inside a fragment. */
export function renderAnsiRow(row: string): ReactNode {
	const spans: ReactNode[] = [];
	let state: SgrState = { bold: false, italic: false, underline: false, inverse: false, fg: null, bg: null };
	let plain = "";
	let key = 0;
	const flush = (): void => {
		if (plain.length > 0) {
			spans.push(
				<span key={key++} style={styleFor(state)}>
					{plain}
				</span>,
			);
			plain = "";
		}
	};
	let cursor = 0;
	for (const match of row.matchAll(ANSI_RE)) {
		const at = match.index ?? 0;
		plain += row.slice(cursor, at);
		cursor = at + match[0].length;
		if (match[2] === "m") {
			flush();
			const codes = match[1]!
				.split(";")
				.map(part => (part === "" ? 0 : Number.parseInt(part, 10)))
				.filter(part => Number.isFinite(part));
			state = applySgr(state, codes.length > 0 ? codes : [0]);
		}
	}
	plain += row.slice(cursor);
	flush();
	return spans.length === 1 ? spans[0] : <>{spans}</>;
}
