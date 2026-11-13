"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { IdenticonShapes } from "./identicon";

export type RingNode = {
  id: string;
  label: string;
  state: "paid" | "due" | "missed" | "idle";
  recipient?: boolean;
  received?: boolean;
  you?: boolean;
};

const SIZE = 440;
const C = SIZE / 2;
const BLUE = "#1d4ed8";
const BLACK = "#000000";
const LINE = "#d4d4d4";
const SOFT = "#525252";

function positions(n: number, radius: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: C + Math.cos(a) * radius, y: C + Math.sin(a) * radius };
  });
}

function Tick({ x, y, s = 1, color = "#fff" }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <path
      d={`M${x - 5 * s} ${y + 0.5 * s} l${3.6 * s} ${3.6 * s} l${6.6 * s} ${-7.4 * s}`}
      fill="none"
      stroke={color}
      strokeWidth={2.4 * s}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Cross({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      d={`M${x - 3.6 * s} ${y - 3.6 * s} L${x + 3.6 * s} ${y + 3.6 * s} M${x + 3.6 * s} ${y - 3.6 * s} L${x - 3.6 * s} ${y + 3.6 * s}`}
      stroke="#fff"
      strokeWidth={2.2 * s}
      strokeLinecap="round"
    />
  );
}

const STROKE: Record<RingNode["state"], { color: string; width: number }> = {
  paid: { color: BLUE, width: 2.5 },
  due: { color: BLACK, width: 1.5 },
  missed: { color: BLACK, width: 2.5 },
  idle: { color: LINE, width: 1.5 },
};

/** Live ring for a real circle: who has paid this round and who takes the pot. */
export function CircleRing({
  nodes,
  potLabel,
  potValue,
  potUnit = "MUSD",
  emptySeats = 0,
}: {
  nodes: RingNode[];
  potLabel: string;
  potValue: string;
  potUnit?: string;
  emptySeats?: number;
}) {
  const total = nodes.length + emptySeats;
  const radius = 160;
  const pts = positions(Math.max(total, 1), radius);
  const nodeR = Math.max(11, Math.min(28, 220 / Math.max(total, 1)));
  const badge = Math.max(6, nodeR * 0.34);
  const showLabels = total <= 12;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label={`${potLabel}: ${potValue} ${potUnit}`}>
      <defs>
        {nodes.map((n, i) => (
          <clipPath key={n.id} id={`node-${n.id}`}>
            <circle cx={pts[i].x} cy={pts[i].y} r={nodeR - 2} />
          </clipPath>
        ))}
      </defs>
      <circle cx={C} cy={C} r={radius} fill="none" stroke="#e5e5e5" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={82} fill="#ffffff" stroke={BLACK} strokeWidth={1.5} />
      <text x={C} y={C - 24} textAnchor="middle" fill={SOFT} fontSize={13} fontWeight={600}>
        {potLabel}
      </text>
      <text x={C} y={C + 14} textAnchor="middle" className="font-display" fill={BLACK} fontSize={potValue.length > 7 ? 26 : 34}>
        {potValue}
      </text>
      <text x={C} y={C + 35} textAnchor="middle" fill={SOFT} fontSize={12} fontWeight={600}>
        {potUnit}
      </text>

      {Array.from({ length: emptySeats }, (_, k) => {
        const p = pts[nodes.length + k];
        return <circle key={`e-${k}`} cx={p.x} cy={p.y} r={nodeR} fill="#fff" stroke={LINE} strokeWidth={1.5} strokeDasharray="3 4" />;
      })}

      {nodes.map((n, i) => {
        const p = pts[i];
        const st = STROKE[n.state];
        const bx = p.x + nodeR * 0.74;
        const by = p.y - nodeR * 0.74;
        return (
          <g key={n.id}>
            {n.recipient && <circle cx={p.x} cy={p.y} r={nodeR + 7} fill="none" stroke={BLUE} strokeWidth={2} />}
            <circle cx={p.x} cy={p.y} r={nodeR + 1} fill="#fff" />
            <g clipPath={`url(#node-${n.id})`}>
              <svg x={p.x - nodeR} y={p.y - nodeR} width={nodeR * 2} height={nodeR * 2} viewBox="-1 -1 7 7" shapeRendering="crispEdges">
                <IdenticonShapes address={n.id} />
              </svg>
            </g>
            <circle cx={p.x} cy={p.y} r={nodeR} fill="none" stroke={st.color} strokeWidth={st.width} />
            {n.state === "paid" && (
              <g>
                <circle cx={bx} cy={by} r={badge} fill={BLUE} stroke="#fff" strokeWidth={1.5} />
                <Tick x={bx} y={by - 0.4} s={badge / 14} />
              </g>
            )}
            {n.state === "missed" && (
              <g>
                <circle cx={bx} cy={by} r={badge} fill={BLACK} stroke="#fff" strokeWidth={1.5} />
                <Cross x={bx} y={by} s={badge / 14} />
              </g>
            )}
            {n.received && n.state !== "paid" && n.state !== "missed" && (
              <g>
                <circle cx={bx} cy={by} r={badge} fill={BLUE} stroke="#fff" strokeWidth={1.5} />
                <Tick x={bx} y={by - 0.4} s={badge / 14} />
              </g>
            )}
            {showLabels && (n.you || n.recipient) && (
              <text x={p.x} y={p.y + nodeR + (n.recipient ? 24 : 18)} textAnchor="middle" fill={n.recipient ? BLUE : BLACK} fontSize={12} fontWeight={700}>
                {n.you && n.recipient ? "You take the pot" : n.you ? "You" : "Takes the pot"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ───────────────────────────────────────────── landing demo

export const DEMO_MEMBERS = ["Alex", "John", "Sarah", "Mike", "David"];

export type DemoPhase = "collect" | "payout" | "rest";

/**
 * Five friends pay 100 MUSD each round and the 500 MUSD pot goes to whoever's turn it is,
 * the same way the contract runs a rotating circle.
 */
export function RotationDemo({ onRound }: { onRound?: (round: number, phase: DemoPhase) => void }) {
  const reduce = useReducedMotion();
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>("collect");
  const [cycle, setCycle] = useState(0);
  const pts = useMemo(() => positions(DEMO_MEMBERS.length, 160), []);

  useEffect(() => onRound?.(round, phase), [round, phase, onRound]);

  useEffect(() => {
    const t = (ms: number, fn: () => void) => setTimeout(fn, reduce ? ms * 1.6 : ms);
    let id: ReturnType<typeof setTimeout>;
    if (phase === "collect") id = t(1800, () => setPhase("payout"));
    else if (phase === "payout") id = t(1500, () => setPhase("rest"));
    else
      id = t(1100, () => {
        if (round === DEMO_MEMBERS.length - 1) {
          setRound(0);
          setCycle((c) => c + 1);
        } else setRound((r) => r + 1);
        setPhase("collect");
      });
    return () => clearTimeout(id);
  }, [phase, round, reduce]);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-label="Five friends take turns receiving the pot">
      <circle cx={C} cy={C} r={160} fill="none" stroke="#e5e5e5" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={82} fill="#ffffff" stroke={BLACK} strokeWidth={1.5} />
      <text x={C} y={C - 24} textAnchor="middle" fill={SOFT} fontSize={13} fontWeight={600}>
        Round {round + 1} pot
      </text>
      <text x={C} y={C + 14} textAnchor="middle" className="font-display" fill={BLACK} fontSize={34}>
        {phase === "rest" ? "0" : "500"}
      </text>
      <text x={C} y={C + 35} textAnchor="middle" fill={SOFT} fontSize={12} fontWeight={600}>
        MUSD
      </text>

      {phase === "collect" &&
        !reduce &&
        DEMO_MEMBERS.map((_, i) => (
          <motion.circle
            key={`in-${cycle}-${round}-${i}`}
            r={7}
            fill={BLUE}
            stroke="#fff"
            strokeWidth={2}
            initial={{ cx: pts[i].x, cy: pts[i].y, opacity: 0 }}
            animate={{ cx: C, cy: C, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.85, delay: 0.12 * i, ease: [0.4, 0, 0.2, 1] }}
          />
        ))}

      {phase === "payout" && !reduce && (
        <motion.circle
          key={`out-${cycle}-${round}`}
          r={15}
          fill={BLUE}
          stroke="#fff"
          strokeWidth={3}
          initial={{ cx: C, cy: C, opacity: 0 }}
          animate={{ cx: pts[round].x, cy: pts[round].y, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.1, ease: [0.5, 0, 0.2, 1] }}
        />
      )}

      {DEMO_MEMBERS.map((name, i) => {
        const p = pts[i];
        const got = i < round || (i === round && phase !== "collect");
        const isRecipient = i === round;
        return (
          <g key={name}>
            {isRecipient && <circle cx={p.x} cy={p.y} r={36} fill="none" stroke={BLUE} strokeWidth={2.5} />}
            <circle cx={p.x} cy={p.y} r={28} fill={got ? BLUE : "#fff"} stroke={got ? BLUE : BLACK} strokeWidth={1.5} />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fill={got ? "#fff" : BLACK} fontSize={15} fontWeight={700}>
              {name[0]}
            </text>
            <text x={p.x} y={p.y + (p.y > C ? 54 : -44)} textAnchor="middle" fill={BLACK} fontSize={13} fontWeight={600}>
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
