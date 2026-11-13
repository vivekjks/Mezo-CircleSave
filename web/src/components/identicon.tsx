import clsx from "clsx";

/** 5×5 mirrored pattern derived from an address, like a GitHub identicon. */
export function identiconCells(address: string): boolean[] {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const cells: boolean[] = new Array(25).fill(false);
  let filled = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const on = parseInt(hex[(row * 3 + col) * 2 + 1], 16) % 2 === 0;
      if (!on) continue;
      cells[row * 5 + col] = true;
      cells[row * 5 + (4 - col)] = true;
      filled += col === 2 ? 1 : 2;
    }
  }
  if (filled < 5) for (let row = 0; row < 5; row++) cells[row * 5 + 2] = true;
  return cells;
}

/** The pattern as SVG rects in a 5×5 coordinate space (with a 1-unit margin). */
export function IdenticonShapes({ address, color = "#1d4ed8" }: { address: string; color?: string }) {
  const cells = identiconCells(address);
  return (
    <>
      <rect x={-1} y={-1} width={7} height={7} fill="#ffffff" />
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1.02} height={1.02} fill={color} /> : null,
      )}
    </>
  );
}

export function Identicon({
  address,
  size = 28,
  active,
  className,
}: {
  address: string;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 overflow-hidden rounded-[7px] border bg-white",
        active ? "border-ink" : "border-rule-strong",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="-1 -1 7 7" width="100%" height="100%" shapeRendering="crispEdges">
        <IdenticonShapes address={address} />
      </svg>
    </span>
  );
}
