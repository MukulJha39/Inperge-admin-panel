interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, photoUrl, size = 'md' }: AvatarProps) {
  const className = `avatar${size !== 'md' ? ` avatar--${size}` : ''}`;

  if (photoUrl) {
    // The surrounding row already carries the name as text, so the image is decorative.
    return (
      <span className={className}>
        <img src={photoUrl} alt="" loading="lazy" />
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
