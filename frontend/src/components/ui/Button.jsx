export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center px-4 py-2 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ink/20 disabled:opacity-40';
  const variants = {
    primary: 'bg-ink text-parchment hover:bg-ink/80',
    secondary: 'text-ink border border-ink/15 hover:border-ink/30',
    ghost: 'text-ink/60 hover:text-ink',
  };
  return <button className={`${base} ${variants[variant] ?? variants.primary} ${className}`} {...props}>{children}</button>;
}
