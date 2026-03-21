export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variants = {
    primary: 'bg-ink text-white hover:bg-ink/80 focus:ring-ink',
    secondary: 'bg-parchment text-ink border border-ink/20 hover:bg-ink/5 focus:ring-ink',
    ghost: 'text-ink hover:bg-ink/5 focus:ring-ink',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}
