import { useId } from 'react';

import {
	LAKES,
	MAP_CENTER,
	MILE,
	STATE_HIGHWAYS,
	TOWNS,
	US_HIGHWAYS,
} from '@/components/home-map-data';

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 740;
const OUTER_RADIUS = 25 * MILE;
const INNER_RADIUS = 10 * MILE;

/** Label placement per town: text anchor plus offsets from the town dot. */
const LABELS: Record<
	string,
	{ anchor: 'start' | 'middle' | 'end'; dx: number; dy: number }
> = {
	Stephenville: { anchor: 'start', dx: 12, dy: -2 },
	Hico: { anchor: 'middle', dx: 0, dy: -12 },
	Comanche: { anchor: 'middle', dx: 0, dy: 24 },
	'De Leon': { anchor: 'middle', dx: 0, dy: -12 },
	Gorman: { anchor: 'middle', dx: 0, dy: 24 },
	Gustine: { anchor: 'middle', dx: 0, dy: 24 },
	Proctor: { anchor: 'start', dx: 11, dy: 18 },
};

const HALO =
	'[paint-order:stroke] stroke-muted stroke-[4px] [stroke-linejoin:round]';

/**
 * Stylized marketing map: roughly a 25 mile radius around Dublin, TX 76446,
 * with the Irishette pin at the center. Geometry is simplified OpenStreetMap
 * data (see home-map-data.ts), drawn with the site's theme colors.
 */
export function HomeMap({ className }: { className?: string }) {
	const uid = useId();
	const clipId = `${uid}-clip`;
	const glowId = `${uid}-glow`;
	const dotsId = `${uid}-dots`;
	const { x: cx, y: cy } = MAP_CENTER;

	return (
		<svg
			viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- inline SVG, cannot be an <img>
			role="img"
			aria-labelledby={`${uid}-title ${uid}-desc`}
			className={className}
		>
			<title id={`${uid}-title`}>
				Map of the area within 25 miles of Irishette in Dublin, Texas
			</title>
			<desc id={`${uid}-desc`}>
				Irishette sits in the center in Dublin, Texas. Stephenville, home of
				Tarleton State University, is about 12 miles northeast. De Leon, Proctor
				and Proctor Lake lie to the west and southwest, Hico to the east, and
				Comanche, Gustine and Gorman at the edges of the 25 mile circle.
			</desc>

			<defs>
				<clipPath id={clipId}>
					<circle cx={cx} cy={cy} r={OUTER_RADIUS} />
				</clipPath>
				<radialGradient id={glowId}>
					<stop offset="0" style={{ stopColor: 'var(--secondary)' }} />
					<stop
						offset="1"
						style={{ stopColor: 'var(--muted)', stopOpacity: 0 }}
					/>
				</radialGradient>
				<pattern
					id={dotsId}
					width="14"
					height="14"
					patternUnits="userSpaceOnUse"
				>
					<circle cx="2" cy="2" r="0.9" className="fill-primary/20" />
				</pattern>
			</defs>

			{/* Outer decorative ring */}
			<circle
				cx={cx}
				cy={cy}
				r={OUTER_RADIUS + 10}
				className="fill-none stroke-primary/30"
				strokeWidth="1.5"
			/>

			{/* Land */}
			<circle
				cx={cx}
				cy={cy}
				r={OUTER_RADIUS}
				className="fill-muted stroke-primary/50"
				strokeWidth="2"
			/>

			<g clipPath={`url(#${clipId})`}>
				<circle cx={cx} cy={cy} r={OUTER_RADIUS} fill={`url(#${dotsId})`} />
				<circle cx={cx} cy={cy} r={OUTER_RADIUS} fill={`url(#${glowId})`} />

				{/* Lakes */}
				{LAKES.map((lake) => (
					<path
						key={lake.name}
						d={lake.d}
						fillRule="evenodd"
						className="fill-sky-300 stroke-sky-500/70"
						strokeWidth="1"
						strokeLinejoin="round"
					>
						<title>{lake.name}</title>
					</path>
				))}

				{/* Highways: casing first, then the colored line on top */}
				<g className="fill-none" strokeLinecap="round" strokeLinejoin="round">
					<path d={STATE_HIGHWAYS} className="stroke-muted" strokeWidth="4.5" />
					<path d={US_HIGHWAYS} className="stroke-muted" strokeWidth="6.5" />
					<path
						d={STATE_HIGHWAYS}
						className="stroke-amber-300"
						strokeWidth="2.2"
					/>
					<path
						d={US_HIGHWAYS}
						className="stroke-amber-400"
						strokeWidth="3.6"
					/>
				</g>

				{/* 10 mile ring */}
				<circle
					cx={cx}
					cy={cy}
					r={INNER_RADIUS}
					className="fill-none stroke-primary/60"
					strokeWidth="1.5"
					strokeDasharray="3 6"
					strokeLinecap="round"
				/>

				{/* Nearby towns */}
				{TOWNS.filter((t) => t.name !== 'Dublin').map((town) => {
					const label = LABELS[town.name];
					return (
						<g key={town.name}>
							<title>{`${town.name}, about ${Math.round(town.miles)} miles`}</title>
							<circle
								cx={town.x}
								cy={town.y}
								r={4.5}
								className="fill-foreground stroke-muted"
								strokeWidth="2"
							/>
							<text
								x={town.x + label.dx}
								y={town.y + label.dy}
								textAnchor={label.anchor}
								className={`fill-foreground text-[19px] font-semibold ${HALO}`}
							>
								{town.name}
							</text>
							{town.name === 'Stephenville' && (
								<text
									x={town.x + label.dx}
									y={town.y + label.dy + 16}
									textAnchor={label.anchor}
									className={`fill-muted-foreground text-[14px] italic ${HALO}`}
								>
									Tarleton State University
								</text>
							)}
						</g>
					);
				})}

				<text
					x={235}
					y={428}
					textAnchor="middle"
					className="fill-sky-700 stroke-muted/80 stroke-[3px] text-[14px] italic [paint-order:stroke]"
				>
					Proctor Lake
				</text>
			</g>

			{/* Ring labels */}
			<g className="text-[13px] font-bold tracking-widest">
				<rect
					x={cx - 38}
					y={cy - OUTER_RADIUS - 11}
					width="76"
					height="22"
					rx="11"
					className="fill-primary"
				/>
				<text
					x={cx}
					y={cy - OUTER_RADIUS + 4}
					textAnchor="middle"
					className="fill-primary-foreground"
				>
					25 MILES
				</text>
				<text
					x={cx}
					y={cy - INNER_RADIUS - 6}
					textAnchor="middle"
					className={`fill-primary ${HALO}`}
				>
					10 MI
				</text>
			</g>

			{/* Irishette pin */}
			<g transform={`translate(${cx} ${cy})`}>
				<ellipse cx="0" cy="1" rx="11" ry="4" className="fill-foreground/30" />
				<circle
					r="14"
					className="origin-center fill-accent/40 [transform-box:fill-box] motion-safe:animate-ping"
				/>
				<path
					d="M0 0C-5-9-17-19-17-31a17 17 0 0 1 34 0C17-19 5-9 0 0Z"
					className="fill-accent stroke-foreground"
					strokeWidth="2"
					strokeLinejoin="round"
				/>
				<circle cy="-31" r="6.5" className="fill-background" />

				<rect
					x="-92"
					y="-102"
					width="184"
					height="52"
					rx="26"
					className="fill-primary stroke-background"
					strokeWidth="3"
				/>
				<text
					y="-64"
					textAnchor="middle"
					className="fill-primary-foreground font-fleur text-[42px]"
				>
					Irishette
				</text>
				<text
					y="26"
					textAnchor="middle"
					className={`fill-foreground text-[16px] font-semibold ${HALO}`}
				>
					Dublin, TX 76446
				</text>
			</g>

			{/* Compass */}
			<g transform="translate(700 62)" className="text-[13px] font-bold">
				<circle r="24" className="fill-background stroke-primary/40" />
				<path d="M0-18L6 4L0 0L-6 4Z" className="fill-primary" />
				<text
					y="18"
					textAnchor="middle"
					className="fill-foreground text-[11px]"
				>
					N
				</text>
			</g>
		</svg>
	);
}
