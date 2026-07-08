export interface FloatingViewport {
  width: number;
  height: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

export interface FloatingPoint {
  x: number;
  y: number;
}

export interface FloatingPosition {
  top: number;
  left: number;
  placement: "bottom-start" | "bottom-end" | "top-start" | "top-end";
}

export interface ResolveFloatingPositionOptions {
  anchor: FloatingPoint;
  floatingSize: FloatingSize;
  viewport: FloatingViewport;
  padding?: number;
  offset?: number;
  preferredPlacement?: FloatingPosition["placement"];
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) {
    return minimum;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function resolveHorizontalPosition(
  anchor: FloatingPoint,
  floatingSize: FloatingSize,
  viewport: FloatingViewport,
  padding: number,
  placement: FloatingPosition["placement"],
) {
  const preferredLeft = placement.endsWith("end")
    ? anchor.x - floatingSize.width
    : anchor.x;

  return clamp(
    preferredLeft,
    padding,
    viewport.width - floatingSize.width - padding,
  );
}

function resolveVerticalPosition(
  anchor: FloatingPoint,
  floatingSize: FloatingSize,
  viewport: FloatingViewport,
  padding: number,
  offset: number,
  placement: FloatingPosition["placement"],
) {
  if (placement.startsWith("top")) {
    return anchor.y - floatingSize.height - offset;
  }

  return anchor.y + offset;
}

function flipPlacement(
  placement: FloatingPosition["placement"],
): FloatingPosition["placement"] {
  if (placement === "bottom-start") {
    return "top-start";
  }

  if (placement === "bottom-end") {
    return "top-end";
  }

  if (placement === "top-start") {
    return "bottom-start";
  }

  return "bottom-end";
}

export function resolveFloatingPosition({
  anchor,
  floatingSize,
  viewport,
  padding = 12,
  offset = 6,
  preferredPlacement = "bottom-start",
}: ResolveFloatingPositionOptions): FloatingPosition {
  const preferredTop = resolveVerticalPosition(
    anchor,
    floatingSize,
    viewport,
    padding,
    offset,
    preferredPlacement,
  );
  const preferredFits =
    preferredTop >= padding &&
    preferredTop + floatingSize.height <= viewport.height - padding;

  const placement = preferredFits ? preferredPlacement : flipPlacement(preferredPlacement);
  const top = clamp(
    resolveVerticalPosition(anchor, floatingSize, viewport, padding, offset, placement),
    padding,
    viewport.height - floatingSize.height - padding,
  );
  const left = resolveHorizontalPosition(
    anchor,
    floatingSize,
    viewport,
    padding,
    placement,
  );

  return {
    top,
    left,
    placement,
  };
}

export function resolveFloatingPositionFromMouseEvent(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  options: Omit<ResolveFloatingPositionOptions, "anchor">,
) {
  return resolveFloatingPosition({
    ...options,
    anchor: {
      x: event.clientX,
      y: event.clientY,
    },
  });
}
