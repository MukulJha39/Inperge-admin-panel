/**
 * A Material Icons glyph, drawn from the same icon set the merchant app uses, so a
 * unit's icon looks identical in both places. `name` is the icon's ligature name,
 * for example "scale" or "water_drop".
 */
export function MaterialIcon({ name, size = 20, label }: { name: string; size?: number; label?: string }) {
  return (
    <span
      className="material-icons"
      style={{ fontSize: size, lineHeight: 1, width: size, height: size, overflow: 'hidden' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {name}
    </span>
  );
}
