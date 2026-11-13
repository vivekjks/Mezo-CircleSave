import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  const dots = 8;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / dots) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={16 + Math.cos(a) * 11.5}
            cy={16 + Math.sin(a) * 11.5}
            r={i === 0 ? 3.6 : 2.6}
            fill={i === 0 ? "#1d4ed8" : "#000000"}
          />
        );
      })}
      <circle cx={16} cy={16} r={4.2} fill="none" stroke="#000000" strokeWidth={1.8} />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-md text-ink" aria-label="CircleSave home">
      <LogoMark />
      <span className="font-display text-[21px] leading-none whitespace-nowrap">CircleSave</span>
    </Link>
  );
}
